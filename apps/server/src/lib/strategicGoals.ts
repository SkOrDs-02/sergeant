/**
 * PR-34 — strategic mode skeleton: per-persona weekly goals datalayer.
 *
 * Контекст: OpenClaw зараз tactical. Strategic mode — proactive: щотижня
 * (WF-26 cron Mon 09:00 Kyiv) kick-off planning conversation, що формує
 * weekly goals per persona, tracks them, reminds. PR-34 — лише skeleton:
 * helper (цей файл), endpoint (`routes/internal/strategic.ts`), workflow
 * (`ops/n8n-workflows/26-strategic-weekly.json`) і UI placeholder. Full
 * conversation flow — окремий PR (заплановано PR-35+).
 *
 * Інваріанти:
 *   * Hard Rule #1 (DB types): `id` повертається як `number`, а не string,
 *     щоб RQ caches / OpenAPI types не отримували string-bigint.
 *   * Hard Rule #15 (governance + Ukrainian docs).
 *   * Domain invariants (`docs/architecture/domain-invariants.md`):
 *       - `week_start` — DATE як `YYYY-MM-DD` у Kyiv local. Helper приймає
 *         або `Date` (тоді конверт-ить у `YYYY-MM-DD`), або вже-готовий
 *         string. Понеділок ISO-тижня — обов'язково.
 *       - `founder_user_id` — Better Auth opaque string ID (НЕ UUID).
 *   * Fail-open: помилки БД логуються через pino і **НЕ** кидаються наверх.
 *     Caller отримує `null` (для create/update) або `[]` (для list-у).
 *     Чому: weekly cron WF-26 не має блокувати execution-у наступних n8n
 *     nodes, якщо БД тимчасово недоступна; UI add-goal form показує неуспіх
 *     як banner, не як 500. Якщо потрібно жорстке throw — caller має сам
 *     wrap-нути або викликати `*OrThrow` варіант (поки що не існує).
 *
 * Persona catalog: `finyk | fizruk | nutrition | routine` — той самий enum,
 * що `ai_memories.source` (migration 025). Runtime-validation на helper-рівні,
 * без CHECK constraint у БД (щоб додавати нові persona без міграції).
 */

import type { Pool } from "pg";
import { logger } from "../obs/logger.js";

/** Канонічний catalog персон у Sergeant; синхронізований з ai_memories.source. */
export const STRATEGIC_GOAL_PERSONAS = [
  "finyk",
  "fizruk",
  "nutrition",
  "routine",
] as const;
export type StrategicGoalPersona = (typeof STRATEGIC_GOAL_PERSONAS)[number];

/** Lifecycle стани goal-у (CHECK constraint у migration 062). */
export const STRATEGIC_GOAL_STATUSES = [
  "active",
  "achieved",
  "abandoned",
  "carried_over",
] as const;
export type StrategicGoalStatus = (typeof STRATEGIC_GOAL_STATUSES)[number];

/** Maximum byte-length goal_text-у — захист від випадкового pushing мегабайтних
 *  free-form prompt-ів через UI. UTF-8 encoded, кепиться у helper до INSERT-у. */
export const MAX_GOAL_TEXT_BYTES = 2 * 1024;

