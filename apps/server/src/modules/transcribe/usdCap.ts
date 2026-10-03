import type { Request, Response } from "express";
import { toKyivISODate } from "@sergeant/shared";
import { withSubjectContext } from "../../db.js";
import { logger } from "../../obs/logger.js";
import { transcribeUsdCapEventsTotal } from "../../obs/metrics.js";
import { emitSecurityEvent } from "../../obs/securityEvents.js";

/**
 * H9 — per-user-per-day USD cap on `/api/transcribe`.
 *
 * Чому це окремий модуль, а не розширення `assertAiQuota`:
 *   1) `assertAiQuota` працює у "кількості викликів" (request_count),
 *      а Whisper тарифікується по байтах. Дві окремі семантики у
 *      одному helper-і ускладнили б tool/default-bucket логіку.
 *   2) Tariff лежить тут (env-overridable), `aiQuota.ts` лишається
 *      vendor-agnostic (Anthropic-quota-friendly).
 *
 * Storage — той самий `ai_usage_daily` (PK `(subject_key, usage_day,
 * bucket)`), bucket = `transcribe:<model>`. Колонка `usd_micros`
 * додана міграцією `036_transcribe_usd_micros.sql`. UPSERT-семантика
 * тривіально розширюється з лічильника-cnt на лічильник-cents без
 * додаткових індексів.
 *
 * Tariff: 1 USD = 1_000_000 micros. Default $0.04 за 10 MB кліп
 * (Groq Whisper turbo, 2026-05). Стрибаємо у *micros* щоб уникнути
 * floating-point дрейфу при сумуванні десятків тисяч calls/добу.
 */

const MICROS_PER_USD = 1_000_000;
const TEN_MB_BYTES = 10 * 1024 * 1024;
const GROQ_WHISPER_USD_MICROS_PER_10MB = 40_000; // $0.04 = 40_000 micros

/**
 * `endpoint` тег для цього модуля (міграції 104/106): PK `ai_usage_daily`
 * тепер 4-колонковий `(subject_key, usage_day, bucket, endpoint)`, і
 * `endpoint` NOT NULL без DEFAULT — INSERT без явного значення падає
 * `23502`. Фіксоване значення 'transcribe' достатнє: bucket уже несе модель
 * (`transcribe:<model>`), а тег кроку тут один-єдиний.
 */
const TRANSCRIBE_ENDPOINT = "transcribe";

/**
 * Денна стеля витрат на людину. $0.10 ≈ 25 МБ аудіо ≈ **понад 40 хвилин**
 * мовлення на добу (`GROQ_WHISPER_USD_MICROS_PER_10MB` вище).
 *
 * ЗНИЖЕНО з $1.00 до $0.10 2026-09-13 (V1, рішення власника 2026-09-11:
 * «plan-gate на роуті **або** нижчий cap»). Тодішня причина зробити саме
 * це: `requirePlan` був no-op при `STRIPE_ENABLED=false`, тож ендпоінт
 * тримав закритим рівно цей рядок і ніщо інше.
 *
 * **Та підстава відпала 2026-09-16**: гейт більше не питає `STRIPE_ENABLED`,
 * а питає `isBillingEnforced()` (чи ввімкнено хоч одного провайдера), тож
 * у проді він тепер чинний. Стеля від цього не стає зайвою — вона
 * відповідає на інше питання («скільки це може коштувати»), і діє на
 * платників теж, — але аргумент «більше нічого немає» більше не діє.
 * Тобто перегляд числа тепер можна вести по фактичній вартості, а не
 * тримати його низьким як єдиний замок.
 *
 * Чому 10× можна забрати без болю: прапорець голосу вимкнений, тобто через
 * UI сюди не приходить ніхто. Лишається тестування з увімкненим
 * прапорцем — 40 хвилин мовлення на добу перекривають будь-яку таку
 * сесію з запасом, — і прямі виклики API, заради яких стеля й існує.
 * Ввімкнуть голос для реальних людей — це число варто переглянути
 * заміром, а не здогадом; env `TRANSCRIBE_USD_CAP_DAILY_MICROS` дозволяє
 * зробити це без деплою.
 */
