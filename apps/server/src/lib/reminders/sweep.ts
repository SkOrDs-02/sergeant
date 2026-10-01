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

import {
  habitSkipKey,
  isFlexibleHabit,
  normalizeReminderTimes,
  weekEndKeyForDateKey,
  weekStartKeyForDateKey,
  type Habit,
} from "@sergeant/routine-domain";
import { PUSH_DAILY_CAP_DEFAULT } from "@sergeant/shared";

import { logger, serializeError } from "../../obs/logger.js";
import { sendToUserQuietly } from "../../push/send.js";
import { budgetSlotKey, collapseReminders, planSends } from "./budget.js";
import {
  fizrukDueNow,
  fizrukReminderHm,
  nutritionDueNow,
  nutritionReminderHm,
  routineDueNow,
  type DueReminder,
  type FizrukPlanRow,
  type NutritionPrefsRow,
  type RoutineHabitRow,
} from "./due.js";
import { runWithBypassContext } from "../../dbContext.js";
import { nudgeReason, selectNudgeCandidates } from "./nudge.js";
import { kyivDayKey, kyivDayKeyMinusDays, kyivHm } from "./time.js";

/** Скільки діб тримаємо журнал відправок. */
const LOG_RETENTION_DAYS = 45;

/**
 * Скільки користувачів обслуговуємо одночасно у fan-out-і.
 *
 * Це стеля НЕ на кількість HTTP-запитів, а на кількість користувачів: кожен
 * `sendToUserQuietly` всередині сам віялом б'є по всіх пристроях цієї
 * людини. Тобто реальна паралельність — приблизно
 * `SEND_CONCURRENCY × (пристроїв на людину)`, і 10 тут дає десятки сокетів,
 * а не сотні.
 *
 * Чому не більше: слот нагадувань має вкластись у хвилину до наступного
 * проходу, і при таймауті FCM 10 с (`PUSH_FCM_TIMEOUT_MS`) один чанк у
 * найгіршому разі коштує ~10 с — тобто за хвилину проходить ~60
 * користувачів навіть при повністю мертвому апстрімі. Піднімати це число
 * варто разом із заміром пам'яті на VPS, а не «про запас».
 */
const SEND_CONCURRENCY = 10;

