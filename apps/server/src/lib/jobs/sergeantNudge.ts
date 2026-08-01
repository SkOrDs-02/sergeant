import { Queue, Worker } from "bullmq";
import { toLocalISODate, kyivCalendarDaysBetween } from "@sergeant/shared";

import pool from "../../db.js";
import { logger, serializeError } from "../../obs/logger.js";
import { sendToUserQuietly } from "../../push/send.js";
import { BULLMQ_QUEUE_PREFIX, createBullConnection } from "./connection.js";

/**
 * Шедулер проактивних пушів Сержанта.
 *
 * Спека: docs/90-work/planning/specs/sergeant-persona-and-proactive-push.md
 *
 * Чому це серверна джоба, а не side-effect у хендлері: денну пораду
 * генерує `POST /api/coach/insight`, який смикає ТІЛЬКИ клієнт на передньому
 * плані. Пуш звідти приходив користувачу, який у цю ж секунду читає цей текст
 * на екрані. Правильна умова — «апка закрита», а її можна перевірити лише
 * ззовні запиту, за `"user".last_seen_at`.
 *
 * Чому шлемо збережений текст, а не генеруємо свій: снапшот для поради
 * збирається з КЛІЄНТСЬКОГО SQLite (`readFinykStatsContext`,
 * `getCachedFizrukSqliteState`, `loadNutritionLog`, `loadRoutineState`), і
 * серверні таблиці покривають лише частину модулів. Тому клієнт лишає
 * «консерву» у `sergeant_nudge_cache`, а шедулер її переюзає.
 */

export const SERGEANT_NUDGE_QUEUE_NAME = "sergeant-nudge";

/** Ім'я repeatable-джоби всередині черги. */
const SWEEP_JOB_NAME = "sweep";

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

/** Тихі години у київському часі: [22:00, 08:00). */
export const QUIET_HOURS_START_KYIV = 22;
export const QUIET_HOURS_END_KYIV = 8;

export const NUDGE_TITLE = "Сержант";

/**
 * Копія для випадку, коли свіжого тексту немає. Свідомо без цифр і без
 * тверджень про конкретний період — вона має бути правдивою й через тиждень.
 */
export const NUDGE_NEUTRAL_BODY = "Заглянь — я подивлюся на твій тиждень";

const KYIV_HOUR_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Kyiv",
  hour: "2-digit",
  hour12: false,
});

/** Година доби (0–23) у Europe/Kyiv. */
export function kyivHour(now: Date): number {
  return Number(KYIV_HOUR_FORMATTER.format(now));
}

/**
 * Чи потрапляє момент у тихі години.
 *
 * Джоба, що дійшла до виконання всередині вікна (черга затрималась, воркер
 * перезапустився після нічного деплою), СКАСОВУЄТЬСЯ, а не переноситься:
 * краще пропустити день, ніж розбудити людину о третій ночі.
 */
export function isQuietHour(now: Date): boolean {
  const hour = kyivHour(now);
  return hour >= QUIET_HOURS_START_KYIV || hour < QUIET_HOURS_END_KYIV;
}

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
 * Вузький контракт БД, який реально використовує ця джоба.
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

/**
 * Кандидати на пуш за поточну київську добу.
 *
 * Фільтри, що дешевше зробити в SQL, лишаються в SQL: opt-in, наявність
 * активної web-підписки, відсутність уже надісланого сьогодні. Арифметика
 * діб рахується у JS через `kyivCalendarDaysBetween` — вона DST-коректна і є
 * єдиним джерелом правди щодо київських меж доби; дублювати її в SQL означало б
 * завести другу, тихо розбіжну реалізацію.
 *
 * `last_seen_at IS NOT NULL` критичний: для всіх, хто існував до міграції 094,
 * значення невідоме, і без цього фільтра в день деплою кожен неактивний
 * акаунт виглядав би як «відсутній нескінченно довго».
 */
export async function selectNudgeCandidates(
  db: NudgeDb,
  now: Date,
): Promise<NudgeCandidate[]> {
  const today = toLocalISODate(now);
  const { rows } = await db.query(
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
            )
        AND NOT EXISTS (
              SELECT 1 FROM sergeant_push_log l
               WHERE l.user_id = u.id
                 AND l.sent_on = $1
                 AND l.channel = 'nudge'
            )`,
    [today],
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
 * Резервує добу для юзера. `true` — резерв наш, можна слати.
 *
 * Claim-before-send навмисно: вставка з `ON CONFLICT DO NOTHING` атомарна, тож
 * дві репліки або дубль-джоба конкурують за один рядок і виграє рівно одна.
 * Зворотний порядок («надіслати, потім записати») дав би вікно на подвійне
 * сповіщення. Ціна такого вибору — якщо відправка після резерву впаде,
 * користувач пропустить цей день; це свідомо кращий бік помилки.
 */
export async function claimNudgeSlot(
  db: NudgeDb,
  userId: string,
  today: string,
): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO sergeant_push_log (user_id, sent_on, channel)
       VALUES ($1, $2, 'nudge')
       ON CONFLICT DO NOTHING`,
    [userId, today],
  );
  return (result.rowCount ?? 0) > 0;
}

