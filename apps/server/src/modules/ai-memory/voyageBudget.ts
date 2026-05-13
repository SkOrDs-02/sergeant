/**
 * PR-38 — Voyage soft daily-usage gate (in-process).
 *
 * Track-имо USD-витрати на Voyage embeddings за поточну UTC-добу і
 * fail-soft-имо коли вони перевищують `VOYAGE_DAILY_BUDGET_USD_SOFT`:
 *   1. emit Sentry warning (idempotent — один alert на (day, threshold));
 *   2. skip embedding-виклик, якщо caller позначив його як non-critical
 *      (RAG digests, background-цикли).
 *
 * Чому in-memory + UTC-key, а не Prometheus query: на dev/single-replica
 * Railway-deploy-і це найдешевший спосіб дістати "сьогоднішній run-rate"
 * без виходу за межі процесу. На multi-replica setup-і кожна репліка має
 * свій лічильник — це OK для soft-gate-у (мета: захист від runaway loop-у,
 * не точна biling-точка; Prometheus-side `VoyageDailyBudget*Breach` лишається
 * додатковим контролем поверх).
 *
 * Lifecycle: `Map<dayKey, usdSum>` авто-prune-имо при додаванні нового
 * dayKey-у (LRU не потрібен — багатотижневий процес-uptime малоймовірний,
 * але якщо буде — лиш одна-дві stale-ключі лишаються до наступного дня).
 *
 * Sentry idempotency: `Set<"YYYY-MM-DD:threshold">`. Якщо oper-team змінив
 * `VOYAGE_DAILY_BUDGET_USD_SOFT` на льоту (рестарт процесу) і знову
 * перейшли поріг — fresh warning, бо threshold у key змінився. Без
 * рестарту змінити env-var не можна (env.ts читає `process.env` at-load),
 * тому threshold у key реально стабільний.
 */

import { env } from "../../env.js";
import { logger } from "../../obs/logger.js";
import { Sentry } from "../../sentry.js";
import type { EmbeddingCallCriticality } from "./types.js";

/**
 * Criticality classifier для voyage-викликів. "critical" — user-facing
 * read (`recall`) або explicit user write; "non-critical" — background
 * ingestion (digest, RAG-prep), де skip-нути дешевше за overflow budget-у.
 *
 * Reaffirms `EmbeddingCallCriticality` з `types.ts` як локальний alias,
 * щоб voyage-специфічні call-sites не залежали від abstract embedding-
 * provider-контракту.
 */
export type VoyageCallCriticality = EmbeddingCallCriticality;

interface BudgetState {
  /** Map<"YYYY-MM-DD", usdSum>. */
  perDayUsage: Map<string, number>;
  /**
   * Set<"YYYY-MM-DD:threshold"> — anti-spam flag для Sentry alert-у.
   * `threshold` тут це actual USD value (наприклад `1`), а не tier-name —
   * щоб зміна `VOYAGE_DAILY_BUDGET_USD_SOFT` на льоту (між рестартами)
   * генерувала свіжий alert. Для tier-based dedup (`soft`/`hard`)
   * див. `alertedTiers`.
   */
  alertedKeys: Set<string>;
  /**
   * Set<"YYYY-MM-DD:soft|hard|monthly"> — додатковий anti-spam за tier-
   * name-ом. Гарантує, що навіть якщо threshold value змінився на льоту,
   * того самого дня шлемо ≤1 alert на tier (важливо для on-call досвіду:
   * флапаючий env-var не повинен спамити Telegram).
   */
  alertedTiers: Set<string>;
  /**
   * Чи перевищили hard-cap у поточному UTC-дні. Sync-readable через
   * `isVoyageBudgetHardExceeded()` для non-critical ingestion gate-у
   * (`service.ts::remember`). Скидається на day-rollover (новий dayKey).
   */
  hardBreachedDayKey: string | null;
}

/**
 * Module-level singleton state. Експорт-имо `__resetVoyageBudgetState` для
 * тестів — production-code НЕ повинен його викликати.
 */
const state: BudgetState = {
  perDayUsage: new Map(),
  alertedKeys: new Set(),
  alertedTiers: new Set(),
  hardBreachedDayKey: null,
};

