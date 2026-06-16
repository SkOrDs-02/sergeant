import type { Request, Response } from "express";
import { getSessionUser } from "../../auth.js";
import pool from "../../db.js";
import { getIp } from "../../http/rateLimit.js";
import { logger } from "../../obs/logger.js";
import {
  aiQuotaBlocksTotal,
  aiQuotaFailOpenTotal,
  aiCostConsumedTotal,
} from "../../obs/metrics.js";
import { aiQuotaCircuitBreaker } from "./aiQuotaCircuitBreaker.js";
import { getUserPlan } from "../billing/getUserPlan.js";
import { effectiveLimits as planLimits } from "../billing/effectiveLimits.js";

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
 * default 3 — див. `toolCost`).
 *
 * Cost vs. limit — два незалежні важелі (детальніше в docstring-ах `toolCost`
 * і `toolLimit`):
 *   - ВАРТІСТЬ tool-call (вага в одиницях квоти): глобальна, env
 *     `AI_QUOTA_TOOL_COST` (default `DEFAULT_TOOL_COST=3`). Per-tool override
 *     вартості зараз НЕМАЄ.
 *   - ДЕННИЙ ЛІМІТ tool-call: per-tool override через JSON-мапу env
 *     `AI_QUOTA_TOOL_LIMITS` `{"tool":maxPerDay}`; tool-и поза мапою беруть
 *     `AI_QUOTA_TOOL_DEFAULT_LIMIT`, інакше — unlimited.
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

/**
 * `true` when the AI-quota subsystem is disabled wholesale (CI/test only).
 *
 * Reads `process.env` directly rather than the validated `env` module so that
 * unit tests can flip the flag at runtime via `process.env.AI_QUOTA_DISABLED`
 * without re-importing modules. Accepts the same truthy spellings as the typed
 * env (`true|1`) so the two stay in sync.
 *
 * Production safety lives at startup — `assertStartupEnv()` in
 * `apps/server/src/env/env.ts` hard-blocks server boot when this flag is
 * truthy alongside `NODE_ENV=production` (or any RAILWAY_* env). The module
 * here trusts the startup check and does not re-validate at runtime.
 */
export function isAiQuotaDisabled(): boolean {
  const v = process.env["AI_QUOTA_DISABLED"]?.toLowerCase();
  return v === "1" || v === "true";
}

const DEFAULT_ANON_LIMIT = 40;

/** Daily AI-message cap for an anonymous (IP-keyed) caller — env-tunable. */
function anonDailyLimit(): number | null {
  return parseLimit("AI_DAILY_ANON_LIMIT", DEFAULT_ANON_LIMIT);
}

/**
 * Founder / internal-team Better-Auth user IDs that bypass the AI daily quota
 * entirely — unlimited, plan-agnostic. Comma-separated in env
 * `AI_QUOTA_FOUNDER_IDS`; empty / unset → nobody bypasses (every user stays
 * plan-gated). Read from `process.env` directly to match the rest of this
 * module so tests can flip it without re-importing the validated env.
 *
 * Distinct from a Pro plan: a founder keeps whatever billing plan they have
 * but is never blocked by the per-user counter, so internal dogfooding and
 * demos don't burn the free 5/day cap (which is also lower than the anon
 * 40/day cap — the inversion that makes this bypass necessary for a real
 * owner account). Covers both the default chat bucket and tool-use buckets.
 */
function isFounderUser(userId: string): boolean {
  const raw = process.env["AI_QUOTA_FOUNDER_IDS"];
  if (!raw) return false;
  return raw.split(",").some((id) => id.trim() !== "" && id.trim() === userId);
}

/**
 * Plan-aware daily AI-message cap for an authenticated user (ADR-1.7).
 * Free → `FREE_LIMITS.aiRequestsPerDay` (5); Pro → `null` (unlimited).
 * Sourced from `billing/effectiveLimits` so the paid limit lives in one place.
 *
 * On a plan-lookup error we fall back to the FREE cap — never silently grant
 * unlimited (the monetization-safe default). A full DB outage is still
 * absorbed by the `consumeQuota` fail-open path downstream, so a transient
 * blip degrades to "free cap", not "blocked".
 *
 * No plan cache: the lookup is a single indexed point-read on `subscriptions`
 * and is dwarfed by the upstream Anthropic call. Add a short-TTL cache here
 * (ADR-1.7) only if profiling shows it matters.
 */
async function userDailyLimit(userId: string): Promise<number | null> {
  let plan: "free" | "pro" = "free";
  try {
    plan = (await getUserPlan(pool, userId)).plan === "pro" ? "pro" : "free";
  } catch (e: unknown) {
    logger.warn({
      msg: "ai_quota_plan_lookup_failed",
      err: { message: (e as Error)?.message || String(e) },
    });
  }
  return planLimits(plan).aiRequestsPerDay;
}

