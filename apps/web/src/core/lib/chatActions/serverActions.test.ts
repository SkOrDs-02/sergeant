// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ASYNC_CHAT_ACTION_NAMES,
  handleAsyncChatAction,
} from "./serverActions";
import type { ChatAction } from "./types";

/**
 * Тести `serverActions.ts` (recall_memory async dispatcher).
 *
 * Покриваємо:
 *   - dispatcher повертає undefined для не-recall дій;
 *   - happy path: 200 + memories[] → форматована Markdown-light строка;
 *   - empty path: 200 + memories=[] → "Не знайшов схожих" повідомлення;
 *   - 401 → авторизаційне попередження;
 *   - 503 → "AI memory тимчасово недоступне";
 *   - інший 5xx → загальна HTTP помилка;
 *   - timeout (AbortError) → "Recall таймаут — спробуй простіший запит";
 *   - network error → "Не вдалося звʼязатися з сервером для recall.";
 *   - body normalization: top_k, sources фільтр, trim;
 *   - empty query → не дзвонимо мережу.
 */

const apiUrlMock = vi.fn((p: string) => `https://srv.test${p}`);
vi.mock("../../../shared/lib/api/apiUrl", () => ({
  apiUrl: (p: string) => apiUrlMock(p),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  apiUrlMock.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function makeJsonResponse(
  body: unknown,
  init: { status?: number } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ASYNC_CHAT_ACTION_NAMES — whitelist", () => {
  it("містить recall_memory", () => {
    expect(ASYNC_CHAT_ACTION_NAMES.has("recall_memory")).toBe(true);
  });

  it("не містить sync-only tools", () => {
    expect(ASYNC_CHAT_ACTION_NAMES.has("change_category")).toBe(false);
    expect(ASYNC_CHAT_ACTION_NAMES.has("add_workout")).toBe(false);
    expect(ASYNC_CHAT_ACTION_NAMES.has("save_memory")).toBe(false);
  });
});

describe("handleAsyncChatAction — non-recall actions", () => {
  it("повертає undefined для sync-tool (передаємо sync-flow-у)", async () => {
    const action = {
      name: "change_category",
      input: { tx_id: "tx1", category_id: "food" },
    } as unknown as ChatAction;
    const result = await handleAsyncChatAction(action);
    expect(result).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("handleAsyncChatAction — recall_memory happy path", () => {
  it("→ форматує memories у читабельну Markdown-light строку", async () => {
    fetchMock.mockResolvedValueOnce(
      makeJsonResponse({
        memories: [
          {
            id: 1,
            source: "nutrition",
            sourceRef: "meal-1",
            content: "Сніданок: omelette + кава",
            score: 0.92,
            createdAt: "2026-04-30T08:30:00.000Z",
            metadata: { kcal: 420 },
          },
          {
            id: 2,
            source: "fizruk",
            sourceRef: null,
            content: "Тренування: присідання 5×5",
            score: 0.81,
            createdAt: "2026-04-29T10:00:00.000Z",
            metadata: {},
          },
        ],
      }),
    );
    const action = {
      name: "recall_memory",
      input: { query: "що я їв сьогодні", top_k: 5 },
    } as unknown as ChatAction;
    const out = await handleAsyncChatAction(action);
    expect(typeof out).toBe("string");
    expect(out).toContain('Знайшов 2 схожих записів для "що я їв сьогодні"');
    expect(out).toContain("Харчування");
    expect(out).toContain("2026-04-30");
    expect(out).toContain("92%");
    expect(out).toContain("Сніданок: omelette + кава");
    expect(out).toContain("Фізрук");
  });

  it("→ truncate-ить content > 200 символів", async () => {
    const longContent = "x".repeat(250);
    fetchMock.mockResolvedValueOnce(
      makeJsonResponse({
        memories: [
          {
            id: 1,
            source: "chat",
            sourceRef: null,
            content: longContent,
            score: 0.5,
            createdAt: "2026-04-30T00:00:00.000Z",
            metadata: {},
          },
        ],
      }),
    );
    const action = {
      name: "recall_memory",
      input: { query: "test query" },
    } as unknown as ChatAction;
    const out = (await handleAsyncChatAction(action)) as string;
    expect(out).toContain("\u2026");
    expect(out).toContain("x".repeat(200));
    expect(out).not.toContain("x".repeat(201));
  });

  it("→ повертає 'Не знайшов схожих' коли memories=[]", async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse({ memories: [] }));
    const action = {
      name: "recall_memory",
      input: { query: "noop search" },
    } as unknown as ChatAction;
    const out = await handleAsyncChatAction(action);
    expect(out).toBe('Не знайшов схожих записів для "noop search".');
  });

  it("→ передає top_k та sources у POST body", async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse({ memories: [] }));
    const action = {
      name: "recall_memory",
      input: { query: "test", top_k: 3, sources: ["chat", "fizruk"] },
    } as unknown as ChatAction;
    await handleAsyncChatAction(action);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      query: "test",
      topK: 3,
      sources: ["chat", "fizruk"],
    });
  });

  it("→ trim-ить query і не передає topK коли некоректний", async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse({ memories: [] }));
    const action = {
      name: "recall_memory",
      input: { query: "  spaced  ", top_k: -1 },
    } as unknown as ChatAction;
    await handleAsyncChatAction(action);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toEqual({ query: "spaced" });
  });

  it("→ ходить у /api/ai-memory/recall з credentials=include", async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse({ memories: [] }));
    const action = {
      name: "recall_memory",
      input: { query: "ping" },
    } as unknown as ChatAction;
    await handleAsyncChatAction(action);
    expect(apiUrlMock).toHaveBeenCalledWith("/api/ai-memory/recall");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://srv.test/api/ai-memory/recall");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
  });
});

