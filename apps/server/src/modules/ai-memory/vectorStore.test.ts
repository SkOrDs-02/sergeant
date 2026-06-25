import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type pg from "pg";
import { env } from "../../env.js";
import { createPgVectorStore } from "./vectorStore.js";
import type { EmbeddingMetadata, MemoryWrite } from "./types.js";

vi.mock("../../obs/logger.js", () => ({
  logger: { warn: vi.fn() },
}));

const USER_ID = "user-1";
const META: EmbeddingMetadata = {
  provider: "voyage",
  model: "voyage-3.5-lite",
  version: "1",
  dim: 1024,
};

interface ClientStub {
  query: Mock;
  release: Mock;
}

interface PoolStub extends pg.Pool {
  connect: Mock;
  query: Mock;
}

function makeClient(): ClientStub {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  };
}

function makePool(client = makeClient()): PoolStub {
  return {
    connect: vi.fn().mockResolvedValue(client),
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  } as unknown as PoolStub;
}

function write(
  overrides: Partial<MemoryWrite> = {},
  embedding = Float32Array.of(0.1, 0.2, 0.3),
): MemoryWrite {
  return {
    userId: USER_ID,
    source: "chat",
    sourceRef: "msg-1",
    content: "remember this",
    embedding,
    embeddingMeta: META,
    metadata: { topic: "test" },
    ...overrides,
  };
}

describe("createPgVectorStore", () => {
  it("upsert batches rows in one transaction and serializes embeddings/json", async () => {
    const client = makeClient();
    const pool = makePool(client);
    const store = createPgVectorStore(pool);

    await store.upsert([write()]);

    expect(client.query.mock.calls[0]?.[0]).toBe("BEGIN");
    expect(String(client.query.mock.calls[1]?.[0])).toContain(
      "INSERT INTO ai_memories",
    );
    expect(client.query.mock.calls[1]?.[1]).toEqual([
      USER_ID,
      "chat",
      "msg-1",
      "remember this",
      "[0.10000000149011612,0.20000000298023224,0.30000001192092896]",
      "voyage",
      "voyage-3.5-lite",
      "1",
      '{"topic":"test"}',
    ]);
    expect(client.query.mock.calls[2]?.[0]).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back and releases the client when an embedding is not finite", async () => {
    const client = makeClient();
    const pool = makePool(client);
    const store = createPgVectorStore(pool);

    await expect(
      store.upsert([write({}, Float32Array.of(0.1, Number.NaN))]),
    ).rejects.toThrow("Embedding contains non-finite value");

    expect(client.query.mock.calls[0]?.[0]).toBe("BEGIN");
    expect(client.query.mock.calls[1]?.[0]).toBe("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("query builds active-model/source filters and maps pg rows to results", async () => {
    const client = makeClient();
    client.query.mockImplementation((sql: string) => {
      if (/^\s*SELECT/i.test(sql)) {
        return Promise.resolve({
          rows: [
            {
              id: "42",
              source: "finyk",
              source_ref: "tx-1",
              content: "coffee",
              embedding_provider: "voyage",
              embedding_model: "voyage-3.5-lite",
              embedding_version: "1",
              metadata: { amount: 120 },
              created_at: new Date("2026-06-24T10:00:00.000Z"),
              distance: "0.5",
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });
    const store = createPgVectorStore(makePool(client));

    const result = await store.query({
      userId: USER_ID,
      embedding: Float32Array.of(0.1, 0.2),
      topK: 5,
      sources: ["finyk"],
      efSearch: 16.9,
    });

    expect(client.query.mock.calls[1]?.[0]).toBe(
      "SET LOCAL hnsw.ef_search = 16",
    );
    const selectSql = String(client.query.mock.calls[2]?.[0]);
    const params = client.query.mock.calls[2]?.[1] as unknown[];
    expect(selectSql).toMatch(/source = ANY\(\$\d+::text\[\]\)/);
    expect(selectSql).toMatch(/embedding_model = \$\d+/);
    expect(params).toEqual([
      USER_ID,
      "[0.10000000149011612,0.20000000298023224]",
      5,
      ["finyk"],
      env.VOYAGE_EMBEDDING_MODEL,
    ]);
    expect(result).toEqual([
      {
        id: 42,
        source: "finyk",
        sourceRef: "tx-1",
        content: "coffee",
        embeddingMeta: {
          provider: "voyage",
          model: "voyage-3.5-lite",
          version: "1",
          dim: env.VOYAGE_EMBEDDING_DIM,
        },
        metadata: { amount: 120 },
        score: 0.75,
        createdAt: new Date("2026-06-24T10:00:00.000Z"),
      },
    ]);
    expect(client.query.mock.calls[3]?.[0]).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("returns [] for topK <= 0 without opening a connection", async () => {
    const pool = makePool();
    const store = createPgVectorStore(pool);

    await expect(
      store.query({
        userId: USER_ID,
        embedding: Float32Array.of(0.1),
        topK: 0,
      }),
    ).resolves.toEqual([]);

    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("guards empty user ids across write, query, and delete operations", async () => {
    const store = createPgVectorStore(makePool());

    await expect(store.upsert([write({ userId: "" })])).rejects.toThrow(
      "userId is required",
    );
    await expect(
      store.query({ userId: "", embedding: Float32Array.of(0.1), topK: 1 }),
    ).rejects.toThrow("userId is required");
    await expect(store.deleteBySource("", "chat", "msg-1")).rejects.toThrow(
      "userId is required",
    );
    await expect(store.deleteAllForUser("")).rejects.toThrow(
      "userId is required",
    );
  });

  it("delete helpers pass the scoped SQL parameters and row count through", async () => {
    const pool = makePool();
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 3 });
    const store = createPgVectorStore(pool);

    await store.deleteBySource(USER_ID, "finyk", "tx-1");
    expect(pool.query.mock.calls[0]?.[1]).toEqual([USER_ID, "finyk", "tx-1"]);

    await expect(store.deleteAllForUser(USER_ID)).resolves.toBe(3);
    expect(pool.query.mock.calls[1]?.[1]).toEqual([USER_ID]);
  });

  it("health reports pgvector availability and fails closed on DB errors", async () => {
    const okPool = makePool();
    okPool.query.mockResolvedValueOnce({ rows: [{ has_vector: true }] });
    await expect(createPgVectorStore(okPool).health()).resolves.toEqual({
      ok: true,
      provider: "pgvector",
    });

    const failPool = makePool();
    failPool.query.mockRejectedValueOnce(new Error("db down"));
    await expect(createPgVectorStore(failPool).health()).resolves.toEqual({
      ok: false,
      provider: "pgvector",
    });
  });
});
