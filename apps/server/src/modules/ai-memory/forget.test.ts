import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../obs/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  serializeError: vi.fn((err: unknown) => ({
    message: err instanceof Error ? err.message : String(err),
  })),
  redactKeyNames: [],
}));

vi.mock("../../sentry.js", () => ({
  Sentry: {
    addBreadcrumb: vi.fn(),
    captureMessage: vi.fn(),
    captureException: vi.fn(),
  },
}));

vi.mock("../openclaw/store.js", () => ({
  openInvocation: vi.fn(async () => 42),
  finalizeInvocation: vi.fn(async () => undefined),
}));

const { recallStub } = vi.hoisted(() => ({
  recallStub: vi.fn(async () => [] as unknown[]),
}));
vi.mock("./bootstrap.js", () => ({
  getAiMemory: vi.fn(() => ({ recall: recallStub })),
}));

import {
  __resetForgetRateLimitForTests,
  __resetForgetTokensForTests,
  cancelForget,
  checkForgetRateLimit,
  confirmForget,
  forgetById,
  forgetByTopic,
  forgetSince,
  ForgetRateLimitError,
  ForgetTokenError,
  previewForget,
} from "./forget.js";
import { Sentry } from "../../sentry.js";
import { finalizeInvocation, openInvocation } from "../openclaw/store.js";

const openMock = openInvocation as unknown as ReturnType<typeof vi.fn>;
const finalizeMock = finalizeInvocation as unknown as ReturnType<typeof vi.fn>;
const recallMock = recallStub;
const breadcrumbMock = (
  Sentry as unknown as { addBreadcrumb: ReturnType<typeof vi.fn> }
).addBreadcrumb;

function makeFakePool(
  responses: Array<{ rowCount: number; rows?: unknown[] }>,
): { pool: { query: ReturnType<typeof vi.fn> }; calls: Array<unknown[]> } {
  const queue = [...responses];
  const calls: Array<unknown[]> = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push([sql, params ?? []]);
    const next = queue.shift();
    if (!next) {
      throw new Error(`unexpected query: ${sql.slice(0, 60)}`);
    }
    return { rowCount: next.rowCount, rows: next.rows ?? [] };
  });
  return { pool: { query }, calls };
}

