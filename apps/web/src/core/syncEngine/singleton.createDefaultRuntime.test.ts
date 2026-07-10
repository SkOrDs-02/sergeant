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
vi.mock("@sergeant/db-schema/sqlite", () => ({
  repairPartialOutboxMigration: (...a: unknown[]) => mockRepair(...a),
  ROUTINE_MIGRATIONS_TABLE: "__routine_migrations",
  ROUTINE_CLIENT_MIGRATIONS: [],
  drainSyncOpOutbox: (...a: unknown[]) => mockDrain(...a),
  markOutboxSuccess: vi.fn(async () => {}),
  markOutboxRetry: vi.fn(async () => {}),
  markOutboxRejected: vi.fn(async () => {}),
  planRetry: vi.fn(),
  countOutboxByStatus: (...a: unknown[]) => mockCountByStatus(...a),
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
  __resetSyncEngineWriterForTests,
  bootSyncEngineReader,
  bootSyncEngineWriter,
  getSyncEngineReader,
  getSyncEngineWriter,
} from "./singleton";

beforeEach(() => {
  vi.clearAllMocks();
  client = makeClient();
  dbHandle = { migrationClient: () => client };
  __resetSyncEngineWriterForTests();
});

afterEach(() => {
  __resetSyncEngineWriterForTests();
});

describe("createDefaultRuntime (default boot path)", () => {
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
    expect(status).toEqual({ pending: 0 });
    expect(mockCountByStatus).toHaveBeenCalled();
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
