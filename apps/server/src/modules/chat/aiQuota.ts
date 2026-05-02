import type { Request, Response } from "express";
import { getSessionUser } from "../../auth.js";
import pool from "../../db.js";
import { getIp } from "../../http/rateLimit.js";
import { logger } from "../../obs/logger.js";
import { aiQuotaBlocksTotal, aiQuotaFailOpenTotal } from "../../obs/metrics.js";

type SessionUser = { id: string } | null;

/**
 * Квиток на refund у разі неуспіху upstream AI-виклику. Атачиться до `req`
 * (див. `WithAiQuotaRefund`), handler викликає його якщо Anthropic повернув
 * помилку / timeout / клієнт відвалився — тоді квоту не сп'ємо за провалений
 * запит. Без-db режим (fail-open) повертає no-op refund.
 */
export interface AiQuotaRefund {
  (): Promise<void>;
}

export type WithAiQuotaRefund = { aiQuotaRefund?: AiQuotaRefund };

interface ConsumedTicket {
  subject: string;
  day: string;
  bucket: string;
  cost: number;
}

interface QuotaResult {
  ok: boolean;
  remaining: number | null;
  limit: number | null;
  reason?: "disabled" | "limit" | "store_unavailable";
}

interface EffectiveLimits {
  user: number | null;
  anon: number | null;
}

interface ConsumeQuotaOpts {
  subject: string;
  day: string;
  limit: number;
  cost: number;
  bucket: string;
}

interface ConsumeQuotaRow {
  request_count: number;
}

interface ConsumeQuotaReturn {
  ok: boolean;
  remaining: number;
  limit: number;
}

/**
 * Денна AI-квота. Зберігається в `ai_usage_daily` як лічильник по (subject, day,
 * bucket). Є два типи bucket-ів: `default` — звичайний chat/coach/digest/nutrition
 * (cost=1), `tool:<name>` — окремий tool-use виклик (cost = AI_QUOTA_TOOL_COST,
 * default 3). tool-ліміти задаються JSON-ом через AI_QUOTA_TOOL_LIMITS.
 *
 * Інкремент — атомарний UPSERT з умовою `request_count + cost <= limit` на
 * ON CONFLICT DO UPDATE. Raceʼу між паралельними запитами немає: у Postgres
 * ON CONFLICT взаємовиключний per-row, тож два конкурентні інкременти не
 * можуть одночасно перевищити ліміт.
 *
 * Сховище advisory: при недоступності БД (no DATABASE_URL, ECONNREFUSED, no
 * table) — fail-open, щоб збій квоти не поклав усі AI-фічі. Це прийнятно, бо
 * upstream-ліміти Anthropic і per-route rate-limit все одно працюють.
 */

const DEFAULT_BUCKET = "default";
const TOOL_BUCKET_PREFIX = "tool:";
const DEFAULT_TOOL_COST = 3;