/** Row-shape, який повертається helper-ами назовні. */
export interface StrategicGoal {
  /** BIGSERIAL, coerced to `number` (Hard Rule #1). */
  id: number;
  persona: StrategicGoalPersona;
  founderUserId: string;
  /** `YYYY-MM-DD` у Kyiv local. */
  weekStart: string;
  goalText: string;
  status: StrategicGoalStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface StrategicGoalRow {
  id: string;
  persona: string;
  founder_user_id: string;
  week_start: Date | string;
  goal_text: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateGoalInput {
  persona: StrategicGoalPersona;
  founderUserId: string;
  /** Понеділок ISO-тижня. Або `Date` (буде конверт-нуто у `YYYY-MM-DD`
   *  Kyiv-local), або готовий string у форматі `YYYY-MM-DD`. */
  weekStart: Date | string;
  goalText: string;
  /** Дефолт — `'active'` (БД-default). Передається лише для seeder-у/тестів. */
  status?: StrategicGoalStatus;
}

export interface ListGoalsForWeekInput {
  persona?: StrategicGoalPersona;
  founderUserId?: string;
  weekStart: Date | string;
  /** Опційний status-фільтр. `undefined` = no filter (all statuses). */
  status?: StrategicGoalStatus;
}

export interface ListGoalsInput {
  founderUserId?: string;
  persona?: StrategicGoalPersona;
  status?: StrategicGoalStatus;
  /** Cap on rows returned. Defaults to 50; helper enforces hard cap of 200. */
  limit?: number;
}

/**
 * Конверт-ить `Date | string` у `YYYY-MM-DD` Kyiv local. Якщо отримав
 * вже-стрічку у форматі `YYYY-MM-DD` — повертає її як є. Для `Date`-у —
 * рахує Kyiv-local-day через `Intl.DateTimeFormat`.
 *
 * Чому не `Date.toISOString().slice(0, 10)`: то UTC-day, а домен — Kyiv-day.
 * Понеділок 00:30 Kyiv (UTC 21:30 неділя влітку) дав би неділю — помилка.
 */
export function toKyivDateString(input: Date | string): string {
  if (typeof input === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
    return toKyivDateString(new Date(input));
  }
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(input);
}

/**
 * Runtime-validation persona. Helper-validation замість CHECK у БД, щоб
 * додавати нові personas без міграції; але невалідне значення на цьому
 * шарі — bug у caller-і.
 */
function assertValidPersona(
  value: string,
): asserts value is StrategicGoalPersona {
  if (!STRATEGIC_GOAL_PERSONAS.includes(value as StrategicGoalPersona)) {
    throw new Error(
      `strategicGoals: invalid persona '${value}', expected one of ${STRATEGIC_GOAL_PERSONAS.join(", ")}`,
    );
  }
}

function assertValidStatus(
  value: string,
): asserts value is StrategicGoalStatus {
  if (!STRATEGIC_GOAL_STATUSES.includes(value as StrategicGoalStatus)) {
    throw new Error(
      `strategicGoals: invalid status '${value}', expected one of ${STRATEGIC_GOAL_STATUSES.join(", ")}`,
    );
  }
}

/**
 * `week_start` columns у Postgres повертаються як `Date` (pg type 1082).
 * Конверт-имо у `YYYY-MM-DD`-string для serialize-у назовні.
 */
function rowToGoal(row: StrategicGoalRow): StrategicGoal {
  assertValidPersona(row.persona);
  assertValidStatus(row.status);
  const weekStart =
    row.week_start instanceof Date
      ? new Intl.DateTimeFormat("en-CA", {
          // pg returns DATE as UTC-midnight Date; Kyiv-local-day is same calendar
          // day як ISO-date string бо value уже без TZ-offset-у.
          timeZone: "UTC",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(row.week_start)
      : row.week_start;
  return {
    id: Number(row.id),
    persona: row.persona,
    founderUserId: row.founder_user_id,
    weekStart,
    goalText: row.goal_text,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * INSERT goal у `strategic_goals`. Повертає створений рядок або `null`
 * у разі DB-помилки (fail-open).
 *
 * Validation:
 *   * `persona` — runtime assert проти `STRATEGIC_GOAL_PERSONAS`.
 *   * `goalText` — кепиться до `MAX_GOAL_TEXT_BYTES` (2 KB). Більший
 *     текст ріжеться, але INSERT все одно проходить — каллер бачить
 *     trim-нутий goal_text у result.
 *   * `weekStart` — конверт-ить у `YYYY-MM-DD` Kyiv-local.
 *   * `status` (опційно) — runtime assert; дефолт DB робить `'active'`.
 */
export async function createGoal(
  pool: Pool,
  input: CreateGoalInput,
): Promise<StrategicGoal | null> {
  try {
    assertValidPersona(input.persona);
    if (input.status !== undefined) assertValidStatus(input.status);

    const weekStart = toKyivDateString(input.weekStart);
    let goalText = input.goalText;
    if (Buffer.byteLength(goalText, "utf8") > MAX_GOAL_TEXT_BYTES) {
      // Простий byte-truncate; може обірвати multi-byte char, але це не
      // критично для UI-render-у (replacement-char достатньо рідкий).
      const buf = Buffer.from(goalText, "utf8").subarray(
        0,
        MAX_GOAL_TEXT_BYTES,
      );
      goalText = buf.toString("utf8");
      logger.warn({
        msg: "strategic_goals_goal_text_truncated",
        persona: input.persona,
        founderUserId: input.founderUserId,
        originalBytes: Buffer.byteLength(input.goalText, "utf8"),
        limit: MAX_GOAL_TEXT_BYTES,
      });
    }

    // Двa fixed SQL-string варіанти — з або без `status`-у — щоб уникнути
    // dynamic template-literal-SQL (lint rule `no-restricted-syntax`,
    // `pool.query(\`…${…}…\`)`). Усі identifier-fragments — hard-coded,
    // тож SQL-injection поверхні немає; це лише cleanup для лінтера.
    const result =
      input.status === undefined
        ? await pool.query<StrategicGoalRow>(
            `INSERT INTO strategic_goals (persona, founder_user_id, week_start, goal_text)
             VALUES ($1, $2, $3, $4)
             RETURNING id, persona, founder_user_id, week_start, goal_text, status, created_at, updated_at`,
            [input.persona, input.founderUserId, weekStart, goalText],
          )
        : await pool.query<StrategicGoalRow>(
            `INSERT INTO strategic_goals (persona, founder_user_id, week_start, goal_text, status)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, persona, founder_user_id, week_start, goal_text, status, created_at, updated_at`,
            [
              input.persona,
              input.founderUserId,
              weekStart,
              goalText,
              input.status,
            ],
          );
    const row = result.rows[0];
    if (!row) return null;
    return rowToGoal(row);
  } catch (err) {
    logger.error({
      msg: "strategic_goals_create_failed",
      persona: input.persona,
      founderUserId: input.founderUserId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * SELECT-ить goals для конкретного `week_start`. Фільтри `persona`
 * та `founderUserId` опційні — без них повертає всі goals тижня
 * (для cross-persona UI summary). Сортує за `(persona, created_at ASC)`
 * щоб UI отримав детермінований порядок.
 *
 * Fail-open: на DB-помилку повертає `[]`.
 */
export async function listGoalsForWeek(
  pool: Pool,
  input: ListGoalsForWeekInput,
): Promise<StrategicGoal[]> {
  try {
    if (input.persona !== undefined) assertValidPersona(input.persona);
    const weekStart = toKyivDateString(input.weekStart);

    if (input.status !== undefined) assertValidStatus(input.status);

    // 8 fixed-SQL варіантів (per filter-combo) щоб уникнути
    // dynamic-WHERE template-literal lint warning. Усі identifier
    // fragments — hard-coded; вся variable data — через $-placeholders.
    const result = await runListForWeekQuery(pool, {
      weekStart,
      ...(input.persona !== undefined ? { persona: input.persona } : {}),
      ...(input.founderUserId !== undefined
        ? { founderUserId: input.founderUserId }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    });
    return result.rows.map(rowToGoal);
  } catch (err) {
    logger.error({
      msg: "strategic_goals_list_failed",
      ...(input.persona !== undefined ? { persona: input.persona } : {}),
      ...(input.founderUserId !== undefined
        ? { founderUserId: input.founderUserId }
        : {}),
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * SELECT-ить goal за ID. Для UI-feedback-у в `/strategy`-handler-і та
 * pre-flight check-ів carry/done/abandon (бо endpoint поверне null без
 * контексту через короткий копі-paste fail-open shape).
 *
 * Fail-open: на DB-помилку або no-rows повертає `null`.
 */
export async function getGoalById(
  pool: Pool,
  id: number,
): Promise<StrategicGoal | null> {
  try {
    const result = await pool.query<StrategicGoalRow>(
      `SELECT id, persona, founder_user_id, week_start, goal_text, status, created_at, updated_at
         FROM strategic_goals
        WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return null;
    return rowToGoal(row);
  } catch (err) {
    logger.error({
      msg: "strategic_goals_get_by_id_failed",
      id,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Читає goals з опційними фільтрами без жорсткої прив`язки до конкретного
 * `week_start`. Використовується `/strategy list`-командою, яка показує всі active
 * або всі achieved goals founder-а незалежно від тижня.
 *
 * `ORDER BY week_start DESC, persona ASC, created_at ASC` — найсвіжіші тижні
 * першими. Hard cap `limit` 200 рядків (дефолт 50) щоб UI-payload не розрістався.
 *
 * Fail-open: на DB-помилку повертає `[]`.
 */
export async function listGoals(
  pool: Pool,
  input: ListGoalsInput = {},
): Promise<StrategicGoal[]> {
  try {
    if (input.persona !== undefined) assertValidPersona(input.persona);
    if (input.status !== undefined) assertValidStatus(input.status);
    const limit = Math.min(200, Math.max(1, input.limit ?? 50));

    const result = await runListQuery(pool, {
      ...(input.founderUserId !== undefined
        ? { founderUserId: input.founderUserId }
        : {}),
      ...(input.persona !== undefined ? { persona: input.persona } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      limit,
    });
    return result.rows.map(rowToGoal);
  } catch (err) {
    logger.error({
      msg: "strategic_goals_list_failed",
      ...(input.persona !== undefined ? { persona: input.persona } : {}),
      ...(input.founderUserId !== undefined
        ? { founderUserId: input.founderUserId }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Atomic UPDATE: переносить goal на наступний тиждень (`week_start + 7d`)
 * і виставляє `status='carried_over'`. Реалізовано як `/strategy carry <id>`.
 *
 * Чому single UPDATE, а не INSERT-нового-рядка: зберігаємо ID-посилання
 * для вже формованих audit / message-history-референсів; founder має
 * один персистентний ID для трекінгу. `updated_at` бамп-иться trigger-ом.
 *
 * Fail-open: на DB-помилку або no-rows повертає `null`.
 */
export async function carryGoalToNextWeek(
  pool: Pool,
  id: number,
): Promise<StrategicGoal | null> {
  try {
    const result = await pool.query<StrategicGoalRow>(
      `UPDATE strategic_goals
          SET week_start = week_start + INTERVAL '7 days',
              status = 'carried_over'
        WHERE id = $1
        RETURNING id, persona, founder_user_id, week_start, goal_text, status, created_at, updated_at`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return null;
    return rowToGoal(row);
  } catch (err) {
    logger.error({
      msg: "strategic_goals_carry_failed",
      id,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * UPDATE-ить `status` існуючого goal-у. `updated_at` синк-ається через
 * trigger у migration 062. Повертає оновлений рядок або `null`
 * (fail-open / no-rows).
 */
export async function updateGoalStatus(
  pool: Pool,
  id: number,
  status: StrategicGoalStatus,
): Promise<StrategicGoal | null> {
  try {
    assertValidStatus(status);
    const result = await pool.query<StrategicGoalRow>(
      `UPDATE strategic_goals
          SET status = $2
        WHERE id = $1
        RETURNING id, persona, founder_user_id, week_start, goal_text, status, created_at, updated_at`,
      [id, status],
    );
    const row = result.rows[0];
    if (!row) return null;
    return rowToGoal(row);
  } catch (err) {
    logger.error({
      msg: "strategic_goals_update_status_failed",
      id,
      status,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * INSERT кілька goals одним батчем. Використовується у seeder-і
 * (`scripts/seed-strategic-goals.mjs`) і у тестах. Fail-open: повертає
 * масив тих, що INSERT-нулися; решта (на assert-помилці) пропускається.
 */
export async function createGoalsBatch(
  pool: Pool,
  inputs: ReadonlyArray<CreateGoalInput>,
): Promise<StrategicGoal[]> {
  const out: StrategicGoal[] = [];
  for (const input of inputs) {
    const created = await createGoal(pool, input);
    if (created !== null) out.push(created);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Internal: fixed-SQL helpers for list-queries
//
// pg-template-literal lint rule (`no-restricted-syntax` —
// `pool.query(\`…${…}…\`)`) забороняє динамічну побудову SQL-string-у.
// Замість того, щоб збирати WHERE через `[...].join(" AND ")`,
// маємо 2^N fixed-string branch-ів (N = number of optional filters).
// Усі identifier-fragments — hard-coded; variable data — лише через
// $-placeholders.
// ─────────────────────────────────────────────────────────────────────

interface RunListForWeekInput {
  weekStart: string;
  persona?: StrategicGoalPersona;
  founderUserId?: string;
  status?: StrategicGoalStatus;
}

async function runListForWeekQuery(
  pool: Pool,
  input: RunListForWeekInput,
): Promise<{ rows: StrategicGoalRow[] }> {
  const { weekStart, persona, founderUserId, status } = input;
  if (
    persona !== undefined &&
    founderUserId !== undefined &&
    status !== undefined
  ) {
    return pool.query<StrategicGoalRow>(
      `SELECT id, persona, founder_user_id, week_start, goal_text, status, created_at, updated_at
         FROM strategic_goals
        WHERE week_start = $1 AND persona = $2 AND founder_user_id = $3 AND status = $4
        ORDER BY persona ASC, created_at ASC`,
      [weekStart, persona, founderUserId, status],
    );
  }
  if (persona !== undefined && founderUserId !== undefined) {
    return pool.query<StrategicGoalRow>(
      `SELECT id, persona, founder_user_id, week_start, goal_text, status, created_at, updated_at
         FROM strategic_goals
        WHERE week_start = $1 AND persona = $2 AND founder_user_id = $3
        ORDER BY persona ASC, created_at ASC`,
      [weekStart, persona, founderUserId],
    );
  }
  if (persona !== undefined && status !== undefined) {
    return pool.query<StrategicGoalRow>(
      `SELECT id, persona, founder_user_id, week_start, goal_text, status, created_at, updated_at
         FROM strategic_goals
        WHERE week_start = $1 AND persona = $2 AND status = $3
        ORDER BY persona ASC, created_at ASC`,
      [weekStart, persona, status],
    );
  }
  if (founderUserId !== undefined && status !== undefined) {
    return pool.query<StrategicGoalRow>(
      `SELECT id, persona, founder_user_id, week_start, goal_text, status, created_at, updated_at
         FROM strategic_goals
        WHERE week_start = $1 AND founder_user_id = $2 AND status = $3
        ORDER BY persona ASC, created_at ASC`,
      [weekStart, founderUserId, status],
    );
  }
  if (persona !== undefined) {
    return pool.query<StrategicGoalRow>(
      `SELECT id, persona, founder_user_id, week_start, goal_text, status, created_at, updated_at
         FROM strategic_goals
        WHERE week_start = $1 AND persona = $2
        ORDER BY persona ASC, created_at ASC`,
      [weekStart, persona],
    );
  }
  if (founderUserId !== undefined) {
    return pool.query<StrategicGoalRow>(
      `SELECT id, persona, founder_user_id, week_start, goal_text, status, created_at, updated_at
         FROM strategic_goals
        WHERE week_start = $1 AND founder_user_id = $2
        ORDER BY persona ASC, created_at ASC`,
      [weekStart, founderUserId],
    );
  }
  if (status !== undefined) {
    return pool.query<StrategicGoalRow>(
      `SELECT id, persona, founder_user_id, week_start, goal_text, status, created_at, updated_at
         FROM strategic_goals
        WHERE week_start = $1 AND status = $2
        ORDER BY persona ASC, created_at ASC`,
      [weekStart, status],
    );
  }
  return pool.query<StrategicGoalRow>(
    `SELECT id, persona, founder_user_id, week_start, goal_text, status, created_at, updated_at
       FROM strategic_goals
      WHERE week_start = $1
      ORDER BY persona ASC, created_at ASC`,
    [weekStart],
  );
}

interface RunListInput {
  founderUserId?: string;
  persona?: StrategicGoalPersona;
  status?: StrategicGoalStatus;
  limit: number;
}

async function runListQuery(
  pool: Pool,
  input: RunListInput,
): Promise<{ rows: StrategicGoalRow[] }> {
  const { founderUserId, persona, status, limit } = input;
  if (
    founderUserId !== undefined &&
    persona !== undefined &&
    status !== undefined
  ) {
    return pool.query<StrategicGoalRow>(
      `SELECT id, persona, founder_user_id, week_start, goal_text, status, created_at, updated_at
         FROM strategic_goals
        WHERE founder_user_id = $1 AND persona = $2 AND status = $3
        ORDER BY week_start DESC, persona ASC, created_at ASC
        LIMIT $4`,
      [founderUserId, persona, status, limit],
    );
  }
  if (founderUserId !== undefined && persona !== undefined) {
    return pool.query<StrategicGoalRow>(
      `SELECT id, persona, founder_user_id, week_start, goal_text, status, created_at, updated_at
         FROM strategic_goals
        WHERE founder_user_id = $1 AND persona = $2
        ORDER BY week_start DESC, persona ASC, created_at ASC
        LIMIT $3`,
      [founderUserId, persona, limit],
    );
  }
  if (founderUserId !== undefined && status !== undefined) {
    return pool.query<StrategicGoalRow>(
      `SELECT id, persona, founder_user_id, week_start, goal_text, status, created_at, updated_at
         FROM strategic_goals
        WHERE founder_user_id = $1 AND status = $2
        ORDER BY week_start DESC, persona ASC, created_at ASC
        LIMIT $3`,
      [founderUserId, status, limit],
    );
  }
  if (persona !== undefined && status !== undefined) {
    return pool.query<StrategicGoalRow>(
      `SELECT id, persona, founder_user_id, week_start, goal_text, status, created_at, updated_at
         FROM strategic_goals
        WHERE persona = $1 AND status = $2
        ORDER BY week_start DESC, persona ASC, created_at ASC
        LIMIT $3`,
      [persona, status, limit],
    );
  }
  if (founderUserId !== undefined) {
    return pool.query<StrategicGoalRow>(
      `SELECT id, persona, founder_user_id, week_start, goal_text, status, created_at, updated_at
         FROM strategic_goals
        WHERE founder_user_id = $1
        ORDER BY week_start DESC, persona ASC, created_at ASC
        LIMIT $2`,
      [founderUserId, limit],
    );
  }
  if (persona !== undefined) {
    return pool.query<StrategicGoalRow>(
      `SELECT id, persona, founder_user_id, week_start, goal_text, status, created_at, updated_at
         FROM strategic_goals
        WHERE persona = $1
        ORDER BY week_start DESC, persona ASC, created_at ASC
        LIMIT $2`,
      [persona, limit],
    );
  }
  if (status !== undefined) {
    return pool.query<StrategicGoalRow>(
      `SELECT id, persona, founder_user_id, week_start, goal_text, status, created_at, updated_at
         FROM strategic_goals
        WHERE status = $1
        ORDER BY week_start DESC, persona ASC, created_at ASC
        LIMIT $2`,
      [status, limit],
    );
  }
  return pool.query<StrategicGoalRow>(
    `SELECT id, persona, founder_user_id, week_start, goal_text, status, created_at, updated_at
       FROM strategic_goals
      ORDER BY week_start DESC, persona ASC, created_at ASC
      LIMIT $1`,
    [limit],
  );
}