const DEFAULT_DAILY_CAP_MICROS = MICROS_PER_USD / 10; // $0.10 / day / user

interface CapResult {
  ok: boolean;
  /** Уже витрачено сьогодні (micros). undefined якщо store unavailable. */
  spent_micros?: number;
  /** Денний cap (micros). */
  cap_micros: number;
  reason?: "cap_hit" | "store_unavailable";
}

interface Reservation {
  subject: string;
  day: string;
  bucket: string;
  micros: number;
}

/** Резерви поточних запитів (ключ — сам `req`, щоб не розширювати типи). */
const reservations = new WeakMap<Request, Reservation>();

interface UsageRow {
  usd_micros: string | number;
}

function dailyCapMicros(): number {
  const raw = process.env["TRANSCRIBE_USD_CAP_DAILY_MICROS"];
  if (raw === undefined || raw === "") return DEFAULT_DAILY_CAP_MICROS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) {
    logger.warn({
      msg: "transcribe_usd_cap_invalid_env",
      raw,
      fallback: DEFAULT_DAILY_CAP_MICROS,
    });
    return DEFAULT_DAILY_CAP_MICROS;
  }
  return n;
}

/** Linear estimate. Whisper-API price scales by audio-second, але
 *  для 10-MB-cap-у байти і секунди ~= linear, тож достатньо точно для
 *  pre-charge. */
function estimateMicros(audioBytes: number): number {
  if (audioBytes <= 0) return 0;
  return Math.ceil(
    (audioBytes / TEN_MB_BYTES) * GROQ_WHISPER_USD_MICROS_PER_10MB,
  );
}

function bucketKey(model: string): string {
  return `transcribe:${model}`;
}

interface AuthedReqUser {
  user?: { id?: string };
}

function subjectFor(req: Request): string | null {
  const id = (req as Request & AuthedReqUser).user?.id;
  return id ? `u:${id}` : null;
}

/**
 * Pre-charge check. Call AFTER `requireSession()` і AFTER body-buffering
 * (тобто `audioBytes = req.body.length`), AFTER MIME-validation. До
 * виклику Groq-у мусить бути цей gate.
 *
 * Повертає `{ok: true}` — handler продовжує до Groq-у.
 * Повертає `{ok: false}` — handler має негайно `return` і НЕ викликати
 * Groq. Цей helper сам відправляє відповідь у `res` (402 при cap-hit,
 * або просто пропускає при store-unavailable з fail-open телеметрією).
 */