/**
 * UTC-day key у `"YYYY-MM-DD"` форматі. ISO-substring — найдешевший
 * парс-фрі шлях; toISOString() гарантовано повертає UTC (не локальний TZ).
 *
 * NOTE: domain-invariant Sergeant-у — `Europe/Kyiv` day-boundary. Тут
 * саме UTC: budget-аналітика прив'язана до Voyage billing-day (UTC),
 * а не до user-facing-дня. Це окремий agreement з SRE — не плутати з
 * за-Kyiv-time finyk-roll-up-ами.
 */
export function getVoyageUtcDayKey(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * Поточний поріг soft-cap-у (USD/day). Окрема функція щоб тести
 * могли перевіряти fallback-семантику без `vi.resetModules()`.
 *
 * `VOYAGE_DAILY_BUDGET_USD_SOFT` env читається через `env.ts` — там
 * `floatFromEnv(1)` повертає `1` коли env-var unset/порожній/NaN.
 * Тут `<= 0` трактуємо як "вимкнено" (soft-gate no-op).
 */
export function getVoyageSoftBudgetUsd(): number {
  const cap = env.VOYAGE_DAILY_BUDGET_USD_SOFT;
  return Number.isFinite(cap) && cap > 0 ? cap : 0;
}

/**
 * Поточний поріг hard-cap-у (USD/day). `<= 0` → вимкнено (no-op).
 * Парний до `getVoyageSoftBudgetUsd()` — додано у Voyage daily cost
 * alert PR (analogous to `ANTHROPIC_BUDGET_HARD_USD`).
 */
export function getVoyageHardBudgetUsd(): number {
  const cap = env.VOYAGE_DAILY_BUDGET_USD_HARD;
  return Number.isFinite(cap) && cap > 0 ? cap : 0;
}

/**
 * Місячний budget envelope (USD/month). Не daily, а monthly — для
 * projection-alert-у: якщо `today-spend × днів-у-місяці > monthly-cap`,
 * шлемо warning з proj-spend для on-call.
 *
 * `VOYAGE_MONTHLY_BUDGET_USD` `<= 0` → projection-alert вимкнено.
 */
export function getVoyageMonthlyBudgetUsd(): number {
  const cap = env.VOYAGE_MONTHLY_BUDGET_USD;
  return Number.isFinite(cap) && cap > 0 ? cap : 0;
}

/**
 * Sync-helper для не-критичних callsite-ів (`service.ts::remember`,
 * background BullMQ-worker-ів): чи відстрелявся hard-cap сьогодні.
 *
 * Pause-ingestion гейт: коли true, caller повинен skip-нути embed-call
 * замість виклику `embedBatch()` (надлишковий — soft-gate уже скіпне
 * non-critical, а hard додатково гарантує, що навіть якщо soft вимкнено
 * (`SOFT=0`), ingestion не йде).
 *
 * Auto-reset на day-rollover: якщо stored dayKey != today, прапор
 * вважається застарілим (повертаємо false). Real-clear відбувається у
 * `addVoyageDailyUsageUsd` при stale-prune (далі ще раз hard-check
 * запалить flag заново якщо USD-спід продовжується).
 */
export function isVoyageBudgetHardExceeded(now: number = Date.now()): boolean {
  if (!state.hardBreachedDayKey) return false;
  return state.hardBreachedDayKey === getVoyageUtcDayKey(now);
}

/**
 * Сума USD-витрат на Voyage за поточну UTC-добу. Stale-day-ключі
 * (попередні дні) не враховуються — повертаємо 0 коли today-bucket
 * відсутній.
 */
export function getVoyageDailyUsageUsd(now: number = Date.now()): number {
  const key = getVoyageUtcDayKey(now);
  return state.perDayUsage.get(key) ?? 0;
}

/**
 * Інкремент денного USD-лічильника. Викликається з `recordVoyageUsage`
 * у `embeddings.ts` ПІСЛЯ обчислення `usd = tokens * pricePerMTok / 1e6`.
 *
 * `<= 0`-значення skip-имо (не псуємо bucket NaN-ом/нулями). Старі
 * dayKey-ключі видаляємо щоб Map не ріс при довгому uptime-і.
 */
export function addVoyageDailyUsageUsd(
  usd: number,
  now: number = Date.now(),
): void {
  if (!Number.isFinite(usd) || usd <= 0) return;
  const todayKey = getVoyageUtcDayKey(now);
  // Prune stale: лишаємо тільки today's bucket. Воркер-процес,
  // який живе тиждень, не повинен тримати 7+ Map-entries.
  for (const key of state.perDayUsage.keys()) {
    if (key !== todayKey) state.perDayUsage.delete(key);
  }
  // Те саме для alertedKeys: ключі попередніх днів anti-spam-у вже
  // не потрібні (новий день → fresh alert allowed).
  for (const key of state.alertedKeys) {
    if (!key.startsWith(`${todayKey}:`)) state.alertedKeys.delete(key);
  }
  // Per-tier anti-spam ключі: daily — `YYYY-MM-DD:soft|hard`; monthly —
  // `YYYY-MM:monthly`. Prune daily-ключі попередніх днів. Monthly
  // лишаємо доки monthKey збігається (prune-имо тільки якщо month
  // зрушився, що в межах одного інкременту відбувається ≤1 раз/місяць).
  const todayMonthKey = todayKey.slice(0, 7);
  for (const key of state.alertedTiers) {
    if (key.endsWith(":monthly")) {
      if (!key.startsWith(`${todayMonthKey}:`)) state.alertedTiers.delete(key);
    } else if (!key.startsWith(`${todayKey}:`)) {
      state.alertedTiers.delete(key);
    }
  }
  // Hard-breach flag застаріває на day-rollover.
  if (state.hardBreachedDayKey && state.hardBreachedDayKey !== todayKey) {
    state.hardBreachedDayKey = null;
  }
  state.perDayUsage.set(todayKey, (state.perDayUsage.get(todayKey) ?? 0) + usd);
}

/**
 * Контракт-результат preflight-перевірки перед voyage-викликом.
 *  - `allow` — чи виконувати виклик (false тільки якщо
 *    `non-critical` AND over soft-cap).
 *  - `overSoftLimit` — чи перейдено поріг (для caller-логування).
 *  - `usage` — поточна USD-сума за день (для логів/тестів).
 *  - `threshold` — застосований soft-cap.
 *  - `dayKey` — UTC-key (для логів).
 */
export interface VoyageBudgetCheckResult {
  readonly allow: boolean;
  readonly overSoftLimit: boolean;
  readonly usage: number;
  readonly threshold: number;
  readonly dayKey: string;
}

/**
 * Preflight-перевірка перед voyage-викликом. Викликається з
 * `embeddings.ts::callVoyage()`.
 *
 * Логіка:
 *  1. Якщо soft-cap вимкнено (`<= 0`) → завжди allow=true.
 *  2. Інакше беремо `getVoyageDailyUsageUsd()`. Якщо `usage > cap`:
 *     a. Idempotently emit Sentry warning (1× на (dayKey, threshold)).
 *     b. allow=false коли criticality === "non-critical".
 *     c. allow=true коли criticality === "critical" — alert уже відправили,
 *        але user-facing виклик пропускаємо (degrade quality > break UX).
 *
 * Sentry-warning level = `warning` (не `error`) — це soft-soft cap, не
 * outage. SRE отримує одне повідомлення на день з контекстом
 * (`usage_usd`, `threshold_usd`, `day_key`), далі дивиться Grafana.
 */
export function checkVoyageSoftBudget(opts: {
  criticality: VoyageCallCriticality;
  now?: number;
}): VoyageBudgetCheckResult {
  const now = opts.now ?? Date.now();
  const threshold = getVoyageSoftBudgetUsd();
  const dayKey = getVoyageUtcDayKey(now);
  const usage = getVoyageDailyUsageUsd(now);

  if (threshold <= 0) {
    return {
      allow: true,
      overSoftLimit: false,
      usage,
      threshold,
      dayKey,
    };
  }

  const overSoftLimit = usage > threshold;
  if (!overSoftLimit) {
    return {
      allow: true,
      overSoftLimit: false,
      usage,
      threshold,
      dayKey,
    };
  }

  fireVoyageBudgetAlertOnce({
    tier: "soft",
    dayKey,
    usage,
    threshold,
  });

  // Hard-check паралельно (а не «замість»): hard alert треба запалити
  // одного разу за тих самих умов. Тут soft-tick не дає monthly
  // projection — це окрема обчислювальна гілка нижче.
  maybeFireHardAlert(dayKey, usage);
  maybeFireMonthlyProjectionAlert(dayKey, usage, opts.now ?? Date.now());

  const allow = opts.criticality === "critical";
  return {
    allow,
    overSoftLimit: true,
    usage,
    threshold,
    dayKey,
  };
}

/**
 * Зважує `usage` проти hard-cap-у. Якщо ≥ — fire one-shot error-level
 * alert і взводимо `state.hardBreachedDayKey`. Викликається з двох місць:
 *  1) preflight `checkVoyageSoftBudget` (коли soft уже перевищили й ми
 *     все одно entered alert-логіку);
 *  2) post-record check (`runVoyageBudgetTick`) — щоб hard alert fire-вся
 *     навіть коли soft вимкнено (`SOFT=0`).
 */
function maybeFireHardAlert(dayKey: string, usage: number): void {
  const hardCap = getVoyageHardBudgetUsd();
  if (hardCap <= 0) return;
  if (usage < hardCap) return;
  // Запалюємо breach-flag навіть якщо alert уже відстрелявся раніше —
  // це idempotent сигнал, не alert (читачі — pause-ingestion гейти).
  state.hardBreachedDayKey = dayKey;
  fireVoyageBudgetAlertOnce({
    tier: "hard",
    dayKey,
    usage,
    threshold: hardCap,
  });
}

/**
 * Projection-alert: проектуємо today-spend на повний місяць
 * (`usage × днів-у-місяці`) і порівнюємо з `VOYAGE_MONTHLY_BUDGET_USD`.
 * Якщо проекція ≥ monthly-cap — fire warning-level (один на (місяць, monthly)).
 *
 * Idempotency key — `YYYY-MM:monthly` (не daily), щоб alert не дублювався
 * щодня при стабільному overspend-і.
 */
function maybeFireMonthlyProjectionAlert(
  dayKey: string,
  usage: number,
  now: number,
): void {
  const monthly = getVoyageMonthlyBudgetUsd();
  if (monthly <= 0 || usage <= 0) return;
  const nowDate = new Date(now);
  const daysInMonth = new Date(
    nowDate.getUTCFullYear(),
    nowDate.getUTCMonth() + 1,
    0,
  ).getUTCDate();
  const projected = usage * daysInMonth;
  if (projected < monthly) return;

  const monthKey = dayKey.slice(0, 7);
  const tierKey = `${monthKey}:monthly`;
  if (state.alertedTiers.has(tierKey)) return;
  state.alertedTiers.add(tierKey);

  const summary =
    `Voyage monthly budget projection breach: ` +
    `projected $${projected.toFixed(2)} ≥ $${monthly.toFixed(2)} ` +
    `(today $${usage.toFixed(4)} × ${daysInMonth} days, month ${monthKey})`;
  try {
    Sentry.captureMessage(summary, {
      level: "warning",
      tags: {
        module: "ai-memory",
        op: "voyage_monthly_projection_alert",
        provider: "voyage",
        threshold: "monthly",
        error_signature: "voyage-monthly-budget-projection",
        day_key: dayKey,
        month_key: monthKey,
      },
      extra: {
        usage_usd: usage,
        projected_usd: projected,
        monthly_budget_usd: monthly,
        days_in_month: daysInMonth,
        day_key: dayKey,
        month_key: monthKey,
      },
    });
  } catch (err) {
    logger.warn({
      msg: "voyage_monthly_projection_sentry_capture_failed",
      err: { message: (err as Error)?.message ?? String(err) },
    });
  }
  logger.warn({
    msg: "voyage_monthly_projection_alert",
    day_key: dayKey,
    month_key: monthKey,
    usage_usd: usage,
    projected_usd: projected,
    monthly_budget_usd: monthly,
  });
}

/**
 * Post-record check: викликається з `recordVoyageUsage` після кожного
 * USD-інкременту, щоб hard alert (і monthly projection) fire-вся навіть
 * коли soft вимкнено або коли caller не йшов через `checkVoyageSoftBudget`.
 *
 * Idempotent: alert fire-иться ≤1 раз на (dayKey, tier) через `alertedTiers`.
 * Hard breach-flag stays raised до day-rollover-у.
 */
export function runVoyageBudgetTick(now: number = Date.now()): void {
  const dayKey = getVoyageUtcDayKey(now);
  const usage = getVoyageDailyUsageUsd(now);
  if (usage <= 0) return;

  // Soft alert тут не fire-имо, бо це шлях post-record для всіх викликів
  // (включно з critical) — `checkVoyageSoftBudget` лишається owner-ом
  // soft fire-логіки + non-critical skip-у. Тут тільки hard + monthly.
  maybeFireHardAlert(dayKey, usage);
  maybeFireMonthlyProjectionAlert(dayKey, usage, now);
}

/**
 * One-shot Sentry alert + structured log для конкретного tier-у
 * (`soft`/`hard`). Anti-spam через два ключі:
 *  - `alertedKeys` — keyed на actual threshold value (legacy from PR-38);
 *  - `alertedTiers` — keyed на tier-name (`soft`/`hard`), щоб флапаючий
 *    env-var не перетворив на спам.
 *
 * `error_signature` tag (`voyage-daily-budget-soft|hard`) гарантує, що
 * Sentry → n8n alert-routing → Telegram dedup-row дотягається до того ж
 * cooldown-вікна (analogous до WF-98 "workflowId:error_signature" pattern,
 * PR-15 #2535).
 */
function fireVoyageBudgetAlertOnce(input: {
  tier: "soft" | "hard";
  dayKey: string;
  usage: number;
  threshold: number;
}): void {
  const { tier, dayKey, usage, threshold } = input;
  const tierKey = `${dayKey}:${tier}`;
  const valueKey = `${dayKey}:${threshold}:${tier}`;
  if (state.alertedTiers.has(tierKey)) return;
  if (state.alertedKeys.has(valueKey)) return;
  state.alertedTiers.add(tierKey);
  state.alertedKeys.add(valueKey);

  const errorSignature =
    tier === "hard" ? "voyage-daily-budget-hard" : "voyage-daily-budget-soft";
  const summary =
    tier === "hard"
      ? `Voyage HARD daily budget exceeded ($${usage.toFixed(4)} ≥ $${threshold.toFixed(4)})`
      : `Voyage soft daily budget exceeded ($${usage.toFixed(4)} > $${threshold.toFixed(4)})`;
  try {
    Sentry.captureMessage(summary, {
      level: tier === "hard" ? "error" : "warning",
      tags: {
        module: "ai-memory",
        op:
          tier === "hard"
            ? "voyage_hard_budget_exceeded"
            : "voyage_soft_budget_exceeded",
        provider: "voyage",
        threshold: tier,
        error_signature: errorSignature,
        day_key: dayKey,
      },
      extra: {
        usage_usd: usage,
        threshold_usd: threshold,
        day_key: dayKey,
      },
    });
  } catch (err) {
    logger.warn({
      msg:
        tier === "hard"
          ? "voyage_hard_budget_sentry_capture_failed"
          : "voyage_soft_budget_sentry_capture_failed",
      err: { message: (err as Error)?.message ?? String(err) },
    });
  }
  logger.warn({
    msg:
      tier === "hard"
        ? "voyage_hard_budget_exceeded"
        : "voyage_soft_budget_exceeded",
    day_key: dayKey,
    usage_usd: usage,
    threshold_usd: threshold,
  });
}

/**
 * Test-only reset. НЕ викликати у production-code (state — module-singleton
 * by design). Експорт під `__`-prefix-ом — конвенція "private-export"
 * у решті кодбази (`__resetVoyageBudgetState` грепабельне з тестів).
 */
export function __resetVoyageBudgetState(): void {
  state.perDayUsage.clear();
  state.alertedKeys.clear();
  state.alertedTiers.clear();
  state.hardBreachedDayKey = null;
}
