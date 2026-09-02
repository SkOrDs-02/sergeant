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
import { toLocalISODate } from "@sergeant/shared";
import {
  parseLimit,
  resolvePresetBudget,
  type QuotaBudget,
} from "./aiQuotaBudget.js";
import { aiQuotaCircuitBreaker } from "./aiQuotaCircuitBreaker.js";
import { getUserPlan } from "../billing/getUserPlan.js";
import { effectiveLimits as planLimits } from "../billing/effectiveLimits.js";
import { isAnthropicBudgetHardExceeded } from "../../obs/anthropicBudgetGuard.js";
import {
  freeOnPremiumEnabled,
  hardBreachDegradeAllEnabled,
  setTierHeader,
  tieredProEnabled,
  tierModel,
  type ProEndpoint,
  type ProTier,
  type ProTierResult,
} from "./aiQuotaTierModels.js";

// Реекспорт: caller-и (chat.ts, coach.ts, тести) історично беруть ці типи
// з `aiQuota.js`. Тримаємо контракт, щоб винесення лишилось внутрішнім.
export type { ProEndpoint, ProTier, ProTierResult };

type SessionUser = { id: string } | null;

/**
 * Квиток на refund у разі неуспіху upstream AI-виклику. Атачиться до `req`
 * (див. `WithAiQuotaRefund`), handler викликає його якщо Anthropic повернув
 * помилку / timeout / клієнт відвалився — тоді квоту не спʼємо за провалений
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

// ── Pro tiered model degradation ────────────────────────────────────
// Окремі відра рахують дорогі (premium) та дешеві (standard) AI-виклики
// Pro-юзера за добу. Каскад: premium вичерпано → standard → floor (∞,
// майже-безкоштовна модель). Pro НІКОЛИ не блокується (немає 429).
// Самі model-id і прапорці тирингу живуть у `aiQuotaTierModels.ts`.
const PREMIUM_BUCKET = "premium";
const STANDARD_BUCKET = "standard";
const DEFAULT_PREMIUM_LIMIT = 20;
const DEFAULT_STANDARD_LIMIT = 80;

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
 * truthy alongside `NODE_ENV=production` / `APP_ENV=production`. The module
 * here trusts the startup check and does not re-validate at runtime. The
 * startup gate uses the host-agnostic `isDeployedProduction()` (NODE_ENV /
 * APP_ENV), so it fires on Coolify/Hetzner regardless of the host shape.
 */
