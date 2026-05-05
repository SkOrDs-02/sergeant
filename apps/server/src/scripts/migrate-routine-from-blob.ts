#!/usr/bin/env node
/**
 * One-off backfill: `module_data.data->'routine'` → `routine_entries`
 * + `routine_streaks`.
 *
 * Stage 2 / PR #020 із `docs/planning/storage-roadmap.md`. Створює
 * нормалізовані рядки на основі legacy whole-blob payload-а Routine
 * модуля. Запускається DBA-роллю після того, як міграція 026 застосована,
 * і ПЕРЕД тим, як Stage 4 (PR #024) почне dual-write з клієнта.
 *
 * Гарантії:
 *
 *   * Idempotent — повторний запуск НЕ дублює рядки. Перевірка через
 *     natural-key `(user_id, name, created_at)` для entries; UPSERT для
 *     streaks (PRIMARY KEY = user_id).
 *   * Defensive — malformed JSON у `module_data.data` логується і
 *     пропускається, не валить весь батч.
 *   * Read-only щодо `module_data` — НЕ видаляє і НЕ оновлює існуючий
 *     blob. Stage 4 dual-write фаза ще на нього спирається.
 *
 * Usage:
 *
 *   pnpm --filter @sergeant/server tsx src/scripts/migrate-routine-from-blob.ts [--dry-run]
 *
 * `--dry-run` — лише логує те, що було б записано; жодних INSERT/UPDATE.
 */

import pg from "pg";
import type { Pool, PoolClient } from "pg";

interface ModuleDataRow {
  user_id: string;
  data: unknown;
}

interface RoutineHabit {
  id: string;
  name: string;
  createdAt?: string | undefined;
  archived?: boolean | undefined;
}

interface RoutineBlob {
  habits?: RoutineHabit[] | undefined;
  completions?: Record<string, string[]> | undefined;
}

export interface BackfillSummary {
  usersProcessed: number;
  usersSkippedMalformed: number;
  entriesInserted: number;
  entriesSkippedExisting: number;
  streaksUpserted: number;
}

