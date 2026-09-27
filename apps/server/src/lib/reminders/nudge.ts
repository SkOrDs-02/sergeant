/**
 * Проактивні підштовхування Сержанта — раз на добу.
 *
 * Спека: docs/work/specs/sergeant-persona-and-proactive-push.md
 *
 * ── Чому це серверний прохід, а не side-effect у хендлері ────────────────
 *
 * Денну пораду генерує `POST /api/coach/insight`, який смикає ТІЛЬКИ клієнт
 * на передньому плані. Пуш звідти приходив користувачу, який у цю ж секунду
 * читає цей текст на екрані. Правильна умова — «апка закрита», а її можна
 * перевірити лише ззовні запиту, за `"user".last_seen_at`.
 *
 * ── Чому шлемо збережений текст, а не генеруємо свій ─────────────────────
 *
 * Снапшот для поради збирається з КЛІЄНТСЬКОГО SQLite
 * (`readFinykStatsContext`, `getCachedFizrukSqliteState`, `loadNutritionLog`,
 * `loadRoutineState`), і серверні таблиці покривають лише частину модулів.
 * Тому клієнт лишає «консерву» у `sergeant_nudge_cache`, а прохід її переюзає.
 *
 * ── Чому не BullMQ, попри те що спека (D8) вимагала саме її ──────────────
 *
 * D8 писався до того, як у репо зʼявився серверний прохід нагадувань, і
 * пропонував повторити патерн `ftuxDrip`. Тут та сама форма роботи, що й у
 * нагадувань: добовий прохід із дедупом у Postgres. Черга не додає
 * гарантії, яку вже дає `INSERT ... ON CONFLICT`, тож вона тут зайвий
 * рухомий елемент. Повне обґрунтування — шапка `./sweep.ts`.
 *
 * Застереження для того, хто читатиме історію рішення: і спека, і ранні
 * версії цих коментарів спиралися на «у проді `REDIS_URL` не заданий». Це
 * було правдою на Railway, але перестало нею бути з переїздом на Coolify
 * (2026-07-11) — Redis там є, BullMQ-воркери працюють. Аргумент лишився
 * чинним, підстава під ним змінилася.
 *
 * Слід надісланого лежить у `push_reminder_log` (міграція 099) з
 * `module = 'sergeant'` — спільний журнал із нагадуваннями. Спека просила
 * окрему `sergeant_push_log`, але два журнали однакової семантики розійшлися
 * б у ретеншені й у правилах київської доби.
 */

import { kyivCalendarDaysBetween } from "@sergeant/shared";
import type { Pool } from "pg";

import type { DueReminder } from "./due.js";

/**
 * На яку добу відсутності будимо. Затухаюча послідовність, а не «щодня»:
 * щоденний пуш тому, хто не заходить, вчить ігнорувати сповіщення, а потім
 * вимикати їх зовсім. Перша доба навмисно пропущена — людина могла просто
 * бути зайнята один день.
 */
export const NUDGE_ABSENCE_DAYS: readonly number[] = [2, 4, 7];

/**
 * Скільки живе консерва. Старший текст говорить про тиждень, який давно
 * закінчився, і користувач його вже бачив на екрані — пуш із такими цифрами
 * підриває довіру рівно так само, як MCC-код замість назви категорії.
 */
export const NUDGE_CACHE_TTL_MS = 48 * 60 * 60_000;

/**
 * Тихі години у київському часі: [22:00, 08:00). Слот нуджа (09:00) у них
 * не потрапляє за конструкцією; межі читає план бюджету (`./budget.ts`),
 * щоб компромісний час згорнутого сповіщення не впав у ніч.
 */
export const QUIET_HOURS_START_KYIV = 22;
export const QUIET_HOURS_END_KYIV = 8;

export const NUDGE_TITLE = "Сержант";

/**
 * Копія для випадку, коли свіжого тексту немає. Свідомо без цифр і без
 * тверджень про конкретний період — вона має бути правдивою й через тиждень.
 */
export const NUDGE_NEUTRAL_BODY = "Заглянь, я подивлюся на твій тиждень";

export interface NudgeCandidate {
  userId: string;
  lastSeenAt: Date;
  cachedBody: string | null;
  cachedGeneratedAt: Date | null;
}

/**
 * Тіло пуша для кандидата: свіжа консерва або нейтральна копія.
 *
 * Порожній/пробільний збережений текст трактуємо як відсутній — краще
 * нейтральна копія, ніж пуш без тіла.
 */
export function buildNudgeBody(candidate: NudgeCandidate, now: Date): string {
  const { cachedBody, cachedGeneratedAt } = candidate;
  if (!cachedBody || !cachedBody.trim() || !cachedGeneratedAt) {
    return NUDGE_NEUTRAL_BODY;
  }
  const ageMs = now.getTime() - cachedGeneratedAt.getTime();
  if (ageMs > NUDGE_CACHE_TTL_MS) return NUDGE_NEUTRAL_BODY;
  return cachedBody.trim();
}

