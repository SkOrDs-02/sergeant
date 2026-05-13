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
  /** Set<"YYYY-MM-DD:threshold"> — anti-spam flag для Sentry alert-у. */
  alertedKeys: Set<string>;
}

/**
 * Module-level singleton state. Експорт-имо `__resetVoyageBudgetState` для
 * тестів — production-code НЕ повинен його викликати.
 */
const state: BudgetState = {
  perDayUsage: new Map(),
  alertedKeys: new Set(),
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

  // Anti-spam — одна Sentry-капча на (dayKey, threshold).
  const alertKey = `${dayKey}:${threshold}`;
  if (!state.alertedKeys.has(alertKey)) {
    state.alertedKeys.add(alertKey);
    try {
      Sentry.captureMessage(
        `Voyage soft daily budget exceeded ($${usage.toFixed(4)} > $${threshold.toFixed(4)})`,
        {
          level: "warning",
          tags: {
            module: "ai-memory",
            op: "voyage_soft_budget_exceeded",
            day_key: dayKey,
          },
          extra: {
            usage_usd: usage,
            threshold_usd: threshold,
            day_key: dayKey,
          },
        },
      );
    } catch (err) {
      // Sentry-капча не повинна ламати embedding-flow. Логуємо і їдемо далі.
      logger.warn({
        msg: "voyage_soft_budget_sentry_capture_failed",
        err: { message: (err as Error)?.message ?? String(err) },
      });
    }
    logger.warn({
      msg: "voyage_soft_budget_exceeded",
      day_key: dayKey,
      usage_usd: usage,
      threshold_usd: threshold,
    });
  }

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
 * Test-only reset. НЕ викликати у production-code (state — module-singleton
 * by design). Експорт під `__`-prefix-ом — конвенція "private-export"
 * у решті кодбази (`__resetVoyageBudgetState` грепабельне з тестів).
 */
export function __resetVoyageBudgetState(): void {
  state.perDayUsage.clear();
  state.alertedKeys.clear();
}
