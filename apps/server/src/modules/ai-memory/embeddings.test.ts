import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ENV_VARS = [
  "VOYAGE_API_KEY",
  "VOYAGE_EMBEDDING_MODEL",
  "VOYAGE_EMBEDDING_DIM",
  "VOYAGE_TIMEOUT_MS",
  "VOYAGE_MAX_RETRIES",
  "VOYAGE_BATCH_SIZE",
  "AI_MEMORY_EMBEDDING_VERSION",
  "AI_CIRCUIT_BREAKER_THRESHOLD",
  "AI_CIRCUIT_BREAKER_RESET_MS",
] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_VARS) savedEnv[k] = process.env[k];
  process.env.VOYAGE_API_KEY = "test-key";
  process.env.VOYAGE_EMBEDDING_MODEL = "voyage-3-lite";
  process.env.VOYAGE_EMBEDDING_DIM = "4"; // менший — простіше для тестів
  process.env.VOYAGE_TIMEOUT_MS = "1000";
  process.env.VOYAGE_MAX_RETRIES = "1";
  process.env.VOYAGE_BATCH_SIZE = "2";
  process.env.AI_MEMORY_EMBEDDING_VERSION = "1";
  // Високий threshold/довгий reset — щоб circuit-breaker не задихнув
  // концурент тести (тести лежать у одному процесі і шарять instance).
  process.env.AI_CIRCUIT_BREAKER_THRESHOLD = "100";
  process.env.AI_CIRCUIT_BREAKER_RESET_MS = "60000";
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_VARS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

/**
 * Будує fake `Response` для Voyage API. Аргументи легкі для override-у
 * у per-test сценаріях (помилки, partial-batch, переплутаний `index`).
 */
