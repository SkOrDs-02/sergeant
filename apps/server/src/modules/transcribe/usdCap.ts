import type { Request, Response } from "express";
import pool from "../../db.js";
import { logger } from "../../obs/logger.js";
import { transcribeUsdCapEventsTotal } from "../../obs/metrics.js";

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

const DEFAULT_DAILY_CAP_MICROS = 1 * MICROS_PER_USD; // $1.00 / day / user

interface CapResult {
  ok: boolean;
  /** Уже витрачено сьогодні (micros). undefined якщо store unavailable. */
  spent_micros?: number;
  /** Денний cap (micros). */
  cap_micros: number;
  reason?: "cap_hit" | "store_unavailable";
}

interface UsageRow {
  usd_micros: string | number;
}

function dailyCapMicros(): number {
  const raw = process.env.TRANSCRIBE_USD_CAP_DAILY_MICROS;
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

function todayKyiv(): string {
  // Kyiv-day boundary за вимогою AGENTS.md "Domain invariants" — щоб
  // 23:00 UTC = 02:00 Kyiv, тобто всередині наступного "локального" дня
  // юзер не дискриміновувався при рості кепу. Реалізація через
  // toLocaleDateString-у з sv-SE locale (yyyy-mm-dd).
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Europe/Kyiv",
  });
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
  const day = todayKyiv();
  const bucket = bucketKey(model);

  let spent = 0;
  try {
    const { rows } = await pool.query<UsageRow>(
      `SELECT usd_micros FROM ai_usage_daily
       WHERE subject_key = $1 AND usage_day = $2 AND bucket = $3`,
      [subject, day, bucket],
    );
    if (rows.length > 0) {
      // pg `BIGINT` приходить як string — коерсимо у number (AGENTS.md
      // hard rule #1).
      spent = Number(rows[0].usd_micros) || 0;
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

  if (spent + estimate > cap) {
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
    res.status(402).json({
      error:
        "Денний ліміт витрат на голосову транскрипцію вичерпано. Спробуйте завтра.",
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

  return { ok: true, cap_micros: cap, spent_micros: spent };
}

/**
 * Post-success accounting. Викликається ТІЛЬКИ після успішного Groq-у
 * (тобто не списуємо за виклик, що впав з 5xx — це чесно, бо upstream
 * нам теж не виставляє рахунку за provider-error).
 *
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
  const subject = subjectFor(req);
  if (!subject) return; // не повинно статись після requireSession()
  const day = todayKyiv();
  const bucket = bucketKey(model);
  const cost = estimateMicros(audioBytes);
  if (cost <= 0) return;
  try {
    await pool.query(
      `INSERT INTO ai_usage_daily
         (subject_key, usage_day, bucket, request_count, usd_micros)
       VALUES ($1, $2, $3, 1, $4)
       ON CONFLICT (subject_key, usage_day, bucket) DO UPDATE SET
         request_count = ai_usage_daily.request_count + 1,
         usd_micros = ai_usage_daily.usd_micros + EXCLUDED.usd_micros`,
      [subject, day, bucket, cost],
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
};
