import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Тести `buildRagContext()` — preemptive RAG-injection в `/api/chat`.
 *
 * Покриваємо matrix short-circuit-ів (всі без помилки клієнту):
 *   1. `AI_MEMORY_ENABLED=false` → no-op (повертає baseContext без recall).
 *   2. `AI_MEMORY_RAG_TOP_K=0` → no-op (A/B вимикач).
 *   3. `userId=null` (анонім) → no-op.
 *   4. порожній / занадто короткий query → no-op.
 *   5. happy-path: append RAG-блок до baseContext, форматує дату/source/content.
 *   6. timeout > RAG_TIMEOUT_MS → no-op + warn-лог (не падає).
 *   7. service.recall() кидає → no-op + warn-лог.
 *   8. порожній baseContext + happy memories → ragBlock без leading "\n".
 *   9. lastUserContent шукає ОСТАННЄ user-повідомлення (skip trailing assistant).
 */

const { recallMock, aiMemoryMock, envMock, loggerMock } = vi.hoisted(() => {
  const recallMock = vi.fn();
  const aiMemoryMock = {
    remember: vi.fn(),
    recall: recallMock,
    forgetUser: vi.fn(),
    forgetSource: vi.fn(),
    health: vi.fn(),
  };
  const envMock = {
    AI_MEMORY_ENABLED: true,
    AI_MEMORY_RAG_TOP_K: 4,
    AI_MEMORY_TOP_K: 8,
  };
  const loggerMock = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return { recallMock, aiMemoryMock, envMock, loggerMock };
});

vi.mock("./bootstrap.js", () => ({
  getAiMemory: () => aiMemoryMock,
  __resetAiMemoryForTesting: vi.fn(),
}));

vi.mock("../../env.js", () => ({
  env: envMock,
}));

vi.mock("../../obs/logger.js", () => ({
  logger: loggerMock,
}));

import { buildRagContext } from "./ragContext.js";

beforeEach(() => {
  recallMock.mockReset();
  loggerMock.info.mockReset();
  loggerMock.warn.mockReset();
  envMock.AI_MEMORY_ENABLED = true;
  envMock.AI_MEMORY_RAG_TOP_K = 4;
});
afterEach(() => {
  vi.useRealTimers();
});

const SHORT_CONTEXT = "TIME-FIRST контекст";
const LONG_QUERY = "Що я їв на сніданок учора?";

function userMsg(content: string) {
  return { role: "user", content };
}

describe("buildRagContext — short-circuit (no recall)", () => {
  it("AI_MEMORY_ENABLED=false → повертає baseContext без recall", async () => {
    envMock.AI_MEMORY_ENABLED = false;
    const out = await buildRagContext({
      userId: "u1",
      baseContext: SHORT_CONTEXT,
      messages: [userMsg(LONG_QUERY)],
    });
    expect(out).toBe(SHORT_CONTEXT);
    expect(recallMock).not.toHaveBeenCalled();
  });

  it("AI_MEMORY_RAG_TOP_K=0 → no-op (A/B вимикач)", async () => {
    envMock.AI_MEMORY_RAG_TOP_K = 0;
    const out = await buildRagContext({
      userId: "u1",
      baseContext: SHORT_CONTEXT,
      messages: [userMsg(LONG_QUERY)],
    });
    expect(out).toBe(SHORT_CONTEXT);
    expect(recallMock).not.toHaveBeenCalled();
  });

  it("userId=null (анонім) → no-op", async () => {
    const out = await buildRagContext({
      userId: null,
      baseContext: SHORT_CONTEXT,
      messages: [userMsg(LONG_QUERY)],
    });
    expect(out).toBe(SHORT_CONTEXT);
    expect(recallMock).not.toHaveBeenCalled();
  });

  it("userId=undefined → no-op", async () => {
    const out = await buildRagContext({
      userId: undefined,
      baseContext: SHORT_CONTEXT,
      messages: [userMsg(LONG_QUERY)],
    });
    expect(out).toBe(SHORT_CONTEXT);
    expect(recallMock).not.toHaveBeenCalled();
  });

  it("query <6 символів → no-op", async () => {
    const out = await buildRagContext({
      userId: "u1",
      baseContext: SHORT_CONTEXT,
      messages: [userMsg("hi")],
    });
    expect(out).toBe(SHORT_CONTEXT);
    expect(recallMock).not.toHaveBeenCalled();
  });

  it("messages=[] (немає user повідомлень) → no-op", async () => {
    const out = await buildRagContext({
      userId: "u1",
      baseContext: SHORT_CONTEXT,
      messages: [],
    });
    expect(out).toBe(SHORT_CONTEXT);
    expect(recallMock).not.toHaveBeenCalled();
  });

  it("trailing assistant-message → no-op (не плутати з user)", async () => {
    const out = await buildRagContext({
      userId: "u1",
      baseContext: SHORT_CONTEXT,
      messages: [
        { role: "assistant", content: "Привіт!" },
        { role: "assistant", content: "Чим я можу допомогти?" },
      ],
    });
    expect(out).toBe(SHORT_CONTEXT);
    expect(recallMock).not.toHaveBeenCalled();
  });
});