export function isAiQuotaDisabled(): boolean {
  const v = process.env["AI_QUOTA_DISABLED"]?.toLowerCase();
  return v === "1" || v === "true";
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
 * demos don't burn the authenticated free-tier cap
 * (`FREE_LIMITS.aiRequestsPerDay`, `billing/effectiveLimits.ts` — 5/day per
 * ADR-0085).
 * Covers both the default chat bucket and tool-use buckets.
 */
function isFounderUser(userId: string): boolean {
  const raw = process.env["AI_QUOTA_FOUNDER_IDS"];
  if (!raw) return false;
  return raw.split(",").some((id) => id.trim() !== "" && id.trim() === userId);
}

/**
 * Plan-aware daily AI-message cap for an authenticated user (ADR-1.7).
 * Free → `FREE_LIMITS.aiRequestsPerDay`; Pro → `null` (unlimited). See
 * `billing/effectiveLimits.ts` for the live numeric value (ADR-0085 decided
 * 5/day for Free — do not hardcode the number here, it has drifted from its
 * decision record once already).
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
 * через env `AI_QUOTA_TOOL_COST` (невідʼємне ціле; биті/відʼємні значення
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
 *      якщо ключ присутній і значення — валідне невідʼємне число.
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

/** Subject key for a logged-in user — shared by quota consume/refund and read-only usage lookups. */
function subjectForUser(userId: string): string {
  return `u:${userId}`;
}

function subjectFor(sessionUser: SessionUser, req: Request): string {
  return sessionUser ? subjectForUser(sessionUser.id) : `ip:${getIp(req)}`;
}

function today(): string {
  // Europe/Kyiv day boundary (домен-інваріант) — денна квота користувача
  // скидається о київській півночі, не UTC. Інакше «Спробуй завтра» о 02:00
  // Kyiv (UTC-північ влітку) відкривало б новий день посеред ночі юзера.
  return toLocalISODate();
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
  // Анонімного трафіку тут не буває. КОЖЕН роут, що монтує цю квоту, стоїть
  // за `requireSession()`: `routes/chat.ts`, `routes/coach.ts`,
  // `routes/weekly-digest.ts` і `r.use("/api/nutrition", requireSession())` —
  // рішення A1 з `docs/90-work/audits/ai-abuse-2026-08-05.md`, і послаблювати
  // його не можна (без сесії ключем квоти був би `ip:<addr>`, а IPv6-клієнт
  // має під підпискою цілу /64).
  //
  // Тож `sessionUser === null` тут означає не аноніма, а збій ПОВТОРНОГО
  // session-lookup усередині запиту, який `requireSession()` уже пропустив
  // (`safeSessionUser` ковтає виняток). Даємо Free-стелю — та сама
  // monetization-safe відповідь, що і в `userDailyLimit` на помилку плану:
  // ніколи не роздаємо безліміт мовчки.
  const planLimit = sessionUser
    ? await userDailyLimit(sessionUser.id)
    : planLimits("free").aiRequestsPerDay;

  // Unlimited (Pro) виходить ДО резолву preset-відра: безлімітному юзеру
  // окремий бюджет нічого не додає, а зайве відро тільки шумить у метриках.
  if (planLimit == null) return true;

  // Сценарний preset витрачає власне тижневе відро замість денного (див.
  // `resolvePresetBudget`). Усе решта — той самий шлях.
  const presetBudget = resolvePresetBudget(req);
  const isPresetBudget = presetBudget !== null;
  const budget: QuotaBudget = presetBudget ?? {
    bucket: DEFAULT_BUCKET,
    day: today(),
    limit: planLimit,
  };
  const limit = budget.limit;

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
    const day = budget.day;
    const cost = 1;
    const result = await consumeQuota({
      subject,
      day,
      limit,
      cost,
      bucket: budget.bucket,
    });
    aiQuotaCircuitBreaker.recordSuccess();
    if (!result.ok) {
      try {
        aiQuotaBlocksTotal.inc({ reason: "limit", cost: String(cost) });
      } catch {
        /* ignore */
      }
      // Денна квота і сценарний preset вичерпують РІЗНІ ліміти, тож і виходи
      // в них різні. Денна справді лишається чекати доби. Preset має тижневе
      // вікно, і «спробуй завтра» там просто неправда: вихід — ручне
      // заповнення, яке взагалі не витрачає AI.
      // Клієнт розрізняє випадки за `code` (див. `friendlyApiError` у
      // `apps/web/src/core/lib/hubChatUtils.ts`), не за текстом.
      //
      // «ЗАПИТІВ», а не «повідомлень». Лічильник інкрементиться раз на
      // HTTP-запит до AI-роута, а одне повідомлення в чаті може коштувати
      // кілька: після tool_use клієнт шле наступний POST /api/chat із
      // tool_results, і той теж проходить сюди. Копія «5 повідомлень» лишала
      // юзера з 4 відповідями і 429 на пʼятій — обіцяли не те, що метрять.
      res.status(429).json(
        isPresetBudget
          ? {
              error:
                "Ліміт AI-заповнення профілю на цей тиждень вичерпано. Дозаповни вручну в Профілі, це безкоштовно.",
              code: "AI_QUOTA_PRESET",
              limit: result.limit,
            }
          : {
              error:
                "Денний ліміт AI-запитів вичерпано (одне повідомлення інколи коштує кілька). Спробуй завтра.",
              code: "AI_QUOTA",
              limit: result.limit,
            },
      );
      return false;
    }
    try {
      const subjectType = sessionUser ? "user" : "anon";
      aiCostConsumedTotal.inc(
        {
          subject_type: subjectType,
          bucket_type: isPresetBudget ? "preset" : "default",
        },
        cost,
      );
    } catch {
      /* ignore */
    }
    attachRefund(req, { subject, day, bucket: budget.bucket, cost });
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
 * Read-only lookup of today's consumed `default`-bucket count for a logged-in
 * user. Used by `GET /api/chat/usage` (PR-42 chat counter) — never mutates.
 * Fail-open to 0 on missing DB / query error: an unreadable counter renders
 * as "0 used" in the UI rather than breaking the pricing page.
 */
export async function getTodayChatUsage(userId: string): Promise<number> {
  if (!process.env["DATABASE_URL"]) return 0;
  try {
    const r = await pool.query<ConsumeQuotaRow>(
      `SELECT request_count FROM ai_usage_daily
        WHERE subject_key = $1 AND usage_day = $2::date AND bucket = $3`,
      [subjectForUser(userId), today(), DEFAULT_BUCKET],
    );
    return r.rows[0]?.request_count ?? 0;
  } catch (e) {
    logQuotaStoreUnavailable("db_error", e);
    return 0;
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

/**
 * Pro tiered model resolution. На відміну від `assertAiQuota`, НЕ блокує і НЕ
 * шле 429 — Pro завжди отримує якусь модель. Повертає `{tier, model}`, caller
 * підставляє `model` у свій AI-виклик (chat → Anthropic stream, coach → factory).
 *
 * Каскад (лише для Pro-плану): premium-bucket (дорога модель) → standard-bucket
 * (дешевша) → floor (∞, майже-безкоштовна).
 *
 * **Free та анон ідуть `standard`-моделлю** (`unpaid()`). До 2026-08-06 вони
 * отримували `premium`, і це була інверсія: Pro після 20 викликів доби падає на
 * standard, тобто неплатник мав кращу модель, ніж платник на 21-му
 * повідомленні. Кількість Free так само капає `assertAiQuota` — змінилась лише
 * модель. Kill-switch назад: `AI_FREE_ON_PREMIUM=true`.
 *
 * `founder`/`disabled`/`flag-off` та будь-який fail-open шлях → `premium`
 * (краще зрідка переплатити, ніж заблокувати оплаченого юзера) — окрім
 * hard-breach деградації, яка накриває всіх, крім founder-а.
 *
 * Refund: інкрементиться рівно одне відро на запит (premium АБО standard), тож
 * єдиного `req.aiQuotaRefund`-слота достатньо — `attachRefund` прикріплюється
 * лише коли реально списали. Floor нічого не списує → refund не потрібен.
 *
 * Fail-open скрізь: DB-outage / circuit-open / plan-lookup-fail → `premium`.
 * Краще зрідка дати Pro дорожчу модель, ніж заблокувати оплаченого юзера.
 */
export async function resolveProTier(
  req: Request,
  res: Response,
  endpoint: ProEndpoint,
): Promise<ProTierResult> {
  const premium = (
    remaining: number | null = null,
    limit: number | null = null,
  ): ProTierResult => {
    setTierHeader(res, "premium");
    return {
      tier: "premium",
      model: tierModel("premium", endpoint),
      remaining,
      limit,
    };
  };

  /**
   * Неоплачений трафік (Free + анон). Не `premium()`: Free не деградує ніколи, а
   * Pro після 20 викликів доби падає на standard — тобто неплатник мав кращу
   * модель за платника. `remaining/limit` = `null`, бо Free капає КІЛЬКІСТЮ
   * через `assertAiQuota`, і чужі лічильники в `X-AI-*` були б брехнею.
   *
   * **Лише `chat`.** Коуч лишається на premium, і це не непослідовність, а
   * рахунок: у чаті деградація premium→standard це `glm-5.2`→`deepseek-v4-flash`
   * і −$0.014 на повідомлення, а в коуча — `gpt-5.1`→`gemini-2.5-flash-lite`,
   * тобто НАЙБІЛЬШИЙ розрив у якості за НАЙМЕНШУ економію (~$0.0035 на виклик,
   * ≈$0.05 на Free-юзера в місяць). Коуч до того ж не має plan-gate
   * (`routes/coach.ts` — лише session+ключ+квота), тож це поверхня, яку Free
   * бачить на дашборді щодня.
   */
  const unpaid = (): ProTierResult => {
    if (freeOnPremiumEnabled()) return premium();
    if (endpoint === "coach") return premium();
    setTierHeader(res, "standard");
    return {
      tier: "standard",
      model: tierModel("standard", endpoint),
      remaining: null,
      limit: null,
    };
  };

  if (isAiQuotaDisabled()) return premium();
  if (!tieredProEnabled()) return premium();

  const sessionUser = await safeSessionUser(req);
  // Founder — never degraded (plan-agnostic).
  if (sessionUser && isFounderUser(sessionUser.id)) return premium();

  // Catastrophic-cost circuit-breaker (opt-in, default off). Коли денний
  // глобальний Anthropic-spend перевищив hard-поріг І
  // `ANTHROPIC_BUDGET_HARD_DEGRADE_ALL=true` — деградуємо КОЖЕН не-founder
  // виклик (анонімний, Free і Pro) на floor-модель, не лише ті, що
  // вичерпали власну квоту. Це справжня стеля вартості, тому перевірка стоїть
  // ВИЩЕ за анонімну гілку: анонім не має плану, який можна деградувати
  // «наступного разу», і саме він найдешевший для масового виклику. Sync-флаг,
  // без DB-залежності → працює навіть при db-outage. Floor нічого не списує
  // (no refund).
  if (hardBreachDegradeAllEnabled() && isAnthropicBudgetHardExceeded()) {
    setTierHeader(res, "floor");
    return {
      tier: "floor",
      model: tierModel("floor", endpoint),
      remaining: 0,
      limit: 0,
    };
  }

  // Сесії немає. На практиці це не анонім (усі роути під `requireSession()` —
  // див. коментар у `assertAiQuota`), а збій session-lookup. Модель — standard,
  // тобто той самий тир, що й Free: не деградуємо нижче й не даруємо premium.
  if (!sessionUser) return unpaid();

  let plan: "free" | "pro" = "free";
  try {
    plan =
      (await getUserPlan(pool, sessionUser.id)).plan === "pro" ? "pro" : "free";
  } catch (e: unknown) {
    logger.warn({
      msg: "pro_tier_plan_lookup_failed",
      err: { message: (e as Error)?.message || String(e) },
    });
    return premium(); // monetization-safe: a transient blip gives Sonnet, never blocks
  }
  // Free: кількість капає `assertAiQuota`, модель — standard (див. `unpaid`).
  if (plan !== "pro") return unpaid();

  // Fail-open: never block a paying user on infra trouble.
  if (!process.env["DATABASE_URL"]) return premium();
  if (!aiQuotaCircuitBreaker.isAllowing()) return premium();

  const subject = subjectFor(sessionUser, req);
  // Both tier buckets and Free/Anon `today()` buckets use the Kyiv civil day
  // (домен-інваріант) — a single day boundary across all quota buckets.
  const day = toLocalISODate();
  const premiumLimit = parseLimit(
    "AI_PRO_PREMIUM_DAILY_LIMIT",
    DEFAULT_PREMIUM_LIMIT,
  );
  const standardLimit = parseLimit(
    "AI_PRO_STANDARD_DAILY_LIMIT",
    DEFAULT_STANDARD_LIMIT,
  );

  // 1) premium-bucket
  try {
    const pr = await consumeQuota({
      subject,
      day,
      limit: premiumLimit,
      cost: 1,
      bucket: PREMIUM_BUCKET,
    });
    aiQuotaCircuitBreaker.recordSuccess();
    if (pr.ok) {
      attachRefund(req, { subject, day, bucket: PREMIUM_BUCKET, cost: 1 });
      return premium(pr.remaining, pr.limit);
    }
  } catch (e) {
    aiQuotaCircuitBreaker.recordFailure(e);
    logQuotaStoreUnavailable("db_error", e);
    return premium(); // fail-open
  }

  // 2) standard-bucket (premium exhausted)
  try {
    const sr = await consumeQuota({
      subject,
      day,
      limit: standardLimit,
      cost: 1,
      bucket: STANDARD_BUCKET,
    });
    aiQuotaCircuitBreaker.recordSuccess();
    if (sr.ok) {
      attachRefund(req, { subject, day, bucket: STANDARD_BUCKET, cost: 1 });
      setTierHeader(res, "standard");
      return {
        tier: "standard",
        model: tierModel("standard", endpoint),
        remaining: sr.remaining,
        limit: sr.limit,
      };
    }
  } catch (e) {
    aiQuotaCircuitBreaker.recordFailure(e);
    logQuotaStoreUnavailable("db_error", e);
    // fall through to floor — degrade rather than block
  }

  // 3) floor — both exhausted (or standard-write failed). No increment, no refund.
  setTierHeader(res, "floor");
  return {
    tier: "floor",
    model: tierModel("floor", endpoint),
    remaining: 0,
    limit: standardLimit,
  };
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
 * `endpoint` тег для quota-лічильника (міграції 104/106): PK `ai_usage_daily`
 * тепер 4-колонковий `(subject_key, usage_day, bucket, endpoint)`, і
 * `endpoint` NOT NULL без DEFAULT — INSERT без явного значення падає
 * `23502`. Цей модуль рахує КІЛЬКІСТЬ повідомлень (bucket=`default`/`tool:*`),
 * а не вартість конкретного кроку (те, що трекає `endpoint` в
 * `anthropicUsageStore.ts`) — тож фіксоване значення `'quota'`, а не одне з
 * реальних endpoint-значень (`chat`, `coach-insight`, …), щоб не змішувати
 * дві різні осі групування в одному значенні колонки.
 */
const AI_QUOTA_ENDPOINT = "quota";

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
    INSERT INTO ai_usage_daily AS t (subject_key, usage_day, bucket, endpoint, request_count)
    VALUES ($1, $2::date, $3, $4, $5)
    ON CONFLICT (subject_key, usage_day, bucket, endpoint)
    DO UPDATE SET request_count = t.request_count + EXCLUDED.request_count
      WHERE t.request_count + EXCLUDED.request_count <= $6
    RETURNING request_count
  `;
  const r = await pool.query<ConsumeQuotaRow>(sql, [
    subject,
    day,
    bucket,
    AI_QUOTA_ENDPOINT,
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
        WHERE subject_key = $1 AND usage_day = $2::date AND bucket = $3
          AND endpoint = $5`,
      [
        ticket.subject,
        ticket.day,
        ticket.bucket,
        ticket.cost,
        AI_QUOTA_ENDPOINT,
      ],
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
  AI_QUOTA_ENDPOINT,
};
