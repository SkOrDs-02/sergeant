/**
 * Метрики якості retrieval-у AI-памʼяті.
 *
 * WHY цей тест. Метрика існує рівно заради одного питання — «чи варто міняти
 * `voyage-3.5-lite`» — і відповідь на нього буде хибною у двох випадках:
 *
 *   1. Ранні виходи `recall()` (вимкнено, немає згоди, `topK <= 0`) потраплять
 *      у лічильник як `empty`. Тоді вимкнена згода читатиметься як поганий
 *      пошук, і модель поміняють через те, що користувач не дав дозволу.
 *   2. У логи доїде вміст памʼяті. Це персональні дані (Hard Rule #21), і
 *      логувати їх не можна навіть заради діагностики.
 *
 * Обидва — тихі: жоден не впаде в ран-таймі, обидва зіпсують саме те рішення,
 * заради якого метрику й додали.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const observe = vi.fn();
const inc = vi.fn();
const debug = vi.fn();

vi.mock("../../obs/metrics.js", () => ({
  aiMemoryRecallTopScore: { observe },
  aiMemoryRecallResultsTotal: { inc },
}));

vi.mock("../../obs/logger.js", () => ({
  logger: { debug, info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../env.js", () => ({
  env: { AI_MEMORY_ENABLED: true, AI_MEMORY_TOP_K: 5 },
}));
vi.mock("../../env/env.js", () => ({
  env: { AI_MEMORY_ENABLED: true, AI_MEMORY_TOP_K: 5 },
}));

vi.mock("./voyageBudget.js", () => ({
  isVoyageBudgetHardExceeded: vi.fn().mockResolvedValue(false),
}));

const hit = (score: number, content = "секретний вміст памʼяті") => ({
  id: 1,
  source: "chat" as const,
  sourceRef: null,
  content,
  embeddingMeta: { model: "voyage-3.5-lite", version: 1 },
  metadata: {},
  score,
  createdAt: new Date(0),
});

// Згода інжектиться через `deps`, а не імпортом — тому підміняємо її тут,
// а не через `vi.mock`.
async function makeService(
  queryResult: ReturnType<typeof hit>[],
  consent = true,
) {
  vi.resetModules();
  const { createAiMemoryService } = await import("./service.js");
  return createAiMemoryService({
    enabled: true,
    isConsentEnabled: async () => consent,
    embeddings: { embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2]]) },
    vectorStore: {
      upsert: vi.fn(),
      query: vi.fn().mockResolvedValue(queryResult),
    },
  } as never);
}

beforeEach(() => {
  observe.mockClear();
  inc.mockClear();
  debug.mockClear();
});

describe("якість recall — метрики", () => {
  it("непорожній результат пише топ-скор і hit", async () => {
    const svc = await makeService([hit(0.82), hit(0.41)]);
    await svc.recall({ userId: "u1", query: "кава", caller: "chat-rag" });

    expect(inc).toHaveBeenCalledWith({ caller: "chat-rag", outcome: "hit" });
    expect(observe).toHaveBeenCalledWith({ caller: "chat-rag" }, 0.82);
  });

  it("порожній результат пише empty і НЕ пише скор", async () => {
    const svc = await makeService([]);
    await svc.recall({ userId: "u1", query: "кава", caller: "chat-rag" });

    expect(inc).toHaveBeenCalledWith({ caller: "chat-rag", outcome: "empty" });
    expect(observe).not.toHaveBeenCalled();
  });

  it("без caller мітка `unknown`, а не порожня", async () => {
    const svc = await makeService([hit(0.5)]);
    await svc.recall({ userId: "u1", query: "кава" });

    expect(inc).toHaveBeenCalledWith({ caller: "unknown", outcome: "hit" });
  });

  it("вимкнена згода НЕ рахується як поганий пошук", async () => {
    const svc = await makeService([hit(0.9)], false);
    const out = await svc.recall({
      userId: "u1",
      query: "кава",
      caller: "chat-rag",
    });

    expect(out).toEqual([]);
    // Ключове: жодного `empty` — інакше відсутність дозволу читалась би як
    // провал retrieval-у й тягла б за собою заміну моделі.
    expect(inc).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
  });

  it("у лог не доїжджає ні вміст памʼяті, ні текст запиту", async () => {
    const svc = await makeService([hit(0.77, "алергія на арахіс")]);
    await svc.recall({
      userId: "u1",
      query: "що я казав про алергії",
      caller: "chat-rag",
    });

    const logged = JSON.stringify(
      debug.mock.calls.filter(
        (c) => (c[0] as { msg?: string })?.msg === "ai_memory_recall_quality",
      ),
    );
    expect(logged).not.toContain("арахіс");
    expect(logged).not.toContain("алергії");
    expect(logged).toContain("topScore");
  });
});