export interface BackfillOptions {
  dryRun?: boolean;
  /** Per-user log line emitter; defaults to `console.log` (JSON). */
  log?: (msg: Record<string, unknown>) => void;
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse a date-key (`YYYY-MM-DD`) into a UTC noon Date. Noon avoids
 * tz-boundary surprises when the same key is rendered locally.
 */
function dateFromKey(key: string): Date | null {
  if (!DATE_KEY_RE.test(key)) return null;
  const d = new Date(`${key}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Defensive parse of the routine blob. Returns `null` if the shape is
 * malformed enough that we cannot extract habits/completions safely.
 *
 * `data` is whatever pg returned — `module_data.data` is JSONB, so it
 * usually arrives as an already-parsed object, but legacy rows or partial
 * writes can yield a plain string. Both are handled.
 */
export function parseRoutineBlob(data: unknown): RoutineBlob | null {
  let candidate: unknown = data;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const root = candidate as Record<string, unknown>;
  // The blob lives at `module_data.data->'routine'`. Some early writes
  // wrote it directly at top level (no nested `routine` key); accept both
  // shapes so we don't lose existing user data on backfill.
  const routine =
    root["routine"] && typeof root["routine"] === "object"
      ? (root["routine"] as Record<string, unknown>)
      : root;

  const habitsRaw = routine["habits"];
  const completionsRaw = routine["completions"];

  const habits: RoutineHabit[] = Array.isArray(habitsRaw)
    ? habitsRaw
        .filter(
          (h): h is Record<string, unknown> =>
            !!h && typeof h === "object" && !Array.isArray(h),
        )
        .map((h) => ({
          id: typeof h["id"] === "string" ? h["id"] : "",
          name: typeof h["name"] === "string" ? h["name"] : "",
          createdAt:
            typeof h["createdAt"] === "string" ? h["createdAt"] : undefined,
          archived: h["archived"] === true,
        }))
        .filter((h) => h.id !== "" && h.name !== "")
    : [];

  const completions: Record<string, string[]> = {};
  if (
    completionsRaw &&
    typeof completionsRaw === "object" &&
    !Array.isArray(completionsRaw)
  ) {
    for (const [habitId, list] of Object.entries(
      completionsRaw as Record<string, unknown>,
    )) {
      if (!Array.isArray(list)) continue;
      const dates = list
        .filter(
          (v): v is string => typeof v === "string" && DATE_KEY_RE.test(v),
        )
        .sort();
      if (dates.length > 0) completions[habitId] = dates;
    }
  }

  return { habits, completions };
}

interface PlannedEntry {
  name: string;
  completedAt: Date | null;
  createdAt: Date;
}

/**
 * Compute per-user entries + streak metrics from a parsed blob. Pure —
 * no DB access, easy to unit-test.
 */
export function planUserBackfill(
  blob: RoutineBlob,
  now: Date = new Date(),
): {
  entries: PlannedEntry[];
  streak: {
    currentStreak: number;
    longestStreak: number;
    lastCompletedAt: Date | null;
  };
} {
  const habitsById = new Map<string, RoutineHabit>();
  for (const h of blob.habits ?? []) habitsById.set(h.id, h);

  const entries: PlannedEntry[] = [];

  // 1. One row per (habit, completion). `completed_at` = parsed key,
  //    `created_at` = same (so historical entries don't all collapse to
  //    NOW(); idempotency natural-key includes created_at). Habit name is
  //    denormalized — survives habit deletion.
  const completionDateKeys = new Set<string>();
  for (const [habitId, dateKeys] of Object.entries(blob.completions ?? {})) {
    const habit = habitsById.get(habitId);
    if (!habit) continue;
    for (const key of dateKeys) {
      const d = dateFromKey(key);
      if (!d) continue;
      completionDateKeys.add(key);
      entries.push({
        name: habit.name,
        completedAt: d,
        createdAt: d,
      });
    }
  }

  // 2. Habits that exist but never had completions still get a row. Keeps
  //    "user has habit X" visible to consumers reading routine_entries
  //    without joining anything else. created_at = habit.createdAt if
  //    available else NOW() — gives idempotent natural-key.
  for (const habit of habitsById.values()) {
    if (habit.archived) continue;
    const completed = blob.completions?.[habit.id] ?? [];
    if (completed.length > 0) continue;
    const created = habit.createdAt ? dateFromKey(habit.createdAt) : null;
    entries.push({
      name: habit.name,
      completedAt: null,
      createdAt: created ?? now,
    });
  }

  const streak = computeStreak(completionDateKeys, now);

  return { entries, streak };
}

/**
 * Compute current/longest streak based on the **union** of completion
 * dates across all habits. This avoids re-implementing per-habit
 * scheduling logic (which lives in `@sergeant/routine-domain` and depends
 * on Kyiv-day boundary + recurrence config that the backfill should not
 * pull in). For Stage 2 / PR #020 a coarser metric is acceptable — the
 * client will recompute its own streak after dual-write cut-over.
 */
function computeStreak(
  completionKeys: Set<string>,
  now: Date,
): {
  currentStreak: number;
  longestStreak: number;
  lastCompletedAt: Date | null;
} {
  if (completionKeys.size === 0) {
    return { currentStreak: 0, longestStreak: 0, lastCompletedAt: null };
  }

  const sortedKeys = [...completionKeys].sort();
  const lastKey = sortedKeys[sortedKeys.length - 1];
  const lastCompletedAt = dateFromKey(lastKey!);

  // Longest run of consecutive days in the union.
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sortedKeys.length; i++) {
    const prev = dateFromKey(sortedKeys[i - 1]!);
    const curr = dateFromKey(sortedKeys[i]!);
    if (!prev || !curr) continue;
    const diffDays = Math.round(
      (curr.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (diffDays === 1) {
      current += 1;
      if (current > longest) longest = current;
    } else {
      current = 1;
    }
  }

  // Current streak: walk back from "today" (UTC noon) while each day is
  // present in the set. Allows a one-day grace if the most recent
  // completion was yesterday — matches `streakForHabit` behaviour for the
  // common case where the user is mid-day and hasn't ticked today yet.
  const today = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      12,
      0,
      0,
      0,
    ),
  );
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const todayKey = formatDateKey(today);
  const yesterdayKey = formatDateKey(yesterday);

  let cursor: Date;
  if (completionKeys.has(todayKey)) {
    cursor = today;
  } else if (completionKeys.has(yesterdayKey)) {
    cursor = yesterday;
  } else {
    return { currentStreak: 0, longestStreak: longest, lastCompletedAt };
  }

  let currentStreak = 0;
  for (let i = 0; i < 20 * 366; i++) {
    const key = formatDateKey(cursor);
    if (!completionKeys.has(key)) break;
    currentStreak += 1;
    cursor = new Date(cursor);
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return { currentStreak, longestStreak: longest, lastCompletedAt };
}

function formatDateKey(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, "0");
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Apply the planned backfill for a single user inside a transaction.
 * Idempotent via natural-key check on routine_entries and PK upsert on
 * routine_streaks.
 */
async function applyUserBackfill(
  client: PoolClient,
  userId: string,
  plan: ReturnType<typeof planUserBackfill>,
  dryRun: boolean,
  log: NonNullable<BackfillOptions["log"]>,
): Promise<{ inserted: number; skipped: number; streakUpserted: boolean }> {
  let inserted = 0;
  let skipped = 0;

  for (const entry of plan.entries) {
    if (dryRun) {
      log({
        msg: "routine_backfill_plan_entry",
        userId,
        name: entry.name,
        completedAt: entry.completedAt?.toISOString() ?? null,
        createdAt: entry.createdAt.toISOString(),
      });
      inserted += 1;
      continue;
    }

    // INSERT … WHERE NOT EXISTS pattern instead of ON CONFLICT — there is
    // no UNIQUE constraint on `(user_id, name, created_at)`, and the
    // migration spec deliberately keeps it out (only required indexes).
    const { rowCount } = await client.query(
      `INSERT INTO routine_entries (user_id, name, completed_at, created_at, updated_at)
       SELECT $1, $2, $3, $4, $4
       WHERE NOT EXISTS (
         SELECT 1 FROM routine_entries
         WHERE user_id = $1 AND name = $2 AND created_at = $4
       )`,
      [userId, entry.name, entry.completedAt, entry.createdAt],
    );
    if ((rowCount ?? 0) > 0) inserted += 1;
    else skipped += 1;
  }

  if (dryRun) {
    log({
      msg: "routine_backfill_plan_streak",
      userId,
      currentStreak: plan.streak.currentStreak,
      longestStreak: plan.streak.longestStreak,
      lastCompletedAt: plan.streak.lastCompletedAt?.toISOString() ?? null,
    });
    return { inserted, skipped, streakUpserted: true };
  }

  await client.query(
    `INSERT INTO routine_streaks (user_id, current_streak, longest_streak, last_completed_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE
       SET current_streak = EXCLUDED.current_streak,
           longest_streak = EXCLUDED.longest_streak,
           last_completed_at = EXCLUDED.last_completed_at`,
    [
      userId,
      plan.streak.currentStreak,
      plan.streak.longestStreak,
      plan.streak.lastCompletedAt,
    ],
  );

  return { inserted, skipped, streakUpserted: true };
}

/**
 * Run the backfill against an existing pg.Pool. Exported so integration
 * tests can drive it against a Testcontainers-managed Postgres.
 */
export async function runRoutineBackfill(
  pool: Pool,
  options: BackfillOptions = {},
): Promise<BackfillSummary> {
  const dryRun = options.dryRun ?? false;
  const log =
    options.log ??
    ((msg: Record<string, unknown>) => console.log(JSON.stringify(msg)));

  const summary: BackfillSummary = {
    usersProcessed: 0,
    usersSkippedMalformed: 0,
    entriesInserted: 0,
    entriesSkippedExisting: 0,
    streaksUpserted: 0,
  };

  // Single SELECT — for spot-check ~100 users / 4 KB blob each, that's
  // ~400 KB into memory; acceptable for a one-off backfill. If this ever
  // needs to handle 100k+ users we'd switch to cursor-based iteration.
  const { rows } = await pool.query<ModuleDataRow>(
    `SELECT user_id, data FROM module_data WHERE module = 'routine'`,
  );

  for (const row of rows) {
    const blob = parseRoutineBlob(row.data);
    if (!blob) {
      log({
        msg: "routine_backfill_skipped_malformed",
        userId: row.user_id,
      });
      summary.usersSkippedMalformed += 1;
      continue;
    }

    const plan = planUserBackfill(blob);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await applyUserBackfill(
        client,
        row.user_id,
        plan,
        dryRun,
        log,
      );
      if (dryRun) await client.query("ROLLBACK");
      else await client.query("COMMIT");

      summary.usersProcessed += 1;
      summary.entriesInserted += result.inserted;
      summary.entriesSkippedExisting += result.skipped;
      if (result.streakUpserted) summary.streaksUpserted += 1;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {
        /* best-effort */
      });
      log({
        msg: "routine_backfill_user_error",
        userId: row.user_id,
        err: err instanceof Error ? err.message : String(err),
      });
      summary.usersSkippedMalformed += 1;
    } finally {
      client.release();
    }
  }

  log({
    msg: "routine_backfill_done",
    dryRun,
    ...summary,
  });

  return summary;
}

/**
 * CLI entry point. Builds its own pg.Pool from `DATABASE_URL`. Tests
 * inject their own pool via `runRoutineBackfill`.
 */
async function main() {
  const dryRun = process.argv.includes("--dry-run");

  if (!process.env["DATABASE_URL"]) {
    console.error(
      JSON.stringify({
        msg: "routine_backfill_missing_database_url",
        hint: "Set DATABASE_URL to the target Postgres before running.",
      }),
    );
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
  try {
    await runRoutineBackfill(pool, { dryRun });
  } catch (err) {
    console.error(
      JSON.stringify({
        msg: "routine_backfill_failed",
        err: err instanceof Error ? err.message : String(err),
      }),
    );
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {
      /* best-effort */
    });
  }
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /migrate-routine-from-blob\.(ts|js|mjs)$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
