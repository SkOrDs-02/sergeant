import { describe, expect, it, vi } from "vitest";
import { MigrationFailedError, runMigrations } from "../migrate/runner.js";
import {
  DEFAULT_MIGRATIONS_TABLE,
  type MigrationAdapter,
  type MigrationFile,
  type MigrationLogEvent,
} from "../migrate/types.js";

/**
 * Adapter-agnostic tests. They drive the runner with a tiny in-memory
 * fake adapter so the contract is locked independently of any real
 * dialect. Dialect-specific tests live in `migrate.pg.test.ts` and
 * `migrate.sqlite.test.ts` and exercise the same scenarios end-to-end
 * over real Postgres / SQLite engines.
 */

interface FakeAdapterState {
  ledgerExists: boolean;
  applied: { name: string; sql: string }[];
  failOn?: { name: string; phase: "sql" | "ledger" };
  ensureLedgerCalls: number;
  applyCalls: { name: string; sql: string }[];
}

function makeFakeAdapter(state: FakeAdapterState): MigrationAdapter {
  return {
    async ensureLedger() {
      state.ensureLedgerCalls += 1;
      state.ledgerExists = true;
    },
    async getAppliedNames() {
      if (!state.ledgerExists) return [];
      return state.applied.map((m) => m.name);
    },
    async applyMigration(_table, name, sql) {
      state.applyCalls.push({ name, sql });
      if (state.failOn?.name === name && state.failOn.phase === "sql") {
        throw new Error(`forced failure on ${name}`);
      }
      // Atomicity simulation: only insert into ledger if SQL phase
      // succeeded. Mid-batch failures must not leave the ledger row.
      state.applied.push({ name, sql });
      if (state.failOn?.name === name && state.failOn.phase === "ledger") {
        // Roll back simulation — drop the row we just appended.
        state.applied.pop();
        throw new Error(`forced ledger insert failure on ${name}`);
      }
    },
  };
}

const FILES: MigrationFile[] = [
  { name: "001_a.sql", sql: "CREATE TABLE a (id INT);" },
  { name: "002_b.sql", sql: "CREATE TABLE b (id INT);" },
  { name: "003_c.sql", sql: "CREATE TABLE c (id INT);" },
];

