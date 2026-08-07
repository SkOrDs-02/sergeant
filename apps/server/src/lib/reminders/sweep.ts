/**
 * Серверний прохід нагадувань — раз на хвилину.
 *
 * ── Навіщо це існує ─────────────────────────────────────────────────────
 *
 * До появи цього модуля нагадування про звички / їжу / тренування жили лише
 * на клієнті: ланцюжок `setTimeout` у відкритій вкладці
 * (`useModuleReminder`) і його копія у сервіс-воркері
 * (`apps/web/src/sw/reminders.ts`). Жоден із них не працює при закритому
 * застосунку — браузер вбиває неактивний SW за ~30 секунд, а стан звичок
 * приходив туди `postMessage`-ом з відкритої сторінки і жив у памʼяті
 * воркера. Пуш про витрати натомість працював завжди, бо його шле сервер.
 * Цей модуль ставить нагадування на той самий шлях.
 *
 * ── Чому таймер, а не BullMQ ────────────────────────────────────────────
 *
 * Redis у проді Є (з переїзду на Coolify, 2026-07-11), тож `ftuxDrip` і
 * `authMail` на BullMQ реально працюють. Тобто вибір тут вільний, а не
 * вимушений — і падає він на таймер із двох причин.
 *
 * По-перше, черга не додає гарантії, якої ще немає: дедуп живе в Postgres
 * (`INSERT` у `push_reminder_log` стовпить рядок), і саме він тримає «не
 * більше одного пушу на подію» навіть при кількох репліках — виграє той
 * процес, чий `INSERT` пройшов першим. По-друге, форма роботи тут — не
 * дискретні задачі, а періодичний скан: щохвилини перебрати, кому зараз
 * настав час. Repeatable job у BullMQ виконував би рівно той самий скан,
 * додавши до нього брокер як ще одну точку відмови.
 *
 * ── Порядок claim → send ────────────────────────────────────────────────
 *
 * Спершу вставляємо рядок у `push_reminder_log`, і лише потім шлемо. Обернений
 * порядок лишав би вікно на подвійний банер. Ціна — нагадування, чия
 * відправка впала після claim-у, пропускається до наступного дня; це свідомо
 * краща зі сторін помилки, ніж дубль.
 */

import type { Pool } from "pg";

import { habitSkipKey, type Habit } from "@sergeant/routine-domain";

import { logger, serializeError } from "../../obs/logger.js";
import { sendToUserQuietly } from "../../push/send.js";
import {
  fizrukDueNow,
  nutritionDueNow,
  routineDueNow,
  type DueReminder,
  type FizrukPlanRow,
  type NutritionPrefsRow,
  type RoutineHabitRow,
} from "./due.js";
import { kyivDayKey, kyivDayKeyMinusDays, kyivHm } from "./time.js";

/** Скільки діб тримаємо журнал відправок. */
const LOG_RETENTION_DAYS = 45;

export interface ReminderSweepResult {
  dayKey: string;
  hm: string;
  /** Скільки нагадувань логіка визнала актуальними на цю хвилину. */
  due: number;
  /** Скільки з них цей процес застовпив і відправив. */
  sent: number;
  /** Скільки відсіяв дедуп (уже надіслано цим або іншим процесом). */
  deduped: number;
}

// Фільтр «є куди слати» — активна web-підписка або зареєстрований
// native-пристрій. Без нього ми стовпили б рядки дедупу для тих, хто пуш не
// отримає, і при пізнішій підписці людина мовчки пропустила б день.
//
// Умова свідомо ПОВТОРЕНА в кожному запиті замість спільної константи з
// інтерполяцією: `pool.query` із шаблонним рядком — це патерн, на який
// заточений лінт-гейт M11, і виняток заради трьох рядків economії робить
// решту SQL у файлі візуально невідрізненною від небезпечної.

interface RoutineHabitDbRow {
  user_id: string;
  id: string;
  name: string;
  emoji: string | null;
  archived: boolean;
  paused: boolean;
  pause_intervals: unknown;
  recurrence: string | null;
  start_date: string | null;
  end_date: string | null;
  time_of_day: string | null;
  reminder_times: unknown;
  weekdays: unknown;
  privacy: string | null;
}