function makeVoyageResponse(
  vectors: number[][],
  opts: {
    ok?: boolean;
    status?: number;
    body?: string;
    indices?: number[];
  } = {},
): Response {
  if (opts.ok === false) {
    return new Response(opts.body ?? "voyage error", {
      status: opts.status ?? 500,
    });
  }
  const data = vectors.map((emb, i) => ({
    embedding: emb,
    index: opts.indices?.[i] ?? i,
  }));
  return new Response(
    JSON.stringify({
      data,
      model: "voyage-3-lite",
      usage: { total_tokens: 10 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("createVoyageEmbeddings", () => {
  it("повертає метадані поточної моделі", async () => {
    const { createVoyageEmbeddings } = await import("./embeddings.js");
    const provider = createVoyageEmbeddings({
      fetchFn: vi.fn() as unknown as typeof fetch,
    });
    expect(provider.meta).toEqual({
      provider: "voyage",
      model: "voyage-3-lite",
      version: "1",
      dim: 4,
    });
  });

  it("embed-ить один batch до Voyage API і повертає Float32Array-и", async () => {
    const { createVoyageEmbeddings } = await import("./embeddings.js");
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      // Перевіряємо payload
      expect(init?.method).toBe("POST");
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer test-key");
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("voyage-3-lite");
      expect(body.output_dimension).toBe(4);
      expect(body.input).toEqual(["a", "b"]);
      return makeVoyageResponse([
        [0.1, 0.2, 0.3, 0.4],
        [0.5, 0.6, 0.7, 0.8],
      ]);
    });

    const provider = createVoyageEmbeddings({
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const result = await provider.embedBatch(["a", "b"]);

    expect(result).toHaveLength(2);
    expect(result[0]).toBeInstanceOf(Float32Array);
    expect(Array.from(result[0])).toEqual([
      // Float32Array округляє до f32 — порівнюємо приблизно.
      expect.closeTo(0.1, 5),
      expect.closeTo(0.2, 5),
      expect.closeTo(0.3, 5),
      expect.closeTo(0.4, 5),
    ]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("розбиває великий вхід на batch-и розміру VOYAGE_BATCH_SIZE", async () => {
    const { createVoyageEmbeddings } = await import("./embeddings.js");
    let callIdx = 0;
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const batch = body.input as string[];
      callIdx++;
      return makeVoyageResponse(batch.map(() => [0.1, 0.2, 0.3, 0.4]));
    });
    const provider = createVoyageEmbeddings({
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const result = await provider.embedBatch(["a", "b", "c", "d", "e"]);
    expect(result).toHaveLength(5);
    // VOYAGE_BATCH_SIZE=2 → ceil(5/2)=3 виклики.
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(callIdx).toBe(3);
  });

  it("повертає [] для пустого вхідного масиву без виклику API", async () => {
    const { createVoyageEmbeddings } = await import("./embeddings.js");
    const fetchFn = vi.fn();
    const provider = createVoyageEmbeddings({
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const result = await provider.embedBatch([]);
    expect(result).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("кидає MissingVoyageApiKeyError якщо VOYAGE_API_KEY не сконфігуровано", async () => {
    delete process.env.VOYAGE_API_KEY;
    const { createVoyageEmbeddings, MissingVoyageApiKeyError } =
      await import("./embeddings.js");
    const fetchFn = vi.fn();
    const provider = createVoyageEmbeddings({
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(provider.embedBatch(["a"])).rejects.toThrow(
      MissingVoyageApiKeyError,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("ретраїть на 5xx + успіх на другій спробі", async () => {
    const { createVoyageEmbeddings } = await import("./embeddings.js");
    let attempt = 0;
    const fetchFn = vi.fn(async () => {
      attempt++;
      if (attempt === 1) {
        return makeVoyageResponse([], { ok: false, status: 503, body: "down" });
      }
      return makeVoyageResponse([[0.1, 0.2, 0.3, 0.4]]);
    });
    const provider = createVoyageEmbeddings({
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const result = await provider.embedBatch(["a"]);
    expect(result).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("ретраїть на 429 (rate limited)", async () => {
    const { createVoyageEmbeddings } = await import("./embeddings.js");
    let attempt = 0;
    const fetchFn = vi.fn(async () => {
      attempt++;
      if (attempt === 1) {
        return makeVoyageResponse([], { ok: false, status: 429 });
      }
      return makeVoyageResponse([[0.1, 0.2, 0.3, 0.4]]);
    });
    const provider = createVoyageEmbeddings({
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const result = await provider.embedBatch(["a"]);
    expect(result).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("НЕ ретраїть на 4xx (auth/quota помилка)", async () => {
    const { createVoyageEmbeddings, VoyageHttpError } =
      await import("./embeddings.js");
    const fetchFn = vi.fn(async () =>
      makeVoyageResponse([], { ok: false, status: 401, body: "Unauthorized" }),
    );
    const provider = createVoyageEmbeddings({
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(provider.embedBatch(["a"])).rejects.toBeInstanceOf(
      VoyageHttpError,
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("кидає VoyageHttpError з retryable=false на final 5xx після retry-ів", async () => {
    process.env.VOYAGE_MAX_RETRIES = "1"; // 2 спроби максимум
    const { createVoyageEmbeddings, VoyageHttpError } =
      await import("./embeddings.js");
    const fetchFn = vi.fn(async () =>
      makeVoyageResponse([], { ok: false, status: 503 }),
    );
    const provider = createVoyageEmbeddings({
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    let caught: unknown;
    try {
      await provider.embedBatch(["a"]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(VoyageHttpError);
    expect((caught as InstanceType<typeof VoyageHttpError>).status).toBe(503);
    // 2 спроби: first try + 1 retry
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("кидає VoyageContractError якщо count embeddings ≠ count input", async () => {
    const { createVoyageEmbeddings, VoyageContractError } =
      await import("./embeddings.js");
    const fetchFn = vi.fn(async () =>
      // 2 input → 1 embedding ≠ contract violation
      makeVoyageResponse([[0.1, 0.2, 0.3, 0.4]]),
    );
    const provider = createVoyageEmbeddings({
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(provider.embedBatch(["a", "b"])).rejects.toBeInstanceOf(
      VoyageContractError,
    );
  });

  it("кидає VoyageContractError якщо dim ≠ VOYAGE_EMBEDDING_DIM", async () => {
    const { createVoyageEmbeddings, VoyageContractError } =
      await import("./embeddings.js");
    const fetchFn = vi.fn(async () =>
      // dim=3 ≠ VOYAGE_EMBEDDING_DIM=4
      makeVoyageResponse([[0.1, 0.2, 0.3]]),
    );
    const provider = createVoyageEmbeddings({
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(provider.embedBatch(["a"])).rejects.toBeInstanceOf(
      VoyageContractError,
    );
  });

  it("сортує результати по полю index (Voyage не гарантує порядок)", async () => {
    const { createVoyageEmbeddings } = await import("./embeddings.js");
    const fetchFn = vi.fn(async () =>
      makeVoyageResponse(
        [
          [0.5, 0.5, 0.5, 0.5], // index=1
          [0.1, 0.1, 0.1, 0.1], // index=0
        ],
        { indices: [1, 0] },
      ),
    );
    const provider = createVoyageEmbeddings({
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const result = await provider.embedBatch(["a", "b"]);
    expect(Array.from(result[0])).toEqual([
      expect.closeTo(0.1, 5),
      expect.closeTo(0.1, 5),
      expect.closeTo(0.1, 5),
      expect.closeTo(0.1, 5),
    ]);
    expect(Array.from(result[1])).toEqual([
      expect.closeTo(0.5, 5),
      expect.closeTo(0.5, 5),
      expect.closeTo(0.5, 5),
      expect.closeTo(0.5, 5),
    ]);
  });
});