describe("runMigrations — runner contract", () => {
  it("applies all files on a fresh ledger and reports them as applied", async () => {
    const state: FakeAdapterState = {
      ledgerExists: false,
      applied: [],
      ensureLedgerCalls: 0,
      applyCalls: [],
    };
    const result = await runMigrations({
      adapter: makeFakeAdapter(state),
      files: FILES,
    });
    expect(result.applied).toEqual(["001_a.sql", "002_b.sql", "003_c.sql"]);
    expect(result.skipped).toEqual([]);
    expect(result.tableName).toBe(DEFAULT_MIGRATIONS_TABLE);
    expect(state.applyCalls.map((c) => c.name)).toEqual([
      "001_a.sql",
      "002_b.sql",
      "003_c.sql",
    ]);
  });

  it("re-running over an already-migrated ledger is a no-op (idempotent)", async () => {
    const state: FakeAdapterState = {
      ledgerExists: false,
      applied: [],
      ensureLedgerCalls: 0,
      applyCalls: [],
    };
    const adapter = makeFakeAdapter(state);
    await runMigrations({ adapter, files: FILES });
    const firstRunApplyCount = state.applyCalls.length;

    const second = await runMigrations({ adapter, files: FILES });

    // No new applies: the runner saw all three names in the ledger
    // and skipped them.
    expect(state.applyCalls.length).toBe(firstRunApplyCount);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(["001_a.sql", "002_b.sql", "003_c.sql"]);
  });

  it("applies files in lexicographic order regardless of input order", async () => {
    const state: FakeAdapterState = {
      ledgerExists: false,
      applied: [],
      ensureLedgerCalls: 0,
      applyCalls: [],
    };
    const reversed: MigrationFile[] = [...FILES].reverse();
    const result = await runMigrations({
      adapter: makeFakeAdapter(state),
      files: reversed,
    });
    expect(result.applied).toEqual(["001_a.sql", "002_b.sql", "003_c.sql"]);
    expect(state.applyCalls.map((c) => c.name)).toEqual([
      "001_a.sql",
      "002_b.sql",
      "003_c.sql",
    ]);
  });

  it("aborts on mid-batch failure, preserving prior ledger rows", async () => {
    const state: FakeAdapterState = {
      ledgerExists: false,
      applied: [],
      failOn: { name: "002_b.sql", phase: "sql" },
      ensureLedgerCalls: 0,
      applyCalls: [],
    };
    const adapter = makeFakeAdapter(state);

    await expect(
      runMigrations({ adapter, files: FILES }),
    ).rejects.toBeInstanceOf(MigrationFailedError);

    // Only the first migration is committed. The failing one and the
    // one after it are untouched.
    expect(state.applied.map((m) => m.name)).toEqual(["001_a.sql"]);
    // The runner attempted the failing file but did not attempt the
    // file after it.
    expect(state.applyCalls.map((c) => c.name)).toEqual([
      "001_a.sql",
      "002_b.sql",
    ]);
  });

  it("a fixed migration in a follow-up run resumes from the previously-failed file", async () => {
    const state: FakeAdapterState = {
      ledgerExists: false,
      applied: [],
      failOn: { name: "002_b.sql", phase: "sql" },
      ensureLedgerCalls: 0,
      applyCalls: [],
    };
    const adapter = makeFakeAdapter(state);

    await expect(
      runMigrations({ adapter, files: FILES }),
    ).rejects.toBeInstanceOf(MigrationFailedError);

    // "Fix" the broken migration — drop the failure flag.
    state.failOn = undefined;

    const second = await runMigrations({ adapter, files: FILES });

    expect(second.applied).toEqual(["002_b.sql", "003_c.sql"]);
    expect(second.skipped).toEqual(["001_a.sql"]);
    expect(state.applied.map((m) => m.name)).toEqual([
      "001_a.sql",
      "002_b.sql",
      "003_c.sql",
    ]);
  });

  it("ensureLedger runs every invocation (idempotent in adapter)", async () => {
    const state: FakeAdapterState = {
      ledgerExists: false,
      applied: [],
      ensureLedgerCalls: 0,
      applyCalls: [],
    };
    const adapter = makeFakeAdapter(state);
    await runMigrations({ adapter, files: FILES });
    await runMigrations({ adapter, files: FILES });
    expect(state.ensureLedgerCalls).toBe(2);
  });

  it("respects custom tableName option", async () => {
    const state: FakeAdapterState = {
      ledgerExists: false,
      applied: [],
      ensureLedgerCalls: 0,
      applyCalls: [],
    };
    const result = await runMigrations({
      adapter: makeFakeAdapter(state),
      files: FILES,
      tableName: "schema_migrations",
    });
    expect(result.tableName).toBe("schema_migrations");
  });

  it("rejects an invalid migrations ledger table name", async () => {
    const state: FakeAdapterState = {
      ledgerExists: false,
      applied: [],
      ensureLedgerCalls: 0,
      applyCalls: [],
    };
    await expect(
      runMigrations({
        adapter: makeFakeAdapter(state),
        files: FILES,
        tableName: 'evil"; DROP TABLE users; --',
      }),
    ).rejects.toThrow(/Invalid migrations ledger table name/);
  });

  it("rejects malformed migration filenames before applying anything", async () => {
    const state: FakeAdapterState = {
      ledgerExists: false,
      applied: [],
      ensureLedgerCalls: 0,
      applyCalls: [],
    };
    await expect(
      runMigrations({
        adapter: makeFakeAdapter(state),
        files: [{ name: "bad-name.sql", sql: "" }],
      }),
    ).rejects.toThrow(/Invalid migration filename/);
    // Critically: the runner threw before touching the adapter.
    expect(state.ensureLedgerCalls).toBe(0);
    expect(state.applyCalls.length).toBe(0);
  });

  it("emits log events in order: ensure → applying → applied → skipped", async () => {
    const state: FakeAdapterState = {
      ledgerExists: false,
      applied: [],
      ensureLedgerCalls: 0,
      applyCalls: [],
    };
    const events: MigrationLogEvent[] = [];
    const logger = vi.fn((e: MigrationLogEvent) => {
      events.push(e);
    });
    await runMigrations({
      adapter: makeFakeAdapter(state),
      files: FILES,
      logger,
    });
    // Subsequent run — re-uses the same in-memory ledger.
    await runMigrations({
      adapter: makeFakeAdapter(state),
      files: FILES,
      logger,
    });
    const types = events.map((e) => e.type);
    expect(types).toEqual([
      "ensure_ledger",
      "applying",
      "applied",
      "applying",
      "applied",
      "applying",
      "applied",
      "ensure_ledger",
      "skipped",
      "skipped",
      "skipped",
    ]);
  });
});