function asStringArray(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === "string")
    : [];
}

function asNumberArray(raw: unknown): number[] {
  return Array.isArray(raw)
    ? raw.filter((x): x is number => typeof x === "number")
    : [];
}

function toHabit(row: RoutineHabitDbRow): Habit {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji ?? undefined,
    archived: row.archived,
    paused: row.paused,
    pauseIntervals: Array.isArray(row.pause_intervals)
      ? (row.pause_intervals as Habit["pauseIntervals"])
      : undefined,
    recurrence: row.recurrence ?? undefined,
    startDate: row.start_date,
    endDate: row.end_date,
    timeOfDay: row.time_of_day ?? undefined,
    reminderTimes: asStringArray(row.reminder_times),
    weekdays: asNumberArray(row.weekdays),
  };
}

/**
 * Звички, у яких на цю хвилину стоїть нагадування.
 *
 * Попередній відсів робимо в SQL (`reminder_times @> '["08:00"]'` або
 * легасі-`time_of_day`), щоб не тягнути в Node усі звички всіх користувачів
 * щохвилини. Остаточне рішення — все одно за `routineDueNow`: там канонічний
 * предикат розкладу, який SQL не відтворює.
 */
async function loadRoutineCandidates(
  pool: Pool,
  hm: string,
): Promise<RoutineHabitRow[]> {
  const { rows } = await pool.query<RoutineHabitDbRow>(
    `SELECT t.user_id, t.id, t.name, t.emoji, t.archived, t.paused,
            t.pause_intervals, t.recurrence, t.start_date, t.end_date,
            t.time_of_day, t.reminder_times, t.weekdays,
            p.data->>'routineReminderPrivacy' AS privacy
       FROM routine_habits t
       JOIN routine_prefs p ON p.user_id = t.user_id
      WHERE t.deleted_at IS NULL
        AND t.archived = false
        AND (p.data->>'routineRemindersEnabled') = 'true'
        AND (t.reminder_times @> $1::jsonb OR t.time_of_day = $2)
        AND (
          EXISTS (SELECT 1 FROM push_subscriptions s
                   WHERE s.user_id = t.user_id AND s.deleted_at IS NULL)
          OR EXISTS (SELECT 1 FROM push_devices d
                      WHERE d.user_id = t.user_id AND d.deleted_at IS NULL)
        )`,
    [JSON.stringify([hm]), hm],
  );
  return rows.map((row) => ({
    userId: row.user_id,
    habit: toHabit(row),
    privacyMinimal: row.privacy === "minimal",
  }));
}

/**
 * Звички, уже відмічені виконаними на `dayKey`.
 *
 * Джерело — append-only журнал `routine_completion_events`: `DISTINCT ON`
 * бере останню подію по кожній парі (користувач, звичка), тож цикл
 * «відмітив → зняв → відмітив» згортається правильно, а знята відмітка
 * (`state = 'undone'`) повертає звичку у список тих, кому нагадуємо.
 */
async function loadCompleted(
  pool: Pool,
  userIds: string[],
  dayKey: string,
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (userIds.length === 0) return out;
  const { rows } = await pool.query<{
    user_id: string;
    habit_id: string;
    state: string;
  }>(
    `SELECT DISTINCT ON (user_id, habit_id) user_id, habit_id, state
       FROM routine_completion_events
      WHERE user_id = ANY($1) AND date_key = $2
      ORDER BY user_id, habit_id, occurred_at DESC`,
    [userIds, dayKey],
  );
  for (const row of rows) {
    // До мапи потрапляють лише ті, чия ОСТАННЯ подія — 'done'. Знята
    // відмітка повертає звичку в чергу нагадувань, і це навмисно.
    if (row.state === "undone") continue;
    let set = out.get(row.user_id);
    if (!set) out.set(row.user_id, (set = new Set()));
    set.add(row.habit_id);
  }
  return out;
}