/**
 * Вартість (вага) одного tool-use виклику в одиницях квоти.
 *
 * Це ГЛОБАЛЬНА (per-tool-name-agnostic) вага: усі tool-и коштують однаково.
 * За замовчуванням `DEFAULT_TOOL_COST` (3) — один tool-call "важить" як три
 * звичайні chat-повідомлення (`default`-bucket, cost=1). Override —
 * через env `AI_QUOTA_TOOL_COST` (невід'ємне ціле; биті/від'ємні значення
 * ігноруються `parseLimit`-ом і падають на дефолт).
 *
 * NB: вартість і ліміт — це ДВА різні важелі. `AI_QUOTA_TOOL_COST` керує тим,
 * НАСКІЛЬКИ дорогий кожен виклик; `toolLimit()` (через `AI_QUOTA_TOOL_LIMITS`)
 * керує тим, СКІЛЬКИ дозволено на день. У `consumeQuota` вони зустрічаються
 * як `request_count + cost <= limit`. Наразі немає per-tool override саме
 * ВАРТОСТІ — лише per-tool override ЛІМІТУ (див. `toolLimit`).
 */
function toolCost(): number {
  return parseLimit("AI_QUOTA_TOOL_COST", DEFAULT_TOOL_COST);
}

/**
 * Per-tool денний ліміт викликів (override-механізм).
 *
 * Парсить env `AI_QUOTA_TOOL_LIMITS` як JSON-мапу `{"tool_name": maxPerDay}`.
 * Повертає ліміт (у одиницях квоти, не в кількості викликів) для конкретного
 * tool-а, або `null` (unlimited).
 *
 * Precedence (від найвищого до найнижчого):
 *   1. `AI_QUOTA_TOOL_LIMITS[toolName]` — явний per-tool ліміт із JSON-мапи,
 *      якщо ключ присутній і значення — валідне невід'ємне число.
 *   2. `AI_QUOTA_TOOL_DEFAULT_LIMIT` — fallback для tool-ів, яких немає в мапі
 *      (а також коли `AI_QUOTA_TOOL_LIMITS` взагалі не задано).
 *   3. `null` (unlimited) — якщо й дефолтний ліміт не задано.
 *
 * Зверни увагу: ліміт виражений у ОДИНИЦЯХ КВОТИ, тому реальна кількість
 * дозволених викликів = `floor(limit / toolCost())`. Напр. limit=30, cost=3 →
 * 10 викликів tool-а на день.
 *
 * Битий JSON → fallback на default-ліміт + лог-попередження (advisory-фіча не
 * повинна блокувати запити; fail-open узгоджений із рештою модуля).
 */
