import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import {
  extractSqlTables,
  OpenClawAllowlistError,
  OpenClawNotFoundError,
  queryAppDb,
  readStrategyDoc,
} from "./tools.js";

describe("extractSqlTables", () => {
  it("captures simple FROM tables", () => {
    expect(extractSqlTables("SELECT * FROM subscriptions")).toEqual([
      "subscriptions",
    ]);
  });

  it("captures multiple FROM/JOIN tables", () => {
    expect(
      extractSqlTables(
        "SELECT u.id FROM users u JOIN payments p ON u.id = p.user_id",
      ).sort(),
    ).toEqual(["payments", "users"]);
  });

  it("ignores tables inside string literals", () => {
    expect(
      extractSqlTables("SELECT 'FROM auth_secret' FROM subscriptions"),
    ).toEqual(["subscriptions"]);
  });

  it("ignores tables inside line comments", () => {
    expect(
      extractSqlTables("-- FROM auth_secret\nSELECT * FROM subscriptions"),
    ).toEqual(["subscriptions"]);
  });

  it("handles ONLY keyword", () => {
    expect(extractSqlTables("SELECT * FROM ONLY subscriptions")).toEqual([
      "subscriptions",
    ]);
  });

  it("is case-insensitive", () => {
    expect(extractSqlTables("select * from Subscriptions")).toEqual([
      "subscriptions",
    ]);
  });
});

/**
 * Minimal fake `Pool` for queryAppDb security tests. Returns empty rows for
 * any query so we focus on allowlist checks, not query execution itself.
 */
