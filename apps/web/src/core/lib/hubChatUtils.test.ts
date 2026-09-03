// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ApiError } from "@sergeant/api-client";
import {
  getActiveModule,
  friendlyApiError,
  friendlyChatError,
  consumeHubChatSse,
  newMsgId,
  makeAssistantMsg,
  makeUserMsg,
  normalizeStoredMessages,
  ls,
  lsSet,
  fmt,
  requestIdle,
  cancelIdle,
  isHelpCommand,
  CHAT_AUTH_REQUIRED_TEXT,
} from "./hubChatUtils";
import { formatNumberUk } from "@sergeant/shared";

function setHash(hash: string): void {
  window.location.hash = hash;
}

describe("getActiveModule", () => {
  afterEach(() => setHash(""));
  it("returns the active module for known hashes", () => {
    setHash("#/finyk");
    expect(getActiveModule()).toBe("finyk");
    setHash("#/fizruk/details");
    expect(getActiveModule()).toBe("fizruk");
    setHash("#routine");
    expect(getActiveModule()).toBe("routine");
    setHash("#/nutrition?tab=menu");
    expect(getActiveModule()).toBe("nutrition");
  });
  it("returns null for unknown hashes", () => {
    setHash("#/settings");
    expect(getActiveModule()).toBeNull();
    setHash("");
    expect(getActiveModule()).toBeNull();
  });
});