beforeEach(() => {
  __resetForgetRateLimitForTests();
  __resetForgetTokensForTests();
  openMock.mockReset().mockResolvedValue(42);
  finalizeMock.mockReset().mockResolvedValue(undefined);
  recallMock.mockReset().mockResolvedValue([]);
  breadcrumbMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("checkForgetRateLimit", () => {
  it("дозволяє 3 виклики поспіль і блокує четвертий", () => {
    expect(checkForgetRateLimit("user-1")).toBeNull();
    expect(checkForgetRateLimit("user-1")).toBeNull();
    expect(checkForgetRateLimit("user-1")).toBeNull();
    const blocked = checkForgetRateLimit("user-1");
    expect(blocked).toBeInstanceOf(ForgetRateLimitError);
    expect(blocked?.retryAfterSec).toBeGreaterThan(0);
  });

  it("буджети ізольовані per-founder", () => {
    expect(checkForgetRateLimit("user-A")).toBeNull();
    expect(checkForgetRateLimit("user-A")).toBeNull();
    expect(checkForgetRateLimit("user-A")).toBeNull();
    expect(checkForgetRateLimit("user-B")).toBeNull(); // фрешний bucket
  });

  it("вікно скидається після 1h", () => {
    const baseMs = Date.now();
    expect(checkForgetRateLimit("user-X", baseMs)).toBeNull();
    expect(checkForgetRateLimit("user-X", baseMs)).toBeNull();
    expect(checkForgetRateLimit("user-X", baseMs)).toBeNull();
    expect(checkForgetRateLimit("user-X", baseMs)).toBeInstanceOf(
      ForgetRateLimitError,
    );
    // Через годину — bucket reset, лічильник 1.
    expect(
      checkForgetRateLimit("user-X", baseMs + 60 * 60 * 1000 + 1),
    ).toBeNull();
  });
});

describe("forgetById", () => {
  it("soft-deletes by id, пише audit row + breadcrumb", async () => {
    const { pool, calls } = makeFakePool([{ rowCount: 1 }]);

    const result = await forgetById(pool as never, {
      founderUserId: "u1",
      founderTgUserId: 999,
      rawCommand: "/forget id 123",
      memoryId: 123,
    });

    expect(result).toEqual({ deletedCount: 1, invocationId: 42, mode: "byId" });
    expect(calls[0]?.[0]).toMatch(/UPDATE ai_memories/);
    expect(calls[0]?.[0]).toMatch(/SET deleted_at = NOW/);
    expect(calls[0]?.[0]).toMatch(/deleted_at IS NULL/);
    expect(openMock).toHaveBeenCalledTimes(1);
    expect(finalizeMock).toHaveBeenCalledTimes(1);
    expect(finalizeMock.mock.calls[0]?.[1]).toMatchObject({
      status: "success",
      metadataPatch: expect.objectContaining({ deleted_count: 1 }),
    });
    expect(breadcrumbMock).toHaveBeenCalled();
    const breadcrumbArg = breadcrumbMock.mock.calls[0]?.[0] as {
      category: string;
      data: Record<string, unknown>;
    };
    expect(breadcrumbArg.category).toBe("ai-memory-forget");
    expect(breadcrumbArg.data["deleted_count"]).toBe(1);
  });

  it("повертає 0 deletedCount якщо row уже soft-deleted", async () => {
    const { pool } = makeFakePool([{ rowCount: 0 }]);
    const result = await forgetById(pool as never, {
      founderUserId: "u1",
      founderTgUserId: 999,
      rawCommand: "/forget id 999",
      memoryId: 999,
    });
    expect(result.deletedCount).toBe(0);
    expect(finalizeMock.mock.calls[0]?.[1]).toMatchObject({
      status: "success",
    });
  });

  it("кидає ForgetRateLimitError на 4-му виклику", async () => {
    const { pool } = makeFakePool([
      { rowCount: 1 },
      { rowCount: 1 },
      { rowCount: 1 },
    ]);
    const base = {
      founderUserId: "u1",
      founderTgUserId: 999,
      rawCommand: "/forget id 1",
    };
    await forgetById(pool as never, { ...base, memoryId: 1 });
    await forgetById(pool as never, { ...base, memoryId: 2 });
    await forgetById(pool as never, { ...base, memoryId: 3 });
    await expect(
      forgetById(pool as never, { ...base, memoryId: 4 }),
    ).rejects.toBeInstanceOf(ForgetRateLimitError);
  });
});

describe("forgetByTopic", () => {
  it("видаляє по topic, пише audit", async () => {
    const { pool, calls } = makeFakePool([{ rowCount: 5 }]);
    const result = await forgetByTopic(pool as never, {
      founderUserId: "u1",
      founderTgUserId: 999,
      rawCommand: "/forget topic foo",
      topic: "foo",
    });
    expect(result.deletedCount).toBe(5);
    expect(calls[0]?.[0]).toMatch(/topic = \$2/);
    expect(calls[0]?.[1]).toEqual(["u1", "foo"]);
  });
});

describe("forgetSince", () => {
  it("видаляє по created_at >= sinceDate", async () => {
    const { pool, calls } = makeFakePool([{ rowCount: 12 }]);
    const result = await forgetSince(pool as never, {
      founderUserId: "u1",
      founderTgUserId: 999,
      rawCommand: "/forget since 2025-04-01",
      sinceDate: "2025-04-01",
    });
    expect(result.deletedCount).toBe(12);
    expect(calls[0]?.[0]).toMatch(/created_at >= \$2/);
    expect(calls[0]?.[1]).toEqual(["u1", "2025-04-01"]);
  });
});

describe("previewForget → confirmForget happy path", () => {
  it("preview stage-ить token, confirm видаляє", async () => {
    recallMock.mockResolvedValue([
      {
        id: 101,
        source: "cofounder",
        sourceRef: "tg:1",
        content: "foo",
        embeddingMeta: {},
        metadata: { topic: "shared" },
        score: 0.9,
        createdAt: new Date("2025-04-01T12:00:00Z"),
      },
      {
        id: 102,
        source: "cofounder",
        sourceRef: "tg:2",
        content: "bar",
        embeddingMeta: {},
        metadata: { topic: null },
        score: 0.8,
        createdAt: new Date("2025-04-02T12:00:00Z"),
      },
    ]);

    const preview = await previewForget({
      founderUserId: "u1",
      founderTgUserId: 999,
      rawCommand: "/forget query foo",
      query: "foo",
    });
    expect(preview.matches).toHaveLength(2);
    expect(preview.token).toMatch(/^[0-9a-f-]{36}$/i);
    expect(preview.matches[0]?.id).toBe(101);
    expect(preview.matches[0]?.topic).toBe("shared");

    // Confirm — soft-deletes both id-s, single UPDATE.
    const { pool, calls } = makeFakePool([{ rowCount: 2 }]);
    const result = await confirmForget(pool as never, {
      founderUserId: "u1",
      founderTgUserId: 999,
      rawCommand: "/forget confirm",
      token: preview.token,
    });
    expect(result.deletedCount).toBe(2);
    expect(result.mode).toBe("previewQuery");
    expect(calls[0]?.[0]).toMatch(/id = ANY/);
    expect(calls[0]?.[1]).toEqual(["u1", [101, 102]]);

    // Друга confirm — token уже видалений; throw unknown.
    const { pool: pool2 } = makeFakePool([]);
    await expect(
      confirmForget(pool2 as never, {
        founderUserId: "u1",
        founderTgUserId: 999,
        rawCommand: "/forget confirm",
        token: preview.token,
      }),
    ).rejects.toMatchObject({ name: "ForgetTokenError", reason: "unknown" });
  });

  it("cancelForget видаляє token без DB writes", async () => {
    recallMock.mockResolvedValue([]);
    const preview = await previewForget({
      founderUserId: "u1",
      founderTgUserId: 999,
      rawCommand: "/forget query x",
      query: "x",
    });

    expect(cancelForget(preview.token, "u1")).toBe(true);
    // Друга спроба — token уже немає.
    expect(cancelForget(preview.token, "u1")).toBe(false);

    // Confirm після cancel — unknown.
    const { pool } = makeFakePool([]);
    await expect(
      confirmForget(pool as never, {
        founderUserId: "u1",
        founderTgUserId: 999,
        rawCommand: "/forget confirm",
        token: preview.token,
      }),
    ).rejects.toMatchObject({ name: "ForgetTokenError", reason: "unknown" });
  });

  it("cancelForget відмовляє якщо founderUserId не співпадає", async () => {
    recallMock.mockResolvedValue([]);
    const preview = await previewForget({
      founderUserId: "u1",
      founderTgUserId: 999,
      rawCommand: "/forget query x",
      query: "x",
    });
    expect(cancelForget(preview.token, "different-user")).toBe(false);
  });

  it("confirmForget відмовляє при founder mismatch", async () => {
    recallMock.mockResolvedValue([
      {
        id: 1,
        source: "cofounder",
        sourceRef: null,
        content: "foo",
        embeddingMeta: {},
        metadata: {},
        score: 0.5,
        createdAt: new Date(),
      },
    ]);
    const preview = await previewForget({
      founderUserId: "u1",
      founderTgUserId: 999,
      rawCommand: "/forget query foo",
      query: "foo",
    });
    const { pool } = makeFakePool([]);
    await expect(
      confirmForget(pool as never, {
        founderUserId: "u2", // mismatch
        founderTgUserId: 999,
        rawCommand: "/forget confirm",
        token: preview.token,
      }),
    ).rejects.toMatchObject({
      name: "ForgetTokenError",
      reason: "founder_mismatch",
    });
  });
});

describe("ForgetTokenError propagation", () => {
  it("unknown token", async () => {
    const { pool } = makeFakePool([]);
    await expect(
      confirmForget(pool as never, {
        founderUserId: "u1",
        founderTgUserId: 999,
        rawCommand: "/forget confirm",
        token: "00000000-0000-0000-0000-000000000000",
      }),
    ).rejects.toThrow(ForgetTokenError);
  });
});