describe("buildRagContext — happy path", () => {
  it("→ суфіксує RAG-блок до baseContext", async () => {
    recallMock.mockResolvedValue([
      {
        id: 1,
        source: "nutrition",
        sourceRef: "meal-1",
        content: "Сніданок: omelette + кава",
        score: 0.92,
        createdAt: new Date("2026-04-30T08:30:00Z"),
        embeddingMeta: {
          provider: "voyage",
          model: "voyage-3.5-lite",
          version: "1",
          dim: 1024,
        },
        metadata: {},
      },
      {
        id: 2,
        source: "fizruk",
        sourceRef: null,
        content: "Тренування: присідання 5×5",
        score: 0.81,
        createdAt: new Date("2026-04-29T10:00:00Z"),
        embeddingMeta: {
          provider: "voyage",
          model: "voyage-3.5-lite",
          version: "1",
          dim: 1024,
        },
        metadata: {},
      },
    ]);
    const out = await buildRagContext({
      userId: "u1",
      baseContext: SHORT_CONTEXT,
      messages: [userMsg(LONG_QUERY)],
    });
    expect(recallMock).toHaveBeenCalledTimes(1);
    expect(recallMock).toHaveBeenCalledWith({
      userId: "u1",
      query: LONG_QUERY,
      topK: 4,
    });
    expect(out.startsWith(SHORT_CONTEXT)).toBe(true);
    expect(out).toContain("СХОЖІ ЗАПИСИ З ПАМʼЯТІ КОРИСТУВАЧА");
    expect(out).toContain("Харчування");
    expect(out).toContain("Фізрук");
    expect(out).toContain("2026-04-30");
    expect(out).toContain("Сніданок: omelette + кава");
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "ai_memory_rag_injected", count: 2 }),
    );
  });

  it("→ truncate-ить content > 200 символів", async () => {
    const longContent = "x".repeat(300);
    recallMock.mockResolvedValue([
      {
        id: 1,
        source: "chat",
        sourceRef: null,
        content: longContent,
        score: 0.5,
        createdAt: new Date("2026-04-30T00:00:00Z"),
        embeddingMeta: {
          provider: "voyage",
          model: "voyage-3.5-lite",
          version: "1",
          dim: 1024,
        },
        metadata: {},
      },
    ]);
    const out = await buildRagContext({
      userId: "u1",
      baseContext: "",
      messages: [userMsg(LONG_QUERY)],
    });
    expect(out).toContain("\u2026");
    expect(out).toContain("x".repeat(200));
    expect(out).not.toContain("x".repeat(201));
  });

  it("→ baseContext порожній + happy memories → ragBlock без leading \\n", async () => {
    recallMock.mockResolvedValue([
      {
        id: 1,
        source: "chat",
        sourceRef: null,
        content: "memo",
        score: 0.5,
        createdAt: new Date("2026-04-30T00:00:00Z"),
        embeddingMeta: {
          provider: "voyage",
          model: "voyage-3.5-lite",
          version: "1",
          dim: 1024,
        },
        metadata: {},
      },
    ]);
    const out = await buildRagContext({
      userId: "u1",
      baseContext: "",
      messages: [userMsg(LONG_QUERY)],
    });
    expect(out.startsWith("\n")).toBe(false);
    expect(out.startsWith("СХОЖІ ЗАПИСИ")).toBe(true);
  });

  it("→ memories=[] → повертає baseContext без блоку", async () => {
    recallMock.mockResolvedValue([]);
    const out = await buildRagContext({
      userId: "u1",
      baseContext: SHORT_CONTEXT,
      messages: [userMsg(LONG_QUERY)],
    });
    expect(out).toBe(SHORT_CONTEXT);
    expect(loggerMock.info).not.toHaveBeenCalled();
  });

  it("→ бере найновіший user-message з історії", async () => {
    recallMock.mockResolvedValue([]);
    await buildRagContext({
      userId: "u1",
      baseContext: SHORT_CONTEXT,
      messages: [
        userMsg("старий запит про їжу"),
        { role: "assistant", content: "Гаразд." },
        userMsg("новий запит про спорт"),
      ],
    });
    expect(recallMock).toHaveBeenCalledWith({
      userId: "u1",
      query: "новий запит про спорт",
      topK: 4,
    });
  });
});

describe("buildRagContext — failure (graceful no-op)", () => {
  it("→ recall кидає → повертає baseContext + warn-лог", async () => {
    recallMock.mockRejectedValue(new Error("Voyage 5xx"));
    const out = await buildRagContext({
      userId: "u1",
      baseContext: SHORT_CONTEXT,
      messages: [userMsg(LONG_QUERY)],
    });
    expect(out).toBe(SHORT_CONTEXT);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "ai_memory_rag_error",
        userId: "u1",
        err: "Voyage 5xx",
      }),
    );
  });

  it("→ recall зависає > RAG_TIMEOUT_MS → повертає baseContext + timeout-warn", async () => {
    // recall ніколи не resolve-иться
    let pendingResolve: () => void = () => {};
    recallMock.mockImplementation(
      () =>
        new Promise<unknown[]>((resolve) => {
          pendingResolve = () => resolve([]);
        }),
    );
    vi.useFakeTimers();
    const promise = buildRagContext({
      userId: "u1",
      baseContext: SHORT_CONTEXT,
      messages: [userMsg(LONG_QUERY)],
    });
    // штовхаємо час > 1500мс → timeout-гілка переможе race-у
    await vi.advanceTimersByTimeAsync(1600);
    const out = await promise;
    expect(out).toBe(SHORT_CONTEXT);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "ai_memory_rag_timeout" }),
    );
    pendingResolve(); // cleanup
  });
});