function parseLimit<F extends number | null>(
  name: string,
  fallback: F,
): number | F {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function isAiQuotaDisabled(): boolean {
  return process.env.AI_QUOTA_DISABLED === "1";
}

// Runs once at module import — warns ops if quotas are bypassed in production.
if (
  process.env.AI_QUOTA_DISABLED === "1" &&
  process.env.NODE_ENV === "production"
) {
  logger.warn({ msg: "ai_quota_disabled_in_production" });
}

function effectiveLimits(): EffectiveLimits {
  if (isAiQuotaDisabled()) return { user: null, anon: null };
  return {
    user: parseLimit("AI_DAILY_USER_LIMIT", 120),
    anon: parseLimit("AI_DAILY_ANON_LIMIT", 40),
  };
}

function toolCost(): number {
  return parseLimit("AI_QUOTA_TOOL_COST", DEFAULT_TOOL_COST);
}

/**
 * Парсить AI_QUOTA_TOOL_LIMITS як JSON {"tool_name": maxPerDay, ...}.
 * Повертає ліміт для конкретного tool-а, або null (unlimited). На битому
 * JSON-і — null + лог-попередження (advisory-фіча не повинна блокувати запити).
 */
function toolLimit(toolName: string): number | null {
  const raw = process.env.AI_QUOTA_TOOL_LIMITS;
  if (!raw) {
    return parseLimit("AI_QUOTA_TOOL_DEFAULT_LIMIT", null);
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (parsed && typeof parsed === "object" && toolName in parsed) {
      const v = parsed[toolName];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
    }
  } catch (e: unknown) {
    logger.warn({
      msg: "ai_quota_tool_limits_parse_failed",
      err: { message: (e as Error)?.message || String(e) },
    });
  }
  return parseLimit("AI_QUOTA_TOOL_DEFAULT_LIMIT", null);
}

async function safeSessionUser(req: Request): Promise<SessionUser> {
  try {
    return (await getSessionUser(req)) as SessionUser;
  } catch (e: unknown) {
    logger.warn({
      msg: "ai_quota_session_lookup_failed",
      err: { message: (e as Error)?.message || String(e) },
    });
    return null;
  }
}

function subjectFor(sessionUser: SessionUser, req: Request): string {
  return sessionUser ? `u:${sessionUser.id}` : `ip:${getIp(req)}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Default-bucket (plain chat) quota check. Shape збережено (backwards compat):
 * повертає true/false; при вичерпанні сама відправляє 429 у `res`.
 */
export async function assertAiQuota(
  req: Request,
  res: Response,
): Promise<boolean> {
  if (isAiQuotaDisabled()) return true;

  const { user: userLimit, anon: anonLimit } = effectiveLimits();
  const sessionUser = await safeSessionUser(req);
  const limit = sessionUser ? userLimit : anonLimit;

  if (limit == null) return true;

  if (limit === 0) {
    try {
      aiQuotaBlocksTotal.inc({ reason: "disabled" });
    } catch {
      /* ignore */
    }
    res.status(429).json({
      error: "AI-квота вимкнена для цього типу доступу.",
      code: "AI_QUOTA",
    });
    return false;
  }

  if (!process.env.DATABASE_URL) {
    logQuotaStoreUnavailable("database_url_missing");
    setRemainingHeader(res, "unknown");
    return true;
  }

  const subject = subjectFor(sessionUser, req);
  try {
    const day = today();
    const cost = 1;
    const result = await consumeQuota({
      subject,
      day,
      limit,
      cost,
      bucket: DEFAULT_BUCKET,
    });
    if (!result.ok) {
      try {
        aiQuotaBlocksTotal.inc({ reason: "limit" });
      } catch {
        /* ignore */
      }
      res.status(429).json({
        error: "Денний ліміт AI вичерпано. Спробуй завтра.",
        code: "AI_QUOTA",
        limit: result.limit,
      });
      return false;
    }
    attachRefund(req, { subject, day, bucket: DEFAULT_BUCKET, cost });
    setRemainingHeader(res, String(result.remaining));
    return true;
  } catch (e) {
    logQuotaStoreUnavailable("db_error", e);
    setRemainingHeader(res, "unknown");
    return true;
  }
}

/**
 * Per-tool quota check. Викликається з chat-хендлера, коли Anthropic повертає
 * tool_use-блок (або при обробці tool_results). Тут НЕ відправляється 429
 * автоматично — caller сам вирішує, як сигналізувати користувачу (напр.,
 * повернути текстову відповідь "ліміт вичерпано" замість виклику tool-а).
 *
 * Повертає `{ok, remaining, limit, reason?}`. `reason` — `"disabled" | "limit"
 * | "store_unavailable"` — для телеметрії.
 *
 * @param {import("express").Request} req
 * @param {string} toolName
 */
export async function consumeToolQuota(
  req: Request,
  toolName: string,
): Promise<QuotaResult> {
  if (isAiQuotaDisabled()) {
    return { ok: true, remaining: null, limit: null };
  }
  const limit = toolLimit(toolName);
  if (limit == null) {
    return { ok: true, remaining: null, limit: null };
  }
  if (limit === 0) {
    try {
      aiQuotaBlocksTotal.inc({ reason: "tool_disabled" });
    } catch {
      /* ignore */
    }
    return { ok: false, remaining: 0, limit: 0, reason: "disabled" };
  }

  if (!process.env.DATABASE_URL) {
    logQuotaStoreUnavailable("database_url_missing");
    return { ok: true, remaining: null, limit, reason: "store_unavailable" };
  }

  const sessionUser = await safeSessionUser(req);
  const subject = subjectFor(sessionUser, req);
  try {
    const result = await consumeQuota({
      subject,
      day: today(),
      limit,
      cost: toolCost(),
      bucket: `${TOOL_BUCKET_PREFIX}${toolName}`,
    });
    if (!result.ok) {
      try {
        aiQuotaBlocksTotal.inc({ reason: "tool_limit" });
      } catch {
        /* ignore */
      }
      return { ...result, reason: "limit" };
    }
    return result;
  } catch (e) {
    logQuotaStoreUnavailable("db_error", e);
    return { ok: true, remaining: null, limit, reason: "store_unavailable" };
  }
}

function setRemainingHeader(res: Response, value: string): void {
  try {
    res.setHeader("X-AI-Quota-Remaining", value);
  } catch {
    /* ignore */
  }
}

function logQuotaStoreUnavailable(reason: string, e?: unknown): void {
  try {
    aiQuotaFailOpenTotal.inc({ reason });
  } catch {
    /* ignore */
  }
  const err = e as { message?: string; code?: string } | undefined;
  logger.error({
    msg: "ai_quota_store_unavailable",
    reason,
    err: e
      ? { message: err?.message || String(e), code: err?.code }
      : undefined,
  });
}

/**
 * Атомарний інкремент лічильника з verifi-ON-CONFLICT:
 *   INSERT (cost) — якщо рядка ще немає (завжди проходить, бо cost <= limit
 *                   перевіряємо наперед).
 *   ON CONFLICT UPDATE count = count + cost WHERE count + cost <= limit
 *                — якщо рядок існує і новий count не перевищить limit.
 *
 * Якщо WHERE на DO UPDATE false — RETURNING повертає 0 рядків → блокуємо.
 *
 * NOTE: pre-check `cost > limit` покриває крайовий випадок: коли рядка ще
 * немає, ON CONFLICT WHERE не спрацьовує, і ми б вставили count=cost > limit.
 *
 */
async function consumeQuota({
  subject,
  day,
  limit,
  cost,
  bucket,
}: ConsumeQuotaOpts): Promise<ConsumeQuotaReturn> {
  if (cost > limit) {
    return { ok: false, remaining: 0, limit };
  }

  const sql = `
    INSERT INTO ai_usage_daily AS t (subject_key, usage_day, bucket, request_count)
    VALUES ($1, $2::date, $3, $4)
    ON CONFLICT (subject_key, usage_day, bucket)
    DO UPDATE SET request_count = t.request_count + EXCLUDED.request_count
      WHERE t.request_count + EXCLUDED.request_count <= $5
    RETURNING request_count
  `;
  const r = await pool.query<ConsumeQuotaRow>(sql, [
    subject,
    day,
    bucket,
    cost,
    limit,
  ]);
  if (r.rows.length === 0) {
    return { ok: false, remaining: 0, limit };
  }
  const next = r.rows[0].request_count;
  return { ok: true, remaining: Math.max(0, limit - next), limit };
}

/**
 * Атомарний decrement лічильника у разі неуспіху upstream AI-виклику.
 * GREATEST захищає від race-ів, коли лічильник уже був скинутий денним
 * ролловером, або коли refund викликається двічі помилково. Не кидає винятки —
 * refund не повинен ламати відповідь на помилку.
 */
async function refundConsumed(ticket: ConsumedTicket): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await pool.query(
      `UPDATE ai_usage_daily
          SET request_count = GREATEST(0, request_count - $4)
        WHERE subject_key = $1 AND usage_day = $2::date AND bucket = $3`,
      [ticket.subject, ticket.day, ticket.bucket, ticket.cost],
    );
  } catch (e: unknown) {
    const err = e as { message?: string; code?: string } | undefined;
    logger.warn({
      msg: "ai_quota_refund_failed",
      subject: ticket.subject,
      bucket: ticket.bucket,
      cost: ticket.cost,
      err: { message: err?.message || String(e), code: err?.code },
    });
  }
}

/**
 * Атачить один-раз-використовуваний refund closure до `req`. Handler може
 * викликати `(req as WithAiQuotaRefund).aiQuotaRefund?.()` якщо upstream
 * повернув помилку — кожен наступний виклик no-op (ідемпотентно).
 */
function attachRefund(req: Request, ticket: ConsumedTicket): void {
  let used = false;
  (req as Request & WithAiQuotaRefund).aiQuotaRefund = async () => {
    if (used) return;
    used = true;
    await refundConsumed(ticket);
  };
}

/** Test-only: прямий доступ до атомарного інкременту без HTTP-прошарку. */
export const __aiQuotaTestHooks = {
  consumeQuota,
  refundConsumed,
  DEFAULT_BUCKET,
  TOOL_BUCKET_PREFIX,
};
