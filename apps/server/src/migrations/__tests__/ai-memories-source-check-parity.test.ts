// Parity test: TS union `ALLOWED_MEMORY_SOURCES`
// (apps/server/src/modules/ai-memory/types.ts) ↔ the *current* SQL
// `ai_memories_source_check` CHECK-constraint, as it stands after replaying
// every forward migration in filename order.
//
// Why this exists (L-8, аудит Профілю/Налаштувань 2026-08-08,
// docs/90-work/audits/2026-08-08-profile-settings-deep-audit.md): the
// two-phase "add a source" process documented in `types.ts`'s
// `ALLOWED_MEMORY_SOURCES` docstring depends on these two lists never
// drifting apart. Migration 068 already ships this exact class of drift
// risk (a hand-copied CHECK list next to a hand-copied TS union) with no
// automated guard — this test closes that gap so a future migration that
// bumps one list but not the other fails fast, in-process, without needing
// Docker/Testcontainers (unlike the `054-ai-memories-persona-topic.test.ts`
// style round-trip tests, which spin up pgvector/pgvector:pg17).
//
// How it works: scans every forward `NNN_*.sql` file (never `.down.sql`) in
// migration-number order and extracts the last `CHECK (source IN (...))`
// list found across all of them. This mirrors how the real schema evolves —
// `ai_memories_source_check` is DROP + re-ADD'd wholesale on every bump
// (025 inline CHECK, then 028/068/118 ALTER TABLE ... ADD CONSTRAINT), never
// incrementally — so "last one wins" reconstructs the constraint as it
// exists in a freshly-migrated database, without needing a live Postgres.
//
// Scope note: спершу тест матчив БУДЬ-ЯКИЙ `CHECK (source IN (...))` у
// директорії міграцій — це було безпечно, поки єдиним таким констрейнтом
// був `ai_memories_source_check`. Міграція 121 (`receipts.source IN
// ('dps','vision','silpo')`) зламала це припущення рівно так, як
// передбачав старий коментар, тому тепер сканування скоуплене до
// SQL-стейтментів, що згадують `ai_memories`: файл ріжеться по `;`, і
// регекс проганяється лише по стейтментах з `ai_memories` усередині
// (покриває і inline CHECK у CREATE TABLE 025, і ALTER TABLE ... ADD
// CONSTRAINT у 028/068/118).
//
// Фаза 1 ініціативи 0024 (2026-09-03): `ALLOWED_MEMORY_SOURCES` звужено до
// того, що реально пишеться, а CHECK ще тримає шість знятих значень для
// legacy-рядків. Тому SQL порівнюється зі `STORED_MEMORY_SOURCES`
// (= ALLOWED + RETIRED), а окремий кейс вимагає, щоб ALLOWED і RETIRED не
// перетинались. Коли PR-3 звузить CHECK, `RETIRED_MEMORY_SOURCES`
// спорожніє, і цей тест знову зведеться до ALLOWED ↔ SQL.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALLOWED_MEMORY_SOURCES,
  RETIRED_MEMORY_SOURCES,
  STORED_MEMORY_SOURCES,
} from "../../modules/ai-memory/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..");

const CHECK_SOURCE_IN_RE = /CHECK\s*\(\s*source\s+IN\s*\(([\s\S]*?)\)\s*\)/gi;
const QUOTED_STRING_RE = /'([^']+)'/g;

/**
 * Reads every forward migration file (`NNN_*.sql`, excluding
 * `*.down.sql`) in filename-sorted (== migration-number) order and returns
 * the source list from the LAST `CHECK (source IN (...))` occurrence found
 * — i.e. the constraint as it stands after all migrations have applied.
 */
function currentSourceCheckList(): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f) && !f.endsWith(".down.sql"))
    .sort();

  let last: string[] | null = null;
  for (const file of files) {
    const content = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    // Лише стейтменти про ai_memories — інші таблиці мають право на
    // власні `CHECK (source IN (...))` (першою стала receipts у 121).
    const aiMemoriesStatements = content
      .split(";")
      .filter((stmt) => /ai_memories/i.test(stmt));
    const matches = aiMemoriesStatements.flatMap((stmt) => [
      ...stmt.matchAll(CHECK_SOURCE_IN_RE),
    ]);
    if (matches.length === 0) continue;
    // A single migration is not expected to touch this constraint more than
    // once; if it did, the last match in the file wins (mirrors SQL
    // execution order top-to-bottom).
    const inner = matches[matches.length - 1]?.[1] ?? "";
    last = [...inner.matchAll(QUOTED_STRING_RE)].map((m) => m[1] as string);
  }

  if (last === null) {
    throw new Error(
      "No `CHECK (source IN (...))` found in any forward migration file — " +
        "did 025_ai_memories_pgvector.sql get renamed or deleted?",
    );
  }
  return last;
}

describe("ai_memories.source — TS union ↔ SQL CHECK parity", () => {
  it("STORED_MEMORY_SOURCES (ALLOWED + RETIRED) matches the current ai_memories_source_check list", () => {
    const sqlSources = currentSourceCheckList();

    // Set-based comparison (order-independent — the CHECK list and the TS
    // union are not guaranteed to be written in the same order, and
    // shouldn't need to be).
    const sqlSet = new Set(sqlSources);
    const tsSet = new Set<string>(STORED_MEMORY_SOURCES);

    const onlyInSql = [...sqlSet].filter((s) => !tsSet.has(s));
    const onlyInTs = [...tsSet].filter((s) => !sqlSet.has(s));

    expect(
      onlyInSql,
      "source(s) present in the SQL CHECK constraint but missing from " +
        "STORED_MEMORY_SOURCES (ALLOWED + RETIRED) in " +
        "apps/server/src/modules/ai-memory/types.ts",
    ).toEqual([]);
    expect(
      onlyInTs,
      "source(s) present in STORED_MEMORY_SOURCES but missing from the SQL " +
        "ai_memories_source_check CHECK constraint (bump the CHECK in a new " +
        "migration, per the two-phase process documented on " +
        "ALLOWED_MEMORY_SOURCES)",
    ).toEqual([]);

    // No duplicates on either side — a duplicate in the SQL list is a
    // harmless no-op for Postgres, but usually signals a copy-paste slip
    // that should be caught in review.
    expect(sqlSources.length, "duplicate entries in SQL CHECK list").toBe(
      sqlSet.size,
    );
    expect(
      STORED_MEMORY_SOURCES.length,
      "duplicate entries across ALLOWED_MEMORY_SOURCES + RETIRED_MEMORY_SOURCES",
    ).toBe(tsSet.size);
  });

  it("RETIRED_MEMORY_SOURCES is disjoint from ALLOWED_MEMORY_SOURCES", () => {
    const allowed = new Set<string>(ALLOWED_MEMORY_SOURCES);
    expect(
      RETIRED_MEMORY_SOURCES.filter((s) => allowed.has(s)),
      "a source cannot be both accepted by the API and retired",
    ).toEqual([]);
  });

  it("includes `profile` (migration 118, L-8 profile→ai-memory mirror, Phase 1)", () => {
    expect(ALLOWED_MEMORY_SOURCES).toContain("profile");
    expect(currentSourceCheckList()).toContain("profile");
  });
});
