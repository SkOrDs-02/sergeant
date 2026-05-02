import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAiMemoryService } from "./service.js";
import type {
  EmbeddingProvider,
  MemoryQueryResult,
  MemoryWrite,
  VectorStore,
} from "./types.js";

const ENV_VARS = ["AI_MEMORY_TOP_K"] as const;
const savedEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ENV_VARS) savedEnv[k] = process.env[k];
});
afterEach(() => {
  for (const k of ENV_VARS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

/**
 * In-memory fake `VectorStore` для service-тестів. Зберігає писані
 * row-и; query робить просту brute-force-косинус.
 */
function makeFakeStore(): VectorStore & {
  rows: MemoryWrite[];
  upsertCalls: number;
  queryCalls: number;
} {
  const rows: MemoryWrite[] = [];
  let upsertCalls = 0;
  let queryCalls = 0;
  return {
    rows,
    get upsertCalls() {
      return upsertCalls;
    },
    get queryCalls() {
      return queryCalls;
    },
    async upsert(input) {
      upsertCalls++;
      rows.push(...input);
    },
    async query(opts): Promise<MemoryQueryResult[]> {
      queryCalls++;
      const filtered = rows.filter(
        (r) =>
          r.userId === opts.userId &&
          (!opts.sources || opts.sources.includes(r.source)),
      );
      // ID синтетичний — індекс у масиві.
      return filtered.slice(0, opts.topK).map((r, i) => ({
        id: i + 1,
        source: r.source,
        sourceRef: r.sourceRef,
        content: r.content,
        embeddingMeta: r.embeddingMeta,
        metadata: r.metadata ?? {},
        score: 0.9 - i * 0.01,
        createdAt: new Date(),
      }));
    },
    async deleteBySource(userId, source, sourceRef) {
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if (
          r.userId === userId &&
          r.source === source &&
          r.sourceRef === sourceRef
        ) {
          rows.splice(i, 1);
        }
      }
    },
    async deleteAllForUser(userId) {
      let count = 0;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].userId === userId) {
          rows.splice(i, 1);
          count++;
        }
      }
      return count;
    },
    async health() {
      return { ok: true, provider: "pgvector" as const };
    },
  };
}

function makeFakeEmbeddings(): EmbeddingProvider & {
  calls: number;
} {
  let calls = 0;
  return {
    meta: {
      provider: "voyage",
      model: "voyage-3.5-lite",
      version: "1",
      dim: 4,
    },
    get calls() {
      return calls;
    },
    async embedBatch(texts) {
      calls++;
      return texts.map(() => Float32Array.of(0.1, 0.2, 0.3, 0.4));
    },
  };
}

describe("AiMemoryService — disabled flag", () => {
  it("remember() — no-op якщо enabled=false", async () => {
    const store = makeFakeStore();
    const embeddings = makeFakeEmbeddings();
    const svc = createAiMemoryService({
      embeddings,
      vectorStore: store,
      enabled: false,
    });
    await svc.remember([
      {
        userId: "u1",
        source: "chat",
        sourceRef: null,
        content: "foo",
      },
    ]);
    expect(embeddings.calls).toBe(0);
    expect(store.upsertCalls).toBe(0);
  });

  it("recall() — повертає [] якщо enabled=false", async () => {
    const store = makeFakeStore();
    const embeddings = makeFakeEmbeddings();
    const svc = createAiMemoryService({
      embeddings,
      vectorStore: store,
      enabled: false,
    });
    const r = await svc.recall({ userId: "u1", query: "test" });
    expect(r).toEqual([]);
    expect(embeddings.calls).toBe(0);
    expect(store.queryCalls).toBe(0);
  });
});