/** Звички, яким користувач сьогодні поставив «не зміг з причиною». */
async function loadSkipped(
  pool: Pool,
  userIds: string[],
  habitIds: string[],
  dayKey: string,
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (userIds.length === 0 || habitIds.length === 0) return out;
  const keys = habitIds.map((id) => habitSkipKey(id, dayKey));
  const { rows } = await pool.query<{ user_id: string; skip_key: string }>(
    `SELECT user_id, skip_key
       FROM routine_habit_skips
      WHERE user_id = ANY($1) AND skip_key = ANY($2) AND deleted_at IS NULL`,
    [userIds, keys],
  );
  const suffix = `__${dayKey}`;
  for (const row of rows) {
    if (!row.skip_key.endsWith(suffix)) continue;
    const habitId = row.skip_key.slice(0, -suffix.length);
    let set = out.get(row.user_id);
    if (!set) out.set(row.user_id, (set = new Set()));
    set.add(habitId);
  }
  return out;
}

/** Плани Фізрука з увімкненим нагадуванням і тренуванням на сьогодні. */
async function loadFizrukCandidates(
  pool: Pool,
  dayKey: string,
): Promise<FizrukPlanRow[]> {
  const { rows } = await pool.query<{ user_id: string; data: unknown }>(
    `SELECT t.user_id, t.data
       FROM fizruk_monthly_plan t
      WHERE EXISTS (SELECT 1 FROM push_subscriptions s
                     WHERE s.user_id = t.user_id AND s.deleted_at IS NULL)
         OR EXISTS (SELECT 1 FROM push_devices d
                     WHERE d.user_id = t.user_id AND d.deleted_at IS NULL)`,
  );
  const out: FizrukPlanRow[] = [];
  for (const row of rows) {
    const data = (row.data ?? {}) as {
      reminderEnabled?: unknown;
      reminderHour?: unknown;
      reminderMinute?: unknown;
      days?: Record<string, { templateId?: unknown } | undefined>;
    };
    const today = data.days?.[dayKey];
    out.push({
      userId: row.user_id,
      // Дзеркалимо клієнтський дефолт (`fizrukDualWriteState.ts`:
      // `reminderEnabled: state.reminderEnabled !== false`) — інакше сервер
      // мовчав би там, де перемикач у налаштуваннях показано увімкненим.
      reminderEnabled: data.reminderEnabled !== false,
      reminderHour:
        typeof data.reminderHour === "number" ? data.reminderHour : 18,
      reminderMinute:
        typeof data.reminderMinute === "number" ? data.reminderMinute : 0,
      hasWorkoutToday:
        typeof today?.templateId === "string" && !!today.templateId,
    });
  }
  return out;
}

/** Налаштування харчування з увімкненим нагадуванням. */
async function loadNutritionCandidates(
  pool: Pool,
): Promise<NutritionPrefsRow[]> {
  const { rows } = await pool.query<{ user_id: string; prefs_json: unknown }>(
    `SELECT t.user_id, t.prefs_json
       FROM nutrition_prefs t
      WHERE EXISTS (SELECT 1 FROM push_subscriptions s
                     WHERE s.user_id = t.user_id AND s.deleted_at IS NULL)
         OR EXISTS (SELECT 1 FROM push_devices d
                     WHERE d.user_id = t.user_id AND d.deleted_at IS NULL)`,
  );
  return rows.map((row) => {
    const prefs = (row.prefs_json ?? {}) as {
      reminderEnabled?: unknown;
      reminderHour?: unknown;
    };
    return {
      userId: row.user_id,
      // Тут дефолт протилежний до Фізрука і теж дзеркалить клієнт
      // (`loadNutritionPrefs` не вмикає нагадування без явної згоди).
      reminderEnabled: prefs.reminderEnabled === true,
      reminderHour:
        typeof prefs.reminderHour === "number" ? prefs.reminderHour : 12,
    };
  });
}

/**
 * Застовпити нагадування. `true` — цей процес виграв і має слати.
 *
 * `ON CONFLICT DO NOTHING` + перевірка `rowCount` — атомарний claim: другий
 * процес (чи повторний прохід тієї ж хвилини) отримає 0 і промовчить.
 */