function toolLimit(toolName: string): number | null {
  const raw = process.env["AI_QUOTA_TOOL_LIMITS"];
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

  const sessionUser = await safeSessionUser(req);
  // Founder / internal-team users are never quota-blocked (plan-agnostic).
  if (sessionUser && isFounderUser(sessionUser.id)) return true;
  const limit = sessionUser
    ? await userDailyLimit(sessionUser.id)
    : anonDailyLimit();

  if (limit == null) return true;

  if (limit === 0) {
    try {
      aiQuotaBlocksTotal.inc({ reason: "disabled", cost: "1" });
    } catch {
      /* ignore */
    }
    res.status(429).json({
      error: "AI-квота вимкнена для цього типу доступу.",
      code: "AI_QUOTA",
    });
    return false;
  }

  if (!process.env["DATABASE_URL"]) {
    logQuotaStoreUnavailable("database_url_missing");
    setRemainingHeader(res, "unknown");
    return true;
  }

  // PR-04: circuit-breaker fail-CLOSED. Якщо у попередні 60s була буря
  // DB-помилок, не кидаємо новий запит у мертве сховище — повертаємо 503,
  // щоб не давати безквотовий burst, поки DB-сторейдж недоступний.
  if (!aiQuotaCircuitBreaker.isAllowing()) {
    return rejectCircuitOpen(res);
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
    aiQuotaCircuitBreaker.recordSuccess();
    if (!result.ok) {
      try {
        aiQuotaBlocksTotal.inc({ reason: "limit", cost: String(cost) });
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
    try {
      const subjectType = sessionUser ? "user" : "anon";
      aiCostConsumedTotal.inc(
        { subject_type: subjectType, bucket_type: "default" },
        cost,
      );
    } catch {
      /* ignore */
    }
    attachRefund(req, { subject, day, bucket: DEFAULT_BUCKET, cost });
    setRemainingHeader(res, String(result.remaining));
    return true;
  } catch (e) {
    aiQuotaCircuitBreaker.recordFailure(e);
    logQuotaStoreUnavailable("db_error", e);
    if (!aiQuotaCircuitBreaker.isAllowing()) {
      return rejectCircuitOpen(res);
    }
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
 * Cost-override механізм (вартість і ліміт — два незалежні важелі):
 *   - ВАРТІСТЬ виклику = `toolCost()` (env `AI_QUOTA_TOOL_COST`, default
 *     `DEFAULT_TOOL_COST=3`) — глобальна для всіх tool-ів, per-tool override
 *     вартості НЕМАЄ.
 *   - ДЕННИЙ ЛІМІТ = `toolLimit(toolName)` — per-tool override через JSON-мапу
 *     env `AI_QUOTA_TOOL_LIMITS`, з precedence
 *     `AI_QUOTA_TOOL_LIMITS[toolName]` → `AI_QUOTA_TOOL_DEFAULT_LIMIT` → `null`
 *     (unlimited). Деталі — у docstring-ах `toolCost` / `toolLimit`.
 *   - Гейт: bucket `tool:<name>` блокується коли
 *     `request_count + toolCost() > toolLimit(toolName)` (атомарно в
 *     `consumeQuota`). Реальна кількість дозволених викликів =
 *     `floor(limit / cost)` (напр. limit=30, cost=3 → 10 викликів/день).
 *   - `limit == null` (unlimited) і `isAiQuotaDisabled()` — раннє повернення
 *     `ok=true` без жодного інкременту.
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
  const sessionUser = await safeSessionUser(req);
  // Founder / internal-team users bypass tool-use quota too (plan-agnostic).
  if (sessionUser && isFounderUser(sessionUser.id)) {
    return { ok: true, remaining: null, limit: null };
  }
  const limit = toolLimit(toolName);
  if (limit == null) {
    return { ok: true, remaining: null, limit: null };
  }
  if (limit === 0) {
    try {
      aiQuotaBlocksTotal.inc({
        reason: "tool_disabled",
        cost: String(toolCost()),
      });
    } catch {
      /* ignore */
    }
    return { ok: false, remaining: 0, limit: 0, reason: "disabled" };
  }

  if (!process.env["DATABASE_URL"]) {
    logQuotaStoreUnavailable("database_url_missing");
    return { ok: true, remaining: null, limit, reason: "store_unavailable" };
  }

  // PR-04: fail-CLOSED при відкритому breaker. На відміну від assertAiQuota,
  // тут немає `res` для 503 — повертаємо `ok=false, reason=store_unavailable`.
  // Caller у chat-хендлері трактує це як "tool неактивний для цього виклику",
  // що блокує саме tool-use, але не валить весь стрім.
  if (!aiQuotaCircuitBreaker.isAllowing()) {
    return {
      ok: false,
      remaining: 0,
      limit,
      reason: "store_unavailable",
    };
  }

  const subject = subjectFor(sessionUser, req);
  try {
    const result = await consumeQuota({
      subject,
      day: today(),
      limit,
      cost: toolCost(),
      bucket: `${TOOL_BUCKET_PREFIX}${toolName}`,
    });
    aiQuotaCircuitBreaker.recordSuccess();
    if (!result.ok) {
      try {
        aiQuotaBlocksTotal.inc({
          reason: "tool_limit",
          cost: String(toolCost()),
        });
      } catch {
        /* ignore */
      }
      return { ...result, reason: "limit" };
    }
    try {
      const sessionUser2 = await safeSessionUser(req);
      const subjectType2 = sessionUser2 ? "user" : "anon";
      aiCostConsumedTotal.inc(
        { subject_type: subjectType2, bucket_type: "tool" },
        toolCost(),
      );
    } catch {
      /* ignore */
    }
    return result;
  } catch (e) {
    aiQuotaCircuitBreaker.recordFailure(e);
    logQuotaStoreUnavailable("db_error", e);
    if (!aiQuotaCircuitBreaker.isAllowing()) {
      return {
        ok: false,
        remaining: 0,
        limit,
        reason: "store_unavailable",
      };
    }
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
  // PR-04: sliding-window-counter тепер веде `aiQuotaCircuitBreaker`
  // через `recordFailure(e)`. Тут лишився лише лог + Prometheus-counter
  // `ai_quota_fail_open_total{reason}`, бо `database_url_missing` —
  // це не runtime-failure, а конфіг, і breaker його не повинен бачити.
  const err = e as { message?: string; code?: string } | undefined;
  logger.error({
    msg: "ai_quota_store_unavailable",
    reason,
    err: e
      ? { message: err?.message || String(e), code: err?.code }
      : undefined,
  });
}

function rejectCircuitOpen(res: Response): boolean {
  try {
    aiQuotaBlocksTotal.inc({ reason: "circuit_open", cost: "0" });
  } catch {
    /* ignore */
  }
  const retryAfterSec = Math.max(
    1,
    Math.ceil(aiQuotaCircuitBreaker.getRetryAfterMs() / 1000),
  );
  try {
    res.setHeader("Retry-After", String(retryAfterSec));
  } catch {
    /* ignore */
  }
  res.status(503).json({
    error: "Сховище AI-квоти тимчасово недоступне. Спробуй пізніше.",
    code: "AI_QUOTA_DB_DOWN",
    retryAfterSec,
  });
  return false;
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
  const next = r!.rows[0]!.request_count;
  return { ok: true, remaining: Math.max(0, limit - next), limit };
}

/**
 * Атомарний decrement лічильника у разі неуспіху upstream AI-виклику.
 * GREATEST захищає від race-ів, коли лічильник уже був скинутий денним
 * ролловером, або коли refund викликається двічі помилково. Не кидає винятки —
 * refund не повинен ламати відповідь на помилку.
 */
async function refundConsumed(ticket: ConsumedTicket): Promise<void> {
  if (!process.env["DATABASE_URL"]) return;
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