function makeFakePool(): { pool: Pool; calls: string[] } {
  const calls: string[] = [];
  const pool = {
    async query(text: string) {
      calls.push(text);
      return { rows: [], rowCount: 0 };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as Pool;
  return { pool, calls };
}

describe("queryAppDb security boundaries", () => {
  it("rejects INSERT", async () => {
    const { pool, calls } = makeFakePool();
    await expect(
      queryAppDb(pool, { sql: "INSERT INTO users VALUES (1)" }),
    ).rejects.toThrow(OpenClawAllowlistError);
    expect(calls).toHaveLength(0);
  });

  it("rejects UPDATE", async () => {
    const { pool, calls } = makeFakePool();
    await expect(
      queryAppDb(pool, { sql: "UPDATE users SET id = 1" }),
    ).rejects.toThrow(OpenClawAllowlistError);
    expect(calls).toHaveLength(0);
  });

  it("rejects DELETE", async () => {
    const { pool, calls } = makeFakePool();
    await expect(
      queryAppDb(pool, { sql: "DELETE FROM users" }),
    ).rejects.toThrow(OpenClawAllowlistError);
    expect(calls).toHaveLength(0);
  });

  it("rejects DROP", async () => {
    const { pool, calls } = makeFakePool();
    await expect(queryAppDb(pool, { sql: "DROP TABLE users" })).rejects.toThrow(
      OpenClawAllowlistError,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects forbidden tables (auth_*)", async () => {
    const { pool, calls } = makeFakePool();
    await expect(
      queryAppDb(pool, { sql: "SELECT * FROM auth_secret" }),
    ).rejects.toThrow(/auth_secret/);
    expect(calls).toHaveLength(0);
  });

  it("rejects forbidden tables (ai_memories)", async () => {
    const { pool, calls } = makeFakePool();
    await expect(
      queryAppDb(pool, { sql: "SELECT * FROM ai_memories" }),
    ).rejects.toThrow(/ai_memories/);
    expect(calls).toHaveLength(0);
  });

  it("rejects forbidden tables (ai_usage_daily)", async () => {
    const { pool, calls } = makeFakePool();
    await expect(
      queryAppDb(pool, { sql: "SELECT * FROM ai_usage_daily" }),
    ).rejects.toThrow(/ai_usage_daily/);
    expect(calls).toHaveLength(0);
  });

  it("rejects mixed query if any table is forbidden", async () => {
    const { pool, calls } = makeFakePool();
    await expect(
      queryAppDb(pool, {
        sql: "SELECT * FROM users JOIN sync_audit_log USING (id)",
      }),
    ).rejects.toThrow(/sync_audit_log/);
    expect(calls).toHaveLength(0);
  });

  it("admits an allowlisted SELECT", async () => {
    const { pool, calls } = makeFakePool();
    const result = await queryAppDb(pool, {
      sql: "SELECT id FROM users",
    });
    expect(result.tablesUsed).toEqual(["users"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("FROM (SELECT id FROM users)");
    expect(calls[0]).toContain("LIMIT 200");
  });

  it("admits a multi-table allowlisted JOIN", async () => {
    const { pool, calls } = makeFakePool();
    const result = await queryAppDb(pool, {
      sql: "SELECT u.id FROM users u JOIN mono_transaction m ON u.id = m.user_id",
    });
    expect(result.tablesUsed.sort()).toEqual(["mono_transaction", "users"]);
    expect(calls).toHaveLength(1);
  });

  it("rejects allowlist-stale 'subscriptions' table", async () => {
    // ADR-0031: `subscriptions` була в allowlist-і, але в схемі немає такої
    // таблиці (лише `push_subscriptions`). Раніше LLM-pre-fill SQL валив
    // прод 5xx-ом → Sentry-fatal. `subscriptions` прибрано з allowlist-у
    // у `types.ts` — тепер відхиляється на pre-DB-check.
    const { pool, calls } = makeFakePool();
    await expect(
      queryAppDb(pool, { sql: "SELECT * FROM subscriptions" }),
    ).rejects.toThrow(/subscriptions/);
    expect(calls).toHaveLength(0);
  });

  it("rejects allowlist-stale 'payments' table", async () => {
    // Як і `subscriptions` — aspirational stub без міграції.
    const { pool, calls } = makeFakePool();
    await expect(
      queryAppDb(pool, { sql: "SELECT * FROM payments" }),
    ).rejects.toThrow(/payments/);
    expect(calls).toHaveLength(0);
  });

  // Друга чистка allowlist-у: записи, що або не існують у схемі
  // (`digest_runs`, `nutrition_entries`), або названі неправильно
  // (`n8n_errors`, `mono_transactions`, `routines` — без відповідних
  // міграцій). Кожен раніше валив прод 5xx-ом, бо проходив allowlist-чек
  // і Postgres скидав `relation "X" does not exist`. Тепер fail-closed
  // на pre-DB-check.

  it("rejects allowlist-stale 'digest_runs' table", async () => {
    const { pool, calls } = makeFakePool();
    await expect(
      queryAppDb(pool, { sql: "SELECT * FROM digest_runs" }),
    ).rejects.toThrow(/digest_runs/);
    expect(calls).toHaveLength(0);
  });

  it("rejects allowlist-stale 'nutrition_entries' table", async () => {
    const { pool, calls } = makeFakePool();
    await expect(
      queryAppDb(pool, { sql: "SELECT * FROM nutrition_entries" }),
    ).rejects.toThrow(/nutrition_entries/);
    expect(calls).toHaveLength(0);
  });

  it("rejects 'n8n_errors' (real table is `n8n_failure_events`)", async () => {
    const { pool, calls } = makeFakePool();
    await expect(
      queryAppDb(pool, { sql: "SELECT * FROM n8n_errors" }),
    ).rejects.toThrow(/n8n_errors/);
    expect(calls).toHaveLength(0);
  });

  it("rejects 'mono_transactions' (real table is `mono_transaction` singular)", async () => {
    const { pool, calls } = makeFakePool();
    await expect(
      queryAppDb(pool, { sql: "SELECT * FROM mono_transactions" }),
    ).rejects.toThrow(/mono_transactions/);
    expect(calls).toHaveLength(0);
  });

  it("rejects 'routines' (real tables are `routine_entries` / `routine_streaks`)", async () => {
    const { pool, calls } = makeFakePool();
    await expect(
      queryAppDb(pool, { sql: "SELECT * FROM routines" }),
    ).rejects.toThrow(/routines/);
    expect(calls).toHaveLength(0);
  });

  it("admits the corrected `n8n_failure_events` table", async () => {
    const { pool, calls } = makeFakePool();
    const result = await queryAppDb(pool, {
      sql: "SELECT id FROM n8n_failure_events",
    });
    expect(result.tablesUsed).toEqual(["n8n_failure_events"]);
    expect(calls).toHaveLength(1);
  });

  it("admits the corrected `routine_entries` and `routine_streaks` tables", async () => {
    const { pool, calls } = makeFakePool();
    const result = await queryAppDb(pool, {
      sql: "SELECT e.id FROM routine_entries e JOIN routine_streaks s ON e.routine_id = s.routine_id",
    });
    expect(result.tablesUsed.sort()).toEqual([
      "routine_entries",
      "routine_streaks",
    ]);
    expect(calls).toHaveLength(1);
  });

  it("clamps LIMIT to <=1000", async () => {
    const { pool, calls } = makeFakePool();
    await queryAppDb(pool, {
      sql: "SELECT id FROM users",
      limit: 1_000_000,
    });
    expect(calls[0]).toContain("LIMIT 1000");
  });

  it("uses default LIMIT=200 when unspecified", async () => {
    const { pool, calls } = makeFakePool();
    await queryAppDb(pool, { sql: "SELECT id FROM users" });
    expect(calls[0]).toContain("LIMIT 200");
  });

  it("rejects WITH (CTE) queries (Phase 1 — CTE alias detected as table)", async () => {
    // У Phase 1 наш `extractSqlTables` навмисно простий: CTE-аліас типу
    // `WITH x AS (...)` теж потрапляє у tables-set, не проходить allowlist.
    // Це fail-closed behaviour: краще rejected-ний CTE, ніж шанс на bypass
    // через `WITH x AS (SELECT * FROM auth_secret) SELECT * FROM x`.
    const { pool, calls } = makeFakePool();
    await expect(
      queryAppDb(pool, {
        sql: "WITH x AS (SELECT id FROM users) SELECT * FROM x",
      }),
    ).rejects.toBeInstanceOf(OpenClawAllowlistError);
    expect(calls).toHaveLength(0);
  });
});

describe("readStrategyDoc security boundaries", () => {
  it("rejects path traversal attempts", async () => {
    await expect(
      readStrategyDoc({ path: "../../etc/passwd" }),
    ).rejects.toBeInstanceOf(OpenClawAllowlistError);
  });

  it("rejects paths outside the allowlist", async () => {
    await expect(
      readStrategyDoc({ path: "apps/server/src/env.ts" }),
    ).rejects.toBeInstanceOf(OpenClawAllowlistError);
  });

  it("rejects raw filesystem paths", async () => {
    await expect(
      readStrategyDoc({ path: "/etc/passwd" }),
    ).rejects.toBeInstanceOf(OpenClawAllowlistError);
  });
});

describe("readStrategyDoc ENOENT handling (allowlist-prefix exists, target missing)", () => {
  // Створюємо ізольований fake-repo-root з пустим `docs/`-tree-ом — підмінює
  // `OPENCLAW_REPO_ROOT` env-змінну, щоб readStrategyDoc дивився сюди, а не
  // в реальний repo. Це reproduce-нюс прод-ситуацію, де `docs/decisions/`
  // ще фізично не існує (до першого `record_decision`-PR-у), але path у
  // allowlist-і.
  let fakeRepoRoot: string;
  let originalEnv: string | undefined;

  beforeAll(async () => {
    fakeRepoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-tools-"));
    originalEnv = process.env.OPENCLAW_REPO_ROOT;
    process.env.OPENCLAW_REPO_ROOT = fakeRepoRoot;
  });

  afterAll(async () => {
    if (originalEnv === undefined) {
      delete process.env.OPENCLAW_REPO_ROOT;
    } else {
      process.env.OPENCLAW_REPO_ROOT = originalEnv;
    }
    await fs.rm(fakeRepoRoot, { recursive: true, force: true });
  });

  it("throws OpenClawNotFoundError (NOT generic Error) when allowed dir missing", async () => {
    // `docs/decisions/` — у allowlist-і, але директорії в fake-root-і немає.
    // До фіксу: `fs.stat` бабахав ENOENT → asyncHandler → 5xx → Sentry-fatal.
    // Зараз: typed `OpenClawNotFoundError` → route-handler віддає 404 з
    // `{ error: 'not_found' }`, без забруднення Sentry.
    await expect(
      readStrategyDoc({ path: "docs/decisions/" }),
    ).rejects.toBeInstanceOf(OpenClawNotFoundError);
  });

  it("throws OpenClawNotFoundError when allowed file missing", async () => {
    await expect(
      readStrategyDoc({ path: "docs/launch/missing-file.md" }),
    ).rejects.toBeInstanceOf(OpenClawNotFoundError);
  });

  it("reads existing files inside the allowlist", async () => {
    const launchDir = path.join(fakeRepoRoot, "docs", "launch");
    await fs.mkdir(launchDir, { recursive: true });
    await fs.writeFile(
      path.join(launchDir, "plan.md"),
      "# Launch plan\n",
      "utf-8",
    );

    const result = await readStrategyDoc({ path: "docs/launch/plan.md" });
    expect(result.contents).toContain("# Launch plan");
    expect(result.size).toBeGreaterThan(0);
  });
});

// Sanity-check that `vi` is used (avoid linter-warning if unused above).
void vi;