export async function assertTranscribeUsdCap(
  req: Request,
  res: Response,
  audioBytes: number,
  model: string,
): Promise<CapResult> {
  const cap = dailyCapMicros();
  if (cap === 0) {
    // 0 = cap effectively disabled (e2e, dev). Шлях лишається безпечним
    // через існуючі rate-limit + count-quota.
    return { ok: true, cap_micros: 0 };
  }

  const subject = subjectFor(req);
  if (!subject) {
    // У production цей шлях недосяжний: `requireSession()` upstream
    // відсікає запит з 401 ще до handler-а, тож `req.user.id` ВЖЕ
    // встановлений на момент виклику cap-check-у. Тут — defensive
    // fail-open, щоб у тест-середовищах без auth-плумбінгу не
    // провалювати legitimate-кейси. Лог-warn детектить регресію
    // конфігурації router-а.
    logger.warn({
      msg: "transcribe_usd_cap_no_subject",
      hint: "requireSession() must be applied upstream of transcribe handler",
    });
    return { ok: true, cap_micros: cap };
  }

  const estimate = estimateMicros(audioBytes);
  const day = toKyivISODate();
  const bucket = bucketKey(model);

  if (estimate <= 0) return { ok: true, cap_micros: cap };

  // B26 — АТОМАРНЕ резервування замість SELECT → порівняння → (пізніший)
  // інкремент: паралельні виклики бачили той самий `spent` і всі
  // проходили. Тепер один умовний UPSERT (зразок — `consumeQuota` в
  // `chat/aiQuota.ts`): рядок оновлюється лише якщо `usd_micros + estimate
  // <= cap`, інакше RETURNING порожній → блок. Оцінка резервується ДО
  // виклику Groq; провал апстріму повертає її через
  // `releaseTranscribeUsdReservation`. `estimate > cap` відсікаємо
  // наперед: на INSERT-гілці (рядка ще немає) WHERE не діє.
  let reserved = false;
  let spent = 0;
  try {
    if (estimate <= cap) {
      const r = await withSubjectContext(subject, (db) =>
        db.query<UsageRow>(
          `INSERT INTO ai_usage_daily AS t
             (subject_key, usage_day, bucket, endpoint, request_count, usd_micros)
           VALUES ($1, $2::date, $3, $4, 1, $5)
           ON CONFLICT (subject_key, usage_day, bucket, endpoint)
           DO UPDATE SET
             request_count = t.request_count + 1,
             usd_micros = t.usd_micros + EXCLUDED.usd_micros
             WHERE t.usd_micros + EXCLUDED.usd_micros <= $6
           RETURNING usd_micros`,
          [subject, day, bucket, TRANSCRIBE_ENDPOINT, estimate, cap],
        ),
      );
      if (r.rows.length > 0) {
        reserved = true;
        // pg `BIGINT` приходить як string — коерсимо у number (Hard Rule #1).
        spent = Number(r.rows[0]!.usd_micros) || 0;
      }
    }
    if (!reserved) {
      // Лише для тіла 402 / логу: скільки вже витрачено (не для рішення).
      const { rows } = await withSubjectContext(subject, (db) =>
        db.query<UsageRow>(
          `SELECT usd_micros FROM ai_usage_daily
           WHERE subject_key = $1 AND usage_day = $2 AND bucket = $3
             AND endpoint = $4`,
          [subject, day, bucket, TRANSCRIBE_ENDPOINT],
        ),
      );
      spent = rows.length > 0 ? Number(rows[0]!.usd_micros) || 0 : 0;
    }
  } catch (err) {
    // Fail-open: при недоступності DB не блокуємо легітимного юзера.
    // Метрика+лог дозволяють детектити це окремо.
    try {
      transcribeUsdCapEventsTotal.inc({ outcome: "store_unavailable" });
    } catch {
      /* metric must never break a request */
    }
    logger.warn({
      msg: "transcribe_usd_cap_store_unavailable",
      err: err instanceof Error ? err.message : String(err),
      subject,
      day,
    });
    return {
      ok: true,
      cap_micros: cap,
      reason: "store_unavailable",
    };
  }

  if (!reserved) {
    try {
      transcribeUsdCapEventsTotal.inc({ outcome: "cap_hit" });
    } catch {
      /* ignore */
    }
    // Структурований event для Sentry/алертингу. Pino-payload навмисно
    // містить subject, бо ops має знати, кого розблокувати.
    logger.warn({
      msg: "transcribe.usd_cap_hit",
      subject,
      day,
      bucket,
      spent_micros: spent,
      estimated_micros: estimate,
      cap_micros: cap,
      audio_bytes: audioBytes,
    });
    emitSecurityEvent({
      event: "transcribe_usd_cap_hit",
      severity: "medium",
      details: `bucket=${bucket} day=${day} spent_micros=${spent} cap_micros=${cap}`,
    });
    res.status(402).json({
      error:
        "Денний ліміт витрат на голосову транскрипцію вичерпано. Спробуй завтра.",
      code: "TRANSCRIBE_USD_CAP",
      cap_usd: cap / MICROS_PER_USD,
      spent_usd: spent / MICROS_PER_USD,
    });
    return {
      ok: false,
      cap_micros: cap,
      spent_micros: spent,
      reason: "cap_hit",
    };
  }

  reservations.set(req, { subject, day, bucket, micros: estimate });
  return { ok: true, cap_micros: cap, spent_micros: spent };
}

