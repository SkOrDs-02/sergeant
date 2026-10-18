// @vitest-environment jsdom
/**
 * Tests for the default `createDefaultRuntime` boot path of
 * `bootSyncEngineWriter` (the branch taken when no `createRuntime` override
 * is supplied). The sibling `singleton.test.ts` covers the boot
 * once-only / in-flight-share / failure semantics with an injected
 * `createRuntime`; this file drives the real default factory with every
 * dynamically-imported module mocked, so the schema-prep pipeline
 * (repair → migrate → smoke-check → retention sweep), the Sentry
 * outcome tags, the per-tick drain wrapper and the status/recover deps all
 * execute.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── getSession (static import in singleton.ts) ───────────────────────────────
const mockGetSession = vi.fn(async () => ({
  data: { user: { id: "user-123" } },
  error: null,
}));
vi.mock("../auth/authClient", () => ({ getSession: () => mockGetSession() }));

// ── SQLite migration client + db handle ──────────────────────────────────────
//
// `all` answers by query intent rather than call-order: the initial probe
// reports an empty disk ("fresh"), the post-migration smoke-check reports
// `sync_op_outbox` present. Order-independent so repeated `resolveClient`
// calls (drain / getStatus) stay green.
function makeClient() {
  return {
    run: vi.fn(async () => {}),
    all: vi.fn(async (sql: string) => {
      if (sql.includes("AND name = 'sync_op_outbox'")) {
        return [{ name: "sync_op_outbox" }]; // smoke-check: present
      }
      return []; // initial probe: nothing on disk → "fresh"
    }),
  };
}

let client = makeClient();
// Stable db handle so the per-handle `prepCache` WeakMap actually hits and
// schema-prep runs exactly once per boot (mirrors the real singleton DB).
let dbHandle = { migrationClient: () => client };
const mockGetSqliteDb = vi.fn(async () => dbHandle);
vi.mock("../db/sqlite", () => ({ getSqliteDb: () => mockGetSqliteDb() }));

// ── api-client ───────────────────────────────────────────────────────────────
const mockPushV2 = vi.fn(async (..._a: unknown[]) => ({ pushed: 0 }));
const mockPullV2 = vi.fn(async (..._a: unknown[]) => ({
  ops: [],
  next_cursor: null,
}));
vi.mock("@shared/api", () => ({
  apiClient: {
    syncV2: {
      pushV2: (...a: unknown[]) => mockPushV2(...a),
      pullV2: (...a: unknown[]) => mockPullV2(...a),
    },
  },
}));

// ── sentry ───────────────────────────────────────────────────────────────────
const mockSetTag = vi.fn();
const mockBreadcrumb = vi.fn();
const mockCapture = vi.fn();
vi.mock("../observability/sentry", () => ({
  setSentryTag: (...a: unknown[]) => mockSetTag(...a),
  addSentryBreadcrumb: (...a: unknown[]) => mockBreadcrumb(...a),
  captureException: (...a: unknown[]) => mockCapture(...a),
}));

// ── db-schema (sqlite + migrate runner + adapter) ────────────────────────────
const mockRepair = vi.fn(async (..._a: unknown[]) => ({ recovered: false }));
const mockDrain = vi.fn(async (..._a: unknown[]): Promise<unknown[]> => []);
const mockCountByStatus = vi.fn(async (..._a: unknown[]) => ({ pending: 0 }));
const mockRecoverDeadLetter = vi.fn(async (..._a: unknown[]) => ({
  recovered: 0,
}));
const mockPurgeStale = vi.fn(async (..._a: unknown[]) => 0);
const mockCountRejected = vi.fn(async (..._a: unknown[]) => 2);
const mockMarkSuccess = vi.fn(async (..._a: unknown[]) => {});
const mockMarkSuccessBatch = vi.fn(async (..._a: unknown[]) => {});
const mockMarkRetry = vi.fn(async (..._a: unknown[]) => {});
const mockMarkRejected = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@sergeant/db-schema/sqlite", () => ({
  repairPartialOutboxMigration: (...a: unknown[]) => mockRepair(...a),
  ROUTINE_MIGRATIONS_TABLE: "__routine_migrations",
  ROUTINE_CLIENT_MIGRATIONS: [],
  drainSyncOpOutbox: (...a: unknown[]) => mockDrain(...a),
  markOutboxSuccess: (...a: unknown[]) => mockMarkSuccess(...a),
  markOutboxSuccessBatch: (...a: unknown[]) => mockMarkSuccessBatch(...a),
  markOutboxRetry: (...a: unknown[]) => mockMarkRetry(...a),
  markOutboxRejected: (...a: unknown[]) => mockMarkRejected(...a),
  planRetry: vi.fn(),
  countOutboxByStatus: (...a: unknown[]) => mockCountByStatus(...a),
  countRejectedOutbox: (...a: unknown[]) => mockCountRejected(...a),
  recoverDeadLetter: (...a: unknown[]) => mockRecoverDeadLetter(...a),
  purgeStaleTerminalOutbox: (...a: unknown[]) => mockPurgeStale(...a),
  SYNC_OP_OUTBOX_STALE_TTL_DAYS: 30,
  SYNC_OP_JITTER_WINDOW_MS: 1000,
}));

const mockRunMigrations = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@sergeant/db-schema/migrate/runner", () => ({
  runMigrations: (...a: unknown[]) => mockRunMigrations(...a),
}));
vi.mock("@sergeant/db-schema/migrate/sqlite", () => ({
  createSqliteAdapter: (c: unknown) => ({ adapter: c }),
}));

import {
  __resetInitialPullStateForTests,
  hasCompletedInitialPull,
} from "./initialPullState";
import {
  __resetSyncSessionSignalForTests,
  readSyncSessionMissing,
} from "./syncSessionSignal";
import {
  __resetSyncEngineWriterForTests,
  bootSyncEngineReader,
  bootSyncEngineWriter,
  getSyncEngineReader,
  getSyncEngineWriter,
} from "./singleton";
import * as writerFactory from "./syncEngineWriter";

beforeEach(() => {
  vi.clearAllMocks();
  client = makeClient();
  dbHandle = { migrationClient: () => client };
  __resetSyncEngineWriterForTests();
  __resetSyncSessionSignalForTests();
});

afterEach(() => {
  __resetSyncEngineWriterForTests();
});

describe("createDefaultRuntime (default boot path)", () => {
  it("pins receipt writes to the drained partition while the next tick uses the new partition", async () => {
    const factory = vi.spyOn(writerFactory, "createSyncEngineWriterRuntime");
    try {
      const runtime = await bootSyncEngineWriter();
      await runtime!.flushNow();
      const push = factory.mock.calls[0]![0].pushDeps;
      const sourceClient = client;
      mockDrain.mockResolvedValueOnce([{ id: 1 }]);
      await push.drain({ limit: 200, now: new Date() });
      expect(mockDrain.mock.lastCall?.[0]).toBe(sourceClient);

      // A's HTTP receipt arrives after switching to B's SQLite handle.
      // Both per-user files can have an outbox row with local id=1.
      const otherClient = makeClient();
      dbHandle = { migrationClient: () => otherClient };
      await push.markSuccess(1);
      await push.markSuccessBatch!([1]);
      await push.markRetry(1, {
        attempts: 1,
        status: "pending",
        nextRetryAt: null,
        lastError: "network",
      });
      await push.markRejected(1, "lww_conflict");
      for (const write of [
        mockMarkSuccess,
        mockMarkSuccessBatch,
        mockMarkRetry,
        mockMarkRejected,
      ]) {
        expect(write.mock.lastCall?.[0]).toBe(sourceClient);
      }

      await push.drain({ limit: 200, now: new Date() });
      expect(mockDrain.mock.lastCall?.[0]).toBe(otherClient);
      await push.markSuccessBatch!([1]);
      expect(mockMarkSuccessBatch.mock.lastCall?.[0]).toBe(otherClient);
    } finally {
      factory.mockRestore();
    }
  });

  it("boots a started runtime that prepares the schema and tags the fresh outcome", async () => {
    const runtime = await bootSyncEngineWriter();

    expect(runtime).not.toBeNull();
    expect(getSyncEngineWriter()).toBe(runtime);

    // Schema-prep pipeline ran: repair → migrate → retention sweep.
    expect(mockRepair).toHaveBeenCalledTimes(1);
    expect(mockRunMigrations).toHaveBeenCalledTimes(1);
    expect(mockPurgeStale).toHaveBeenCalledTimes(1);

    // No outbox on disk + not recovered → "fresh"; legacy not seen.
    expect(mockSetTag).toHaveBeenCalledWith("outbox.boot.outcome", "fresh");
    expect(mockSetTag).toHaveBeenCalledWith("outbox.boot.legacy_seen", "false");
    expect(mockSetTag).toHaveBeenCalledWith(
      "sync.origin_device_id_present",
      "true",
    );
  });

  it("getStatus on the runtime resolves the live counts via countOutboxByStatus", async () => {
    const runtime = await bootSyncEngineWriter();
    const status = await runtime!.getStatus();
    // `rejected` перекривається відфільтрованим лічильником (без
    // `lww_conflict`), щоб пілюля і `SyncRejectedList` рахували одну множину.
    expect(status).toEqual({ pending: 0, rejected: 2 });
    expect(mockCountByStatus).toHaveBeenCalled();
    expect(mockCountRejected).toHaveBeenCalledWith(expect.anything(), {
      excludeReasons: ["lww_conflict"],
    });
  });

  it("pulls once the last full backlog batch is followed by an empty tick", async () => {
    const factory = vi.spyOn(writerFactory, "createSyncEngineWriterRuntime");
    const runtime = await bootSyncEngineWriter();
    await runtime!.flushNow();
    const deps = factory.mock.calls[0]?.[0];
    expect(deps).toBeDefined();
    mockPullV2.mockClear();

    deps!.onTickComplete?.({
      drained: 200,
      pushed: 200,
      retried: 0,
      rejected: 0,
    });
    await Promise.resolve();
    expect(mockPullV2).not.toHaveBeenCalled();

    deps!.onTickComplete?.({ drained: 0, pushed: 0, retried: 0, rejected: 0 });
    await vi.waitFor(() => expect(mockPullV2).toHaveBeenCalledTimes(1));
    factory.mockRestore();
  });

  it("sec-18: drain без сесії виставляє сигнал «сесії немає», з живою сесією знімає, збій мережі його не чіпає", async () => {
    const runtime = await bootSyncEngineWriter();
    // Startup now resumes a persisted queue immediately. Finish that tick
    // before changing the session used by the next, separate drain.
    await runtime!.flushNow();
    mockDrain.mockClear();
    expect(readSyncSessionMissing()).toBe(false);

    // Сесія спливла посеред роботи: `data: null` без помилки.
    mockGetSession.mockResolvedValueOnce({ data: null, error: null } as never);
    await runtime!.flushNow();
    expect(mockDrain).not.toHaveBeenCalled();
    expect(readSyncSessionMissing()).toBe(true);

    // Тимчасовий збій `getSession` (офлайн/5xx) нічого не каже про сесію.
    mockGetSession.mockResolvedValueOnce({
      data: null,
      error: { status: 0 },
    } as never);
    await runtime!.flushNow();
    expect(readSyncSessionMissing()).toBe(true);

    // Людина увійшла знову: drain іде, сигнал знято.
    await runtime!.flushNow();
    expect(mockDrain).toHaveBeenCalled();
    expect(readSyncSessionMissing()).toBe(false);
  });

  it("tags failure and reports via captureException when migrations throw", async () => {
    mockRunMigrations.mockRejectedValueOnce(new Error("migrate boom"));
    const captureException = vi.fn();

    const runtime = await bootSyncEngineWriter({ captureException });

    // Boot fails → null runtime, failure tagged, error forwarded.
    expect(runtime).toBeNull();
    expect(mockSetTag).toHaveBeenCalledWith("outbox.boot.outcome", "failed");
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      scope: "sync-v2-writer-boot",
    });
  });
});

describe("createDefaultReaderRuntime (default reader boot path)", () => {
  it("boots a started reader runtime that reuses the shared schema context", async () => {
    const reader = await bootSyncEngineReader();

    expect(reader).not.toBeNull();
    expect(getSyncEngineReader()).toBe(reader);

    expect(mockRepair).toHaveBeenCalledTimes(1);
    expect(mockRunMigrations).toHaveBeenCalledTimes(1);
    expect(mockSetTag).toHaveBeenCalledWith(
      "sync.origin_device_id_present",
      "true",
    );
  });

  it("data-04: тимчасовий збій getSession не скидає прапор початкового pull, справжній logout скидає", async () => {
    __resetInitialPullStateForTests();
    const reader = await bootSyncEngineReader();
    await reader!.pullOnce();
    expect(hasCompletedInitialPull("user-123")).toBe(true);

    // Офлайн / 5xx: `data: null` з помилкою — тік падає, прапор лишається.
    mockGetSession.mockResolvedValueOnce({
      data: null,
      error: { status: 0 },
    } as never);
    await expect(reader!.pullOnce()).rejects.toThrow();
    expect(hasCompletedInitialPull("user-123")).toBe(true);

    // Сесії справді немає (`data: null`, `error: null`): logout.
    mockGetSession.mockResolvedValueOnce({ data: null, error: null } as never);
    await reader!.pullOnce();
    expect(hasCompletedInitialPull("user-123")).toBe(false);
  });

  it("tags failure and reports via captureException when reader boot fails", async () => {
    mockRunMigrations.mockRejectedValueOnce(new Error("reader migrate boom"));
    const captureException = vi.fn();

    const reader = await bootSyncEngineReader({ captureException });

    expect(reader).toBeNull();
    expect(mockSetTag).toHaveBeenCalledWith("outbox.boot.outcome", "failed");
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      scope: "sync-v2-reader-boot",
    });
  });
});