export interface ReminderSweepResult {
  dayKey: string;
  hm: string;
  /** Скільки приводів план дня відправляє саме цієї хвилини. */
  due: number;
  /** Скільки сповіщень цей процес відправив (кілька приводів = одне). */
  sent: number;
  /** Скільки приводів відсіяв дедуп (уже надіслано цим або іншим процесом). */
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
 * Звички з будь-яким нагадуванням на добу.
 *
 * Не лише ті, що припадають на цю хвилину: спільна стеля вимагає бачити
 * весь день людини, щоб знати, які приводи згорнути разом (`./budget.ts`).
 * Остаточне рішення про розклад усе одно за `routineDueNow`: там
 * канонічний предикат, який SQL не відтворює.
 *
 * ponytail: щохвилини читаємо всі звички з нагадуваннями всіх людей. На
 * десятках тисяч активних акаунтів план варто кешувати на добу й
 * перераховувати лише на зміну налаштувань.
 */
async function loadRoutineCandidates(pool: Pool): Promise<RoutineHabitRow[]> {
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
        AND (t.reminder_times <> '[]'::jsonb OR t.time_of_day IS NOT NULL)
        AND (
          EXISTS (SELECT 1 FROM push_subscriptions s
                   WHERE s.user_id = t.user_id AND s.deleted_at IS NULL)
          OR EXISTS (SELECT 1 FROM push_devices d
                      WHERE d.user_id = t.user_id AND d.deleted_at IS NULL)
        )`,
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

/**
 * Відмітки гнучких звичок (`recurrence: "flexible"`) усередині тижня
 * `[fromKey, toKey]` — вхід для `weekDoneCountExcludingDate`
 * (`routineDueNow`).
 *
 * Один запит на весь sweep, не по одній звичці: набір користувачів і
 * гнучких звичок цієї хвилини вже відомий з `loadRoutineCandidates`, тож
 * усі відмітки тижня тягнемо разом, як і `loadCompleted`/`loadSkipped`
 * поруч. `habitIds` тут — лише гнучкі звички (клас А спеки
 * `routine-flexible-weekly-frequency.md`); для решти розкладів
 * `weekDoneCount` не читається взагалі, тож запитувати їхні відмітки
 * немає сенсу.
 */
async function loadWeekCompletions(
  pool: Pool,
  userIds: string[],
  habitIds: string[],
  fromKey: string,
  toKey: string,
): Promise<Map<string, Map<string, string[]>>> {
  const out = new Map<string, Map<string, string[]>>();
  if (userIds.length === 0 || habitIds.length === 0) return out;
  const { rows } = await pool.query<{
    user_id: string;
    habit_id: string;
    date_key: string;
    state: string;
  }>(
    `SELECT DISTINCT ON (user_id, habit_id, date_key)
            user_id, habit_id, date_key, state
       FROM routine_completion_events
      WHERE user_id = ANY($1) AND habit_id = ANY($2)
        AND date_key >= $3 AND date_key <= $4
      ORDER BY user_id, habit_id, date_key, occurred_at DESC`,
    [userIds, habitIds, fromKey, toKey],
  );
  for (const row of rows) {
    // Той самий фолд, що й `loadCompleted`: рахує лише останню подію дня,
    // і `undone` виключає день з відміток, а не залишає стару 'done'.
    if (row.state === "undone") continue;
    let byHabit = out.get(row.user_id);
    if (!byHabit) out.set(row.user_id, (byHabit = new Map()));
    const list = byHabit.get(row.habit_id);
    if (list) list.push(row.date_key);
    else byHabit.set(row.habit_id, [row.date_key]);
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

/** Стеля нагадувань на добу для кожного з `userIds` (міграція 148). */
async function loadCaps(
  pool: Pool,
  userIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (userIds.length === 0) return out;
  const { rows } = await pool.query<{
    user_id: string;
    push_daily_cap: number;
  }>(
    `SELECT user_id, push_daily_cap
       FROM user_preferences
      WHERE user_id = ANY($1)`,
    [userIds],
  );
  for (const row of rows) out.set(row.user_id, row.push_daily_cap);
  return out;
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
 * Застовпити один із `cap` слотів бюджету доби. Повертає ключ слота або
 * `null`, якщо всі слоти вже зайняті.
 *
 * Бюджет живе в тому самому журналі й тим самим `ON CONFLICT`, що й дедуп
 * приводів, тож стелю не пробити ні перегонами реплік, ні зміною плану
 * посеред доби (людина додала звичку чи змінила стелю): слотів рівно `cap`.
 */
async function claimBudgetSlot(
  pool: Pool,
  userId: string,
  dayKey: string,
  cap: number,
): Promise<string | null> {
  for (let k = 1; k <= cap; k++) {
    const key = budgetSlotKey(dayKey, k);
    const { rowCount } = await pool.query(
      `INSERT INTO push_reminder_log (user_id, dedup_key, module, day_key)
            VALUES ($1, $2, 'budget', $3)
       ON CONFLICT (user_id, dedup_key) DO NOTHING`,
      [userId, key, dayKey],
    );
    if ((rowCount ?? 0) > 0) return key;
  }
  return null;
}

/** Повернути слот, під який не лишилось жодного приводу. */
async function releaseBudgetSlot(
  pool: Pool,
  userId: string,
  key: string,
): Promise<void> {
  await pool.query(
    `DELETE FROM push_reminder_log WHERE user_id = $1 AND dedup_key = $2`,
    [userId, key],
  );
}

function groupByUser(reminders: DueReminder[]): Map<string, DueReminder[]> {
  const out = new Map<string, DueReminder[]>();
  for (const r of reminders) {
    const list = out.get(r.userId);
    if (list) list.push(r);
    else out.set(r.userId, [r]);
  }
  return out;
}

interface ClaimedPush {
  userId: string;
  payload: ReturnType<typeof collapseReminders>;
}

/**
 * Один прохід. Експортується окремо від таймера, щоб тести й майбутній
 * ручний тригер могли викликати його з фіксованим `now`.
 *
 * Три кроки. План: усі приводи дня кожної людини без огляду на те, що вже
 * зроблено, розкладені на `cap` слотів (`planSends`); план не залежить від
 * відміток, тож протягом доби він стабільний. Відбір: якщо на цю хвилину
 * припадає слот, у нього йдуть лише ті приводи, що досі актуальні (звичку
 * не відмічено, не поставлено «не зміг»). Відправка: одне сповіщення на
 * слот, скільки б приводів у ньому не було.
 */
export async function runReminderSweep(
  pool: Pool,
  now: Date = new Date(),
): Promise<ReminderSweepResult> {
  const dayKey = kyivDayKey(now);
  const hm = kyivHm(now);

  const [routineRows, fizrukRows, nutritionRows, nudgeCandidates] =
    await Promise.all([
      loadRoutineCandidates(pool),
      loadFizrukCandidates(pool, dayKey),
      loadNutritionCandidates(pool),
      // Фоновий прохід по всіх користувачах: `sergeant_nudge_cache` читається
      // LEFT JOIN-ом без `app.user_id`, тож під RLS потрібен bypass (A4).
      runWithBypassContext(pool, (client) =>
        selectNudgeCandidates(client, now),
      ),
    ]);

  const routineUserIds = [...new Set(routineRows.map((r) => r.userId))];
  const routineHabitIds = [...new Set(routineRows.map((r) => r.habit.id))];
  // Лише гнучкі звички читають `weekDoneCount` (`routineDueNow`) — решта
  // розкладів предикат не питає, тож звужуємо запит тижневих відміток до
  // них одразу тут, а не всередині `loadWeekCompletions`.
  const routineFlexibleHabitIds = [
    ...new Set(
      routineRows
        .filter((r) => isFlexibleHabit(r.habit))
        .map((r) => r.habit.id),
    ),
  ];
  const [completedByUser, skippedByUser, weekCompletionsByUser] =
    await Promise.all([
      loadCompleted(pool, routineUserIds, dayKey),
      loadSkipped(pool, routineUserIds, routineHabitIds, dayKey),
      loadWeekCompletions(
        pool,
        routineUserIds,
        routineFlexibleHabitIds,
        weekStartKeyForDateKey(dayKey),
        weekEndKeyForDateKey(dayKey),
      ),
    ]);

  // Групуємо по користувачу один раз: `completedHabitIds` / `skippedHabitIds`
  // — множини одного користувача, тож змішувати рядки різних людей в один
  // виклик не можна (звичка A користувача X «загасилась» би відміткою
  // однойменного id користувача Y).
  const routineByUser = new Map<string, RoutineHabitRow[]>();
  for (const row of routineRows) {
    const list = routineByUser.get(row.userId);
    if (list) list.push(row);
    else routineByUser.set(row.userId, [row]);
  }

  const dayTimes = [
    ...new Set([
      ...routineRows.flatMap((r) => normalizeReminderTimes(r.habit)),
      ...fizrukRows.map(fizrukReminderHm),
      ...nutritionRows.map(nutritionReminderHm),
    ]),
  ];
  const nudges = nudgeCandidates.map((c) => nudgeReason(c, dayKey, now));

  const empty: ReadonlySet<string> = new Set();
  const emptyWeekCompletions: ReadonlyMap<string, readonly string[]> =
    new Map();
  const noneByUser = new Map<string, Set<string>>();
  // ponytail: times × rows на кожну хвилину. На нинішній базі це дрібниця;
  // коли стане помітно, індексувати рядки за часом, а не перебирати всі.
  const reasonsOfDay = (
    completed: Map<string, Set<string>>,
    skipped: Map<string, Set<string>>,
  ): DueReminder[] => [
    ...dayTimes.flatMap((t) => [
      ...[...routineByUser.entries()].flatMap(([userId, rows]) =>
        routineDueNow({
          rows,
          dayKey,
          hm: t,
          completedHabitIds: completed.get(userId) ?? empty,
          skippedHabitIds: skipped.get(userId) ?? empty,
          weekCompletionsByHabitId:
            weekCompletionsByUser.get(userId) ?? emptyWeekCompletions,
        }),
      ),
      ...fizrukDueNow(fizrukRows, dayKey, t),
      ...nutritionDueNow(nutritionRows, dayKey, t),
    ]),
    ...nudges,
  ];

  const plannedByUser = groupByUser(reasonsOfDay(noneByUser, noneByUser));
  const pendingByUser = groupByUser(
    reasonsOfDay(completedByUser, skippedByUser),
  );
  const caps = await loadCaps(pool, [...plannedByUser.keys()]);

  const firing: { userId: string; sendAt: string; reasons: DueReminder[] }[] =
    [];
  for (const [userId, planned] of plannedByUser) {
    const cap = caps.get(userId) ?? PUSH_DAILY_CAP_DEFAULT;
    const slot = planSends(
      planned.map((r) => r.at),
      cap,
    ).find((s) => s.sendAt === hm);
    if (!slot) continue;
    const reasons = (pendingByUser.get(userId) ?? []).filter((r) =>
      slot.times.includes(r.at),
    );
    if (reasons.length > 0) {
      firing.push({ userId, sendAt: slot.sendAt, reasons });
    }
  }

  let sent = 0;
  let deduped = 0;
  // Спершу застовплюємо ВСЕ, що виграло дедуп, і лише потім шлемо — чанками.
  // Claim має лишатись послідовним: це один `INSERT` на нагадування, він
  // дешевий, а розпаралелювання тут лише забирало б з'єднання з пулу у
  // самих відправок.
  //
  // Порядок усередині слота: бюджет, потім приводи. Навпаки привід,
  // застовплений без вільного слота, пропав би до кінця доби; а слот без
  // жодного живого приводу повертаємо назад.
  const claimed: ClaimedPush[] = [];
  for (const { userId, sendAt, reasons } of firing) {
    const cap = caps.get(userId) ?? PUSH_DAILY_CAP_DEFAULT;
    const won: DueReminder[] = [];
    try {
      const slotKey = await claimBudgetSlot(pool, userId, dayKey, cap);
      if (!slotKey) {
        logger.info({ msg: "reminder_budget_exhausted", dayKey, hm });
        continue;
      }
      for (const reminder of reasons) {
        if (await claim(pool, reminder, dayKey)) won.push(reminder);
        else deduped++;
      }
      if (won.length === 0) {
        await releaseBudgetSlot(pool, userId, slotKey);
        continue;
      }
    } catch (err) {
      // Claim впав (наприклад, БД недоступна) — НЕ шлемо. Без застовпленого
      // рядка ми не можемо обіцяти «рівно один раз», а мовчання дешевше за
      // нескінченний потік дублів щохвилини.
      logger.warn({
        msg: "reminder_claim_failed",
        err: serializeError(err, { includeStack: false }),
      });
      continue;
    }
    claimed.push({ userId, payload: collapseReminders(won, dayKey, sendAt) });
  }

  // Fan-out чанками по `SEND_CONCURRENCY` з `await` між чанками.
  //
  // AI-DANGER: не повертай сюди `void sendToUserQuietly(...)` у циклі.
  // Кожен виклик усередині сам робить `Promise.all` по ВСІХ пристроях
  // користувача (`push/send.ts`), тож без стелі тут кількість одночасних
  // сокетів до APNs/FCM/web дорівнює «усі пристрої всіх, кому настав час».
  // Нагадування приходять слотами (09:00/12:00/20:00), тобто це не
  // теоретичний максимум, а звичайний робочий день — і на 4 ГБ VPS така
  // лавина з'їдала пам'ять швидше, ніж апстріми встигали відповідати.
  //
  // `await` між чанками ще й тримає прохід у межах хвилини: `stop()`
  // планувальника тепер дочікується на shutdown-і, а дочекатись можна лише
  // того, на що ми справді чекаємо — fire-and-forget не дочекаєшся ніяк.
  for (let i = 0; i < claimed.length; i += SEND_CONCURRENCY) {
    const batch = claimed.slice(i, i + SEND_CONCURRENCY);
    // `sendToUserQuietly` ковтає помилки транспорту й логує їх сам — падіння
    // однієї відправки не має зупиняти решту черги цієї хвилини.
    await Promise.all(
      batch.map(({ userId, payload }) =>
        sendToUserQuietly(
          userId,
          {
            title: payload.title,
            body: payload.body,
            tag: payload.tag,
            url: payload.url,
            data: { module: payload.module },
          },
          { module: payload.module },
        ),
      ),
    );
    sent += batch.length;
  }

  const due = firing.reduce((n, f) => n + f.reasons.length, 0);
  if (due > 0) {
    logger.info({
      msg: "reminder_sweep",
      dayKey,
      hm,
      due,
      sent,
      deduped,
    });
  }

  return { dayKey, hm, due, sent, deduped };
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