/**
 * Повертає резерв, узятий `assertTranscribeUsdCap`, якщо Groq-виклик
 * провалився (upstream не виставляє рахунок за помилку). Ідемпотентний
 * (тікет знімається з `req`), не кидає винятків. GREATEST захищає від
 * від'ємних значень при повторі чи ролловері.
 */
export async function releaseTranscribeUsdReservation(
  req: Request,
): Promise<void> {
  const t = reservations.get(req);
  if (!t) return;
  reservations.delete(req);
  try {
    await withSubjectContext(t.subject, (db) =>
      db.query(
        `UPDATE ai_usage_daily
            SET usd_micros = GREATEST(0, usd_micros - $5),
                request_count = GREATEST(0, request_count - 1)
          WHERE subject_key = $1 AND usage_day = $2::date AND bucket = $3
            AND endpoint = $4`,
        [t.subject, t.day, t.bucket, TRANSCRIBE_ENDPOINT, t.micros],
      ),
    );
  } catch (err) {
    logger.warn({
      msg: "transcribe_usd_cap_release_failed",
      err: err instanceof Error ? err.message : String(err),
      subject: t.subject,
      day: t.day,
      micros: t.micros,
    });
  }
}

/**
 * Post-success accounting. Викликається ТІЛЬКИ після успішного Groq-у
 * (тобто не списуємо за виклик, що впав з 5xx — це чесно, бо upstream
 * нам теж не виставляє рахунку за provider-error).
 *
 * Якщо резерв уже взято (B26), функція лише знімає тікет. Інакше:
 * UPSERT — atomic per-row у Postgres, race-у між двома паралельними
 * викликами не існує (ON CONFLICT bucket-PK). request_count теж
 * інкрементиться, щоб лічильник кількостей не розходився з лічильником
 * USD; tokens лишаються 0 для transcribe (irrelevant).
 */
export async function recordTranscribeUsdSpend(
  req: Request,
  audioBytes: number,
  model: string,
): Promise<void> {
  // B26: якщо оцінку вже зарезервовано в `assertTranscribeUsdCap`, повторно
  // не списуємо — лише знімаємо тікет. Шлях нижче лишається для fail-open
  // (БД лежала на pre-check) і cap=0.
  if (reservations.delete(req)) return;
  const subject = subjectFor(req);
  if (!subject) return; // не повинно статись після requireSession()
  const day = toKyivISODate();
  const bucket = bucketKey(model);
  const cost = estimateMicros(audioBytes);
  if (cost <= 0) return;
  try {
    await withSubjectContext(subject, (db) =>
      db.query(
        `INSERT INTO ai_usage_daily
           (subject_key, usage_day, bucket, endpoint, request_count, usd_micros)
         VALUES ($1, $2, $3, $4, 1, $5)
         ON CONFLICT (subject_key, usage_day, bucket, endpoint) DO UPDATE SET
           request_count = ai_usage_daily.request_count + 1,
           usd_micros = ai_usage_daily.usd_micros + EXCLUDED.usd_micros`,
        [subject, day, bucket, TRANSCRIBE_ENDPOINT, cost],
      ),
    );
  } catch (err) {
    // Не блокуємо успішну транскрипцію через збій ledger-а; залогуємо.
    logger.warn({
      msg: "transcribe_usd_cap_record_failed",
      err: err instanceof Error ? err.message : String(err),
      subject,
      day,
      cost_micros: cost,
    });
  }
}

/** Експорти для тестів (внутрішні константи). */
export const __testing = {
  estimateMicros,
  dailyCapMicros,
  bucketKey,
  MICROS_PER_USD,
  GROQ_WHISPER_USD_MICROS_PER_10MB,
  DEFAULT_DAILY_CAP_MICROS,
  TRANSCRIBE_ENDPOINT,
};