async function claim(
  pool: Pool,
  reminder: DueReminder,
  dayKey: string,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `INSERT INTO push_reminder_log (user_id, dedup_key, module, day_key)
          VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, dedup_key) DO NOTHING`,
    [reminder.userId, reminder.dedupKey, reminder.module, dayKey],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Один прохід. Експортується окремо від таймера, щоб тести й майбутній
 * ручний тригер могли викликати його з фіксованим `now`.
 */
export async function runReminderSweep(
  pool: Pool,
  now: Date = new Date(),
): Promise<ReminderSweepResult> {
  const dayKey = kyivDayKey(now);
  const hm = kyivHm(now);

  const [routineRows, fizrukRows, nutritionRows] = await Promise.all([
    loadRoutineCandidates(pool, hm),
    loadFizrukCandidates(pool, dayKey),
    loadNutritionCandidates(pool),
  ]);

  const routineUserIds = [...new Set(routineRows.map((r) => r.userId))];
  const routineHabitIds = [...new Set(routineRows.map((r) => r.habit.id))];
  const [completedByUser, skippedByUser] = await Promise.all([
    loadCompleted(pool, routineUserIds, dayKey),
    loadSkipped(pool, routineUserIds, routineHabitIds, dayKey),
  ]);

  // Групуємо по користувачу один раз: `completedHabitIds` / `skippedHabitIds`
  // — множини одного користувача, тож змішувати рядки різних людей в один
  // виклик не можна (звичка A користувача X «загасилась» би відміткою
  // однойменного id користувача Y).
  const byUser = new Map<string, RoutineHabitRow[]>();
  for (const row of routineRows) {
    const list = byUser.get(row.userId);
    if (list) list.push(row);
    else byUser.set(row.userId, [row]);
  }

  const empty: ReadonlySet<string> = new Set();
  const due: DueReminder[] = [
    ...[...byUser.entries()].flatMap(([userId, rows]) =>
      routineDueNow({
        rows,
        dayKey,
        hm,
        completedHabitIds: completedByUser.get(userId) ?? empty,
        skippedHabitIds: skippedByUser.get(userId) ?? empty,
      }),
    ),
    ...fizrukDueNow(fizrukRows, dayKey, hm),
    ...nutritionDueNow(nutritionRows, dayKey, hm),
  ];

  let sent = 0;
  let deduped = 0;
  for (const reminder of due) {
    let won = false;
    try {
      won = await claim(pool, reminder, dayKey);
    } catch (err) {
      // Claim впав (наприклад, БД недоступна) — НЕ шлемо. Без застовпленого
      // рядка ми не можемо обіцяти «рівно один раз», а мовчання дешевше за
      // нескінченний потік дублів щохвилини.
      logger.warn({
        msg: "reminder_claim_failed",
        module: reminder.module,
        err: serializeError(err, { includeStack: false }),
      });
      continue;
    }
    if (!won) {
      deduped++;
      continue;
    }
    // `sendToUserQuietly` ковтає помилки транспорту й логує їх сам — падіння
    // однієї відправки не має зупиняти решту черги цієї хвилини.
    void sendToUserQuietly(
      reminder.userId,
      {
        title: reminder.title,
        body: reminder.body,
        tag: reminder.dedupKey,
        url: reminder.url,
        data: { module: reminder.module },
      },
      { module: reminder.module },
    );
    sent++;
  }

  if (due.length > 0) {
    logger.info({
      msg: "reminder_sweep",
      dayKey,
      hm,
      due: due.length,
      sent,
      deduped,
    });
  }

  return { dayKey, hm, due: due.length, sent, deduped };
}

/**
 * Прибирання журналу. Викликається sweep-ом раз на добу (о 03:00 за Києвом),
 * щоб не заводити окремий cron під одну DELETE-заяву.
 */
export async function pruneReminderLog(
  pool: Pool,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = kyivDayKeyMinusDays(now, LOG_RETENTION_DAYS);
  const { rowCount } = await pool.query(
    `DELETE FROM push_reminder_log WHERE day_key < $1`,
    [cutoff],
  );
  return rowCount ?? 0;
}