/**
 * Вузький контракт БД, який реально використовує цей прохід.
 *
 * Свідомо НЕ `Pick<Pool, "query">`: у `pg` це набір перевантажень
 * (Submittable / QueryArrayConfig / QueryConfig / текст+значення), і жоден
 * тест не змокає його без приведення типів. Одна текстова сигнатура — це все,
 * що тут потрібно, і `Pool` їй задовольняє структурно.
 */
export interface NudgeDb {
  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

/**
 * Ридери значень із рядка БД. `pg` віддає `TIMESTAMPTZ` як `Date`, але через
 * пул із іншим парсером типів або через мок у тесті може прийти рядок — тож
 * читаємо обидва, а все інше трактуємо як відсутнє. Це межа системи, тут
 * перевірка доречна; далі по коду типи вже справжні.
 */
function readDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** `dedup_key` у спільному журналі. Він же — `Notification.tag` на клієнті. */
export function nudgeDedupKey(dayKey: string): string {
  return `sergeant-nudge-${dayKey}`;
}

/**
 * Кандидати на пуш за поточну київську добу.
 *
 * Фільтри, що дешевше зробити в SQL, лишаються в SQL: opt-in і наявність
 * активної web-підписки. «Уже надіслано сьогодні» тут НЕ фільтрується:
 * кандидати входять у план дня (`./budget.ts`), який перераховується
 * щохвилини, і зникнення нуджа одразу після відправки зсунуло б решту
 * слотів. Повтор відсікає claim у `push_reminder_log`. Арифметика
 * діб рахується у JS через `kyivCalendarDaysBetween` — вона DST-коректна і є
 * єдиним джерелом правди щодо київських меж доби; дублювати її в SQL означало
 * б завести другу, тихо розбіжну реалізацію.
 *
 * `last_seen_at IS NOT NULL` критичний: для всіх, хто існував до міграції 100,
 * значення невідоме, і без цього фільтра в день деплою кожен неактивний
 * акаунт виглядав би як «відсутній нескінченно довго».
 */
export async function selectNudgeCandidates(
  db: NudgeDb | Pool,
  now: Date,
): Promise<NudgeCandidate[]> {
  const { rows } = await (db as NudgeDb).query(
    `SELECT u.id            AS user_id,
            u.last_seen_at  AS last_seen_at,
            c.body          AS cached_body,
            c.generated_at  AS cached_generated_at
       FROM "user" u
       JOIN user_preferences p
         ON p.user_id = u.id AND p.sergeant_nudges = TRUE
       LEFT JOIN sergeant_nudge_cache c
         ON c.user_id = u.id
      WHERE u.last_seen_at IS NOT NULL
        AND EXISTS (
              SELECT 1 FROM push_subscriptions s
               WHERE s.user_id = u.id AND s.deleted_at IS NULL
            )`,
  );

  const candidates: NudgeCandidate[] = [];
  for (const row of rows) {
    const userId = readString(row["user_id"]);
    const lastSeenAt = readDate(row["last_seen_at"]);
    // SQL уже відсіює `last_seen_at IS NULL`; сюди значення може не доїхати
    // хіба що зіпсованим, і тоді єдина безпечна дія — пропустити рядок, а не
    // вважати людину відсутньою вічність.
    if (!userId || !lastSeenAt) continue;
    if (
      !NUDGE_ABSENCE_DAYS.includes(
        kyivCalendarDaysBetween(now.getTime(), lastSeenAt.getTime()),
      )
    ) {
      continue;
    }
    candidates.push({
      userId,
      lastSeenAt,
      cachedBody: readString(row["cached_body"]),
      cachedGeneratedAt: readDate(row["cached_generated_at"]),
    });
  }
  return candidates;
}

/**
 * Слот нуджа, 09:00 Europe/Kyiv (спека D5).
 *
 * Нудж більше не має власного проходу: він привід у спільному плані дня
 * (`./sweep.ts`), тож ділить стелю з нагадуваннями модулів і згортається з
 * ними в одне сповіщення, коли приводів більше за стелю.
 */
export const NUDGE_AT_HM = "09:00";

/** Кандидат нуджа як привід у плані дня. */
export function nudgeReason(
  candidate: NudgeCandidate,
  dayKey: string,
  now: Date,
): DueReminder {
  return {
    userId: candidate.userId,
    module: "sergeant",
    // Стабільний tag: браузер склеює повтори в одне сповіщення, тож навіть
    // збій дедупу лишається невидимим для людини.
    dedupKey: nudgeDedupKey(dayKey),
    title: NUDGE_TITLE,
    body: buildNudgeBody(candidate, now),
    url: "/",
    at: NUDGE_AT_HM,
    label: NUDGE_TITLE,
  };
}