describe("friendlyApiError", () => {
  // Regression (аудит `web-qa-pre-beta.md` § 11, 2026-09-03): гілка чекала
  // `status === 500` і маркер у ТЕКСТІ, а `requireChatUpstreamKey` віддає
  // 503 з нейтральним `error` і маркером у `body.code` — тобто рівно ту
  // форму, що нижче. До фіксу цей кейс мапився в серверний текст.
  it("special-cases the missing upstream key by `code`, on the real 503 shape", () => {
    expect(
      friendlyApiError(
        503,
        "AI-помічник тимчасово недоступний. Спробуй пізніше.",
        "ANTHROPIC_KEY_MISSING",
      ),
    ).toBe("Чат на сервері не налаштовано (немає ключа AI).");
  });
  it("without the code a 503 with a body stays the server's own text", () => {
    // Той самий статус без маркера — це звичайний збій upstream-у, і
    // серверне пояснення конкретніше за текст про відсутній ключ.
    expect(
      friendlyApiError(
        503,
        "AI-помічник тимчасово недоступний. Спробуй пізніше.",
      ),
    ).toBe("AI-помічник тимчасово недоступний. Спробуй пізніше.");
  });
  it("special-cases AI quota on 429", () => {
    expect(friendlyApiError(429, "AI_QUOTA exceeded")).toBe(
      "Денний ліміт AI вичерпано. Спробуй завтра або зменш навантаження.",
    );
    expect(friendlyApiError(429, "ліміт AI")).toContain("Денний ліміт AI");
  });
  it("passes the server copy through for a preset weekly quota block", () => {
    // Копія цього випадку живе на сервері (`assertAiQuota`) в одному
    // екземплярі — мапер не має права її переписати на «спробуй завтра»,
    // бо у сценарного пресета відро ТИЖНЕВЕ, і вихід інший.
    const serverCopy =
      "Сценарій на цей тиждень вичерпано. Заповни профіль вручну в налаштуваннях.";
    expect(friendlyApiError(429, serverCopy, "AI_QUOTA_PRESET")).toBe(
      serverCopy,
    );
  });
  // Гілки `AI_QUOTA_ANON` більше немає: сервер прибрав анонімне квотне відро,
  // `/api/chat` session-gated, тож анонім упирається в 401, а не 429. Код
  // проходить повз спецкейс і мапиться загальним правилом 429 — а той (AI-3)
  // тепер віддає РЕАЛЬНЕ серверне повідомлення (rate-limit копія називає
  // конкретний час очікування), а не фіксований текст.
  it("no longer special-cases the retired AI_QUOTA_ANON code", () => {
    expect(
      friendlyApiError(
        429,
        "Забагато запитів. Спробуй через 12 секунд.",
        "AI_QUOTA_ANON",
      ),
    ).toBe("Забагато запитів. Спробуй через 12 секунд.");
  });
  // Regression (browser QA 2026-08-23): `/api/chat` за `requireSession()`
  // віддавав аноніму 401, загальний мапер робив із цього «Доступ заборонено.»,
  // а `friendlyChatError` — «Помилка: Доступ заборонено.». Жодного натяку на
  // вхід. Гейт лишається, змінюється тільки те, що продукт про нього каже.
  it("names the way out on 401/403 instead of a bare «access denied»", () => {
    expect(friendlyApiError(401, "Unauthorized")).toBe(CHAT_AUTH_REQUIRED_TEXT);
    expect(friendlyApiError(403, "Forbidden")).toBe(CHAT_AUTH_REQUIRED_TEXT);
    expect(CHAT_AUTH_REQUIRED_TEXT).toContain("Увійди");
  });
  it("delegates to base mapper otherwise", () => {
    const out = friendlyApiError(404, "not found");
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

it("шлюзові збої дістають текст із дією, а не голий номер", () => {
  // Саме 504 і побачив власник на екрані 2026-09-02. У чату немає
  // caller-fallback-у, тож «Помилка 504» доїжджала просто до людини.
  expect(friendlyApiError(504)).toBe(
    "Сервер не встиг відповісти. Спробуй ще раз.",
  );
  expect(friendlyApiError(502)).toBe(
    "Сервер тимчасово недоступний. Спробуй за хвилину.",
  );
  expect(friendlyApiError(503)).toBe(
    "Сервер тимчасово недоступний. Спробуй за хвилину.",
  );
  // Серверне повідомлення, якщо воно є, конкретніше за наш загальний текст.
  expect(friendlyApiError(502, "upstream down")).toBe("upstream down");
});

describe("friendlyChatError", () => {
  it("maps network errors", () => {
    expect(friendlyChatError(new Error("Failed to fetch"))).toBe(
      "Немає зʼєднання з мережею або сервер недоступний.",
    );
    expect(friendlyChatError(new Error("network down"))).toContain("мережею");
  });
  it("keeps the auth hint after the API mapper already rewrote the message", () => {
    // Саме цей шлях і давав «Помилка: Доступ заборонено.»: `useChatSend`
    // перезаписує `message` через `friendlyApiError` ДО того, як помилка
    // дійде сюди, тож стара гілка по «Потрібна автентифікація» була мертва.
    expect(friendlyChatError(new Error(CHAT_AUTH_REQUIRED_TEXT))).toBe(
      CHAT_AUTH_REQUIRED_TEXT,
    );
    expect(friendlyChatError(new Error("Доступ заборонено."))).toBe(
      CHAT_AUTH_REQUIRED_TEXT,
    );
    expect(friendlyChatError(new Error("Потрібна автентифікація"))).toBe(
      CHAT_AUTH_REQUIRED_TEXT,
    );
  });
  it("НЕ обгортає вдруге текст, який уже пройшов friendlyApiError", () => {
    // Рівно той баг, який власник побачив на екрані 2026-09-02:
    // «Помилка: Помилка 504». `useChatSend` перезаписує `message` готовим
    // текстом, а ця функція наліплювала префікс поверх.
    const gateway = new ApiError({
      kind: "http",
      message: "Сервер не встиг відповісти. Спробуй ще раз.",
      status: 504,
      url: "/api/chat",
    });
    expect(friendlyChatError(gateway)).toBe(
      "Сервер не встиг відповісти. Спробуй ще раз.",
    );
    expect(friendlyChatError(gateway)).not.toContain("Помилка: Помилка");

    // Навіть коли текст усе-таки почався з «Помилка N» (статус без власної
    // гілки), подвоєння немає: рішення береться за ТИПОМ помилки.
    const bare = new ApiError({
      kind: "http",
      message: "Помилка 418",
      status: 418,
      url: "/api/chat",
    });
    expect(friendlyChatError(bare)).toBe("Помилка 418");
  });

  it("wraps other errors", () => {
    // Сирі помилки префікс зберігають: без нього «boom» не читається як збій.
    expect(friendlyChatError(new Error("boom"))).toBe("Помилка: boom");
    expect(friendlyChatError("string err")).toBe("Помилка: string err");
    // Мережева гілка не є HTTP-помилкою, тож лишається як була.
    const offline = new ApiError({
      kind: "network",
      message: "Failed to fetch",
      url: "/api/chat",
    });
    expect(friendlyChatError(offline)).toBe(
      "Немає зʼєднання з мережею або сервер недоступний.",
    );
  });
});

function sseResponse(chunks: string[]): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(stream);
}

describe("consumeHubChatSse", () => {
  it("emits deltas and stops on [DONE]", async () => {
    const deltas: string[] = [];
    await consumeHubChatSse(
      sseResponse([
        'data: {"t":"Hello"}\n',
        'data: {"t":" world"}\n',
        "data: [DONE]\n",
        'data: {"t":"ignored"}\n',
      ]),
      (d) => deltas.push(d),
    );
    expect(deltas).toEqual(["Hello", " world"]);
  });

  it("returns immediately when no body", async () => {
    const r = new Response(null);
    Object.defineProperty(r, "body", { value: null });
    const deltas: string[] = [];
    await consumeHubChatSse(r, (d) => deltas.push(d));
    expect(deltas).toEqual([]);
  });

  it("skips non-data lines and malformed JSON", async () => {
    const deltas: string[] = [];
    await consumeHubChatSse(
      sseResponse([": comment\n", "data: not-json\n", 'data: {"t":"ok"}\n']),
      (d) => deltas.push(d),
    );
    expect(deltas).toEqual(["ok"]);
  });

  it("throws on server err payload", async () => {
    await expect(
      consumeHubChatSse(
        sseResponse(['data: {"err":"server boom"}\n']),
        () => {},
      ),
    ).rejects.toThrow("server boom");
  });

  it("throws when a single line exceeds the per-line byte cap", async () => {
    const huge = "data: " + "z".repeat(9000); // > 8KB, no newline
    await expect(
      consumeHubChatSse(sseResponse([huge]), () => {}),
    ).rejects.toThrow("Відповідь занадто довга");
  });
});

describe("message helpers", () => {
  it("newMsgId returns a non-empty string", () => {
    expect(typeof newMsgId()).toBe("string");
    expect(newMsgId().length).toBeGreaterThan(0);
    expect(newMsgId()).not.toBe(newMsgId());
  });
  it("makeAssistantMsg / makeUserMsg", () => {
    const a = makeAssistantMsg("hi");
    expect(a).toMatchObject({ role: "assistant", text: "hi" });
    const u = makeUserMsg("yo");
    expect(u).toMatchObject({ role: "user", text: "yo" });
  });
});

describe("normalizeStoredMessages", () => {
  it("returns greeting for empty input", () => {
    const msgs = normalizeStoredMessages(null);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.role).toBe("assistant");
    expect(msgs[0]!.text).toContain("Привіт");
  });
  it("normalizes stored messages and synthesizes ids", () => {
    const msgs = normalizeStoredMessages([
      { role: "user", text: "hi" },
      { text: "no role no id" },
    ]);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe("user");
    expect(msgs[1]!.role).toBe("assistant");
    expect(typeof msgs[1]!.id).toBe("string");
    expect((msgs[1]!.id ?? "").startsWith("legacy_")).toBe(true);
  });
});

describe("ls / lsSet", () => {
  beforeEach(() => localStorage.clear());
  it("round-trips JSON values", () => {
    lsSet("k", { a: 1 });
    expect(ls("k", null)).toEqual({ a: 1 });
  });
  it("returns fallback for missing keys", () => {
    expect(ls("missing", "fb")).toBe("fb");
  });
});

describe("fmt", () => {
  it("rounds and localizes", () => {
    expect(fmt(1234.6)).toBe(formatNumberUk(1235));
    expect(fmt(0)).toBe("0");
  });
});

describe("requestIdle / cancelIdle", () => {
  afterEach(() => vi.useRealTimers());
  it("schedules and cancels via setTimeout fallback", () => {
    vi.useFakeTimers();
    const orig = window.requestIdleCallback;
    // Force the setTimeout fallback path.
    // @ts-expect-error test override
    window.requestIdleCallback = undefined;
    const cb = vi.fn();
    const handle = requestIdle(cb);
    cancelIdle(handle);
    vi.runAllTimers();
    expect(cb).not.toHaveBeenCalled();
    window.requestIdleCallback = orig;
  });
  it("runs callback when not cancelled", () => {
    vi.useFakeTimers();
    const orig = window.requestIdleCallback;
    // @ts-expect-error test override
    window.requestIdleCallback = undefined;
    const cb = vi.fn();
    requestIdle(cb);
    vi.runAllTimers();
    expect(cb).toHaveBeenCalledTimes(1);
    window.requestIdleCallback = orig;
  });
});

describe("isHelpCommand", () => {
  it("matches help command variants", () => {
    expect(isHelpCommand("/help")).toBe(true);
    expect(isHelpCommand("  /допомога  ")).toBe(true);
    expect(isHelpCommand("/команди")).toBe(true);
    expect(isHelpCommand("/інструменти")).toBe(true);
  });
  it("rejects non-help text", () => {
    expect(isHelpCommand("help me")).toBe(false);
    expect(isHelpCommand("/help now")).toBe(false);
  });
});