describe("handleAsyncChatAction — recall_memory empty query short-circuit", () => {
  it("→ повертає warning без HTTP-call коли query порожній/whitespace", async () => {
    const action = {
      name: "recall_memory",
      input: { query: "   " },
    } as unknown as ChatAction;
    const out = await handleAsyncChatAction(action);
    expect(out).toBe("Потрібен непорожній query для recall_memory.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("→ повертає warning коли input відсутній", async () => {
    const action = { name: "recall_memory" } as unknown as ChatAction;
    const out = await handleAsyncChatAction(action);
    expect(out).toBe("Потрібен непорожній query для recall_memory.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("handleAsyncChatAction — recall_memory error paths", () => {
  it("→ 401 → повідомлення про авторизацію", async () => {
    fetchMock.mockResolvedValueOnce(
      makeJsonResponse({ error: "unauthorized" }, { status: 401 }),
    );
    const action = {
      name: "recall_memory",
      input: { query: "test" },
    } as unknown as ChatAction;
    const out = await handleAsyncChatAction(action);
    expect(out).toBe("Потрібна авторизація для пошуку памʼяті.");
  });

  it("→ 503 → 'AI memory тимчасово недоступне'", async () => {
    fetchMock.mockResolvedValueOnce(
      makeJsonResponse(
        { code: "EMBEDDING_PROVIDER_UNAVAILABLE" },
        { status: 503 },
      ),
    );
    const action = {
      name: "recall_memory",
      input: { query: "test" },
    } as unknown as ChatAction;
    const out = (await handleAsyncChatAction(action)) as string;
    expect(out).toContain("AI memory тимчасово недоступне");
  });

  it("→ 500 → загальне HTTP-повідомлення", async () => {
    fetchMock.mockResolvedValueOnce(
      makeJsonResponse({ code: "RECALL_FAILED" }, { status: 500 }),
    );
    const action = {
      name: "recall_memory",
      input: { query: "test" },
    } as unknown as ChatAction;
    const out = (await handleAsyncChatAction(action)) as string;
    expect(out).toContain("HTTP 500");
  });

  it("→ AbortError → 'Recall таймаут'", async () => {
    fetchMock.mockImplementationOnce(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });
    const action = {
      name: "recall_memory",
      input: { query: "test" },
    } as unknown as ChatAction;
    const out = (await handleAsyncChatAction(action)) as string;
    expect(out).toContain("таймаут");
  });

  it("→ network error → 'Не вдалося звʼязатися'", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const action = {
      name: "recall_memory",
      input: { query: "test" },
    } as unknown as ChatAction;
    const out = (await handleAsyncChatAction(action)) as string;
    expect(out).toContain("Не вдалося звʼязатися");
  });
});