export interface NudgeSweepSummary {
  candidates: number;
  sent: number;
  skippedQuietHours: boolean;
}

export interface NudgeSweepDeps {
  db?: NudgeDb;
  now?: Date;
  /** Ін'єкція відправника — тести не піднімають push-стек. */
  send?: (
    userId: string,
    payload: { title: string; body: string; tag: string; url: string },
  ) => Promise<void>;
}

async function defaultSend(
  userId: string,
  payload: { title: string; body: string; tag: string; url: string },
): Promise<void> {
  await sendToUserQuietly(userId, payload, { module: "sergeant-nudge" });
}

/**
 * Один прохід шедулера. Публічна й чиста від BullMQ, щоб тести ганяли логіку
 * без Redis.
 */
export async function runSergeantNudgeSweep(
  deps: NudgeSweepDeps = {},
): Promise<NudgeSweepSummary> {
  const now = deps.now ?? new Date();
  const db = deps.db ?? pool;
  const send = deps.send ?? defaultSend;

  if (isQuietHour(now)) {
    logger.info({ msg: "sergeant_nudge_sweep_skipped_quiet_hours" });
    return { candidates: 0, sent: 0, skippedQuietHours: true };
  }

  const today = toLocalISODate(now);
  const candidates = await selectNudgeCandidates(db, now);
  let sent = 0;

  // ponytail: послідовний цикл. При базі в десятки тисяч активних opt-in
  // юзерів це стане вузьким місцем — тоді sweep має класти по джобі на юзера
  // в ту саму чергу замість того, щоб слати сам.
  for (const candidate of candidates) {
    const claimed = await claimNudgeSlot(db, candidate.userId, today);
    if (!claimed) continue;
    try {
      await send(candidate.userId, {
        title: NUDGE_TITLE,
        body: buildNudgeBody(candidate, now),
        // Стабільний tag: браузер склеює повтори в одне сповіщення, тож
        // навіть збій дедупу вище лишається невидимим для юзера.
        tag: `sergeant-nudge-${today}`,
        url: "/",
      });
      sent++;
    } catch (err) {
      logger.warn({
        msg: "sergeant_nudge_send_failed",
        err: serializeError(err, { includeStack: false }),
      });
    }
  }

  logger.info({
    msg: "sergeant_nudge_sweep_done",
    candidates: candidates.length,
    sent,
  });
  return { candidates: candidates.length, sent, skippedQuietHours: false };
}

interface ModuleState {
  queue: Queue | null;
  worker: Worker | null;
  connections: ReturnType<typeof createBullConnection>[];
}

const state: ModuleState = { queue: null, worker: null, connections: [] };

export interface StartedSergeantNudgeWorker {
  close: () => Promise<void>;
}

/**
 * Піднімає repeatable-джобу й воркер.
 *
 * Без `REDIS_URL` повертає `null` і нічого не робить — так само, як
 * `ftuxDrip` пропускає відкладені листи. In-memory-черга, що губить джоби на
 * рестарті, тут гірша за відсутність каналу: юзер або отримує один пуш на
 * добу, або жодного, але ніколи три поспіль після трьох деплоїв.
 */
export function startSergeantNudgeWorker(): StartedSergeantNudgeWorker | null {
  if (state.worker) return { close: closeSergeantNudgeModule };

  const queueConnection = createBullConnection("sergeant-nudge-queue");
  const workerConnection = createBullConnection("sergeant-nudge-worker");
  if (!queueConnection || !workerConnection) {
    logger.warn({
      msg: "sergeant_nudge_scheduler_disabled",
      reason: "REDIS_URL not configured",
    });
    return null;
  }
  state.connections = [queueConnection, workerConnection];

  state.queue = new Queue(SERGEANT_NUDGE_QUEUE_NAME, {
    connection: queueConnection,
    prefix: BULLMQ_QUEUE_PREFIX,
  });

  // 09:00 Europe/Kyiv. `tz` обов'язковий: без нього BullMQ рахує cron у UTC і
  // влітку слот поїде на 12:00 київського часу.
  void state.queue
    .upsertJobScheduler(SWEEP_JOB_NAME, {
      pattern: "0 9 * * *",
      tz: "Europe/Kyiv",
    })
    .catch((err: unknown) => {
      logger.warn({
        msg: "sergeant_nudge_scheduler_upsert_failed",
        err: serializeError(err, { includeStack: false }),
      });
    });

  state.worker = new Worker(
    SERGEANT_NUDGE_QUEUE_NAME,
    async () => {
      await runSergeantNudgeSweep();
    },
    {
      connection: workerConnection,
      prefix: BULLMQ_QUEUE_PREFIX,
      // Один прохід на добу — паралелити нічого.
      concurrency: 1,
    },
  );

  state.worker.on("failed", (_job, err) => {
    logger.warn({
      msg: "sergeant_nudge_sweep_failed",
      err: serializeError(err, { includeStack: false }),
    });
  });

  return { close: closeSergeantNudgeModule };
}

async function closeSergeantNudgeModule(): Promise<void> {
  await state.worker?.close();
  await state.queue?.close();
  for (const connection of state.connections) {
    await connection?.quit().catch(() => {
      /* best-effort */
    });
  }
  state.queue = null;
  state.worker = null;
  state.connections = [];
}