describe("AiMemoryService — enabled", () => {
  it("remember() — embed-ить + upsert-ить кожен input", async () => {
    const store = makeFakeStore();
    const embeddings = makeFakeEmbeddings();
    const svc = createAiMemoryService({
      embeddings,
      vectorStore: store,
      enabled: true,
    });
    await svc.remember([
      { userId: "u1", source: "chat", sourceRef: null, content: "a" },
      { userId: "u1", source: "finyk", sourceRef: "tx-1", content: "b" },
    ]);
    expect(embeddings.calls).toBe(1);
    expect(store.upsertCalls).toBe(1);
    expect(store.rows).toHaveLength(2);
    expect(store.rows[0].embeddingMeta).toEqual(embeddings.meta);
    expect(store.rows[0].embedding).toBeInstanceOf(Float32Array);
  });

  it("remember() — no-op для пустого input", async () => {
    const store = makeFakeStore();
    const embeddings = makeFakeEmbeddings();
    const svc = createAiMemoryService({
      embeddings,
      vectorStore: store,
      enabled: true,
    });
    await svc.remember([]);
    expect(embeddings.calls).toBe(0);
    expect(store.upsertCalls).toBe(0);
  });

  it("remember() — кидає якщо provider повернув partial-result", async () => {
    const store = makeFakeStore();
    const embeddings: EmbeddingProvider = {
      meta: {
        provider: "voyage",
        model: "voyage-3.5-lite",
        version: "1",
        dim: 4,
      },
      embedBatch: async () => [Float32Array.of(0.1, 0.2, 0.3, 0.4)], // 1 vec
    };
    const svc = createAiMemoryService({
      embeddings,
      vectorStore: store,
      enabled: true,
    });
    await expect(
      svc.remember([
        { userId: "u1", source: "chat", sourceRef: null, content: "a" },
        { userId: "u1", source: "chat", sourceRef: null, content: "b" }, // 2 inputs ≠ 1 vec
      ]),
    ).rejects.toThrow(/2 inputs/);
    expect(store.upsertCalls).toBe(0);
  });

  it("recall() — embed-ить query + кличе store.query з пraвильним topK", async () => {
    const store = makeFakeStore();
    // Заздалегідь додамо row-и
    await store.upsert([
      {
        userId: "u1",
        source: "chat",
        sourceRef: null,
        content: "old chat",
        embedding: Float32Array.of(0.1, 0.2, 0.3, 0.4),
        embeddingMeta: {
          provider: "voyage",
          model: "voyage-3.5-lite",
          version: "1",
          dim: 4,
        },
      },
    ]);
    const embeddings = makeFakeEmbeddings();
    process.env.AI_MEMORY_TOP_K = "5";
    const svc = createAiMemoryService({
      embeddings,
      vectorStore: store,
      enabled: true,
    });
    const r = await svc.recall({ userId: "u1", query: "find me" });
    expect(embeddings.calls).toBe(1);
    expect(store.queryCalls).toBe(1);
    expect(r).toHaveLength(1);
    expect(r[0].content).toBe("old chat");
  });

  it("recall() — повертає [] якщо topK=0", async () => {
    const store = makeFakeStore();
    const embeddings = makeFakeEmbeddings();
    const svc = createAiMemoryService({
      embeddings,
      vectorStore: store,
      enabled: true,
    });
    const r = await svc.recall({ userId: "u1", query: "x", topK: 0 });
    expect(r).toEqual([]);
    expect(embeddings.calls).toBe(0);
  });

  it("forgetUser() — викликається навіть якщо service disabled (escape-hatch)", async () => {
    const store = makeFakeStore();
    await store.upsert([
      {
        userId: "u1",
        source: "chat",
        sourceRef: null,
        content: "a",
        embedding: Float32Array.of(0.1, 0.2, 0.3, 0.4),
        embeddingMeta: {
          provider: "voyage",
          model: "voyage-3.5-lite",
          version: "1",
          dim: 4,
        },
      },
    ]);
    const svc = createAiMemoryService({
      embeddings: makeFakeEmbeddings(),
      vectorStore: store,
      enabled: false,
    });
    const count = await svc.forgetUser("u1");
    expect(count).toBe(1);
    expect(store.rows).toHaveLength(0);
  });

  it("forgetSource() — точково видаляє конкретний source-row", async () => {
    const store = makeFakeStore();
    await store.upsert([
      {
        userId: "u1",
        source: "finyk",
        sourceRef: "tx-1",
        content: "a",
        embedding: Float32Array.of(0.1, 0.2, 0.3, 0.4),
        embeddingMeta: {
          provider: "voyage",
          model: "voyage-3.5-lite",
          version: "1",
          dim: 4,
        },
      },
      {
        userId: "u1",
        source: "finyk",
        sourceRef: "tx-2",
        content: "b",
        embedding: Float32Array.of(0.1, 0.2, 0.3, 0.4),
        embeddingMeta: {
          provider: "voyage",
          model: "voyage-3.5-lite",
          version: "1",
          dim: 4,
        },
      },
    ]);
    const svc = createAiMemoryService({
      embeddings: makeFakeEmbeddings(),
      vectorStore: store,
      enabled: true,
    });
    await svc.forgetSource("u1", "finyk", "tx-1");
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].sourceRef).toBe("tx-2");
  });

  it("recall() — кидає якщо provider повернув порожній результат", async () => {
    const store = makeFakeStore();
    const embeddings: EmbeddingProvider = {
      meta: {
        provider: "voyage",
        model: "voyage-3.5-lite",
        version: "1",
        dim: 4,
      },
      embedBatch: vi.fn(async () => []),
    };
    const svc = createAiMemoryService({
      embeddings,
      vectorStore: store,
      enabled: true,
    });
    await expect(svc.recall({ userId: "u1", query: "x" })).rejects.toThrow(
      /empty result/,
    );
  });
});
