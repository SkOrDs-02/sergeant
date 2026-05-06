/**
 * PR-33 — Cost monitoring dashboard initialization.
 *
 * `applyInfraMonthlyCosts()` пушить env-driven monthly USD-cost-и у
 * `infra_monthly_cost_usd` Gauge, щоб Grafana мав статичну референс-
 * лінію поверх runtime-cost-метрик (Anthropic / Voyage `ai_cost_estimate_usd_total`).
 *
 * Викликається ОДИН раз під час bootstrap-у сервера; permission-моделі не
 * має — gauge вже зареєстрований у `obs/metrics.ts`. Якщо env-vars не задані
 * (default `0`) — серія НЕ зʼявляється у `/metrics`, бо Prometheus
 * gauge-init-у з нулями не робить (`gauge.set` не викликається).
 *
 * Чому окремий файл, а не inline у `metrics.ts`: `metrics.ts` загружається
 * через side-effect-import у тестах і CLI-скриптах; pushити env-залежні
 * значення там — порушити idempotency. Bootstrap-фаза — явний контракт.
 */

import { env } from "../env.js";
import { logger } from "./logger.js";
import { infraMonthlyCostUsd } from "./metrics.js";

/**
 * Один запис у конфігу: provider + plan label + USD-cost з env.
 * Tuple за зразком (a) `[provider, plan, usdMonth]` менш читабельний,
 * (b) обʼєктний літерал — ясніший для readability + JSDoc-у.
 */
interface InfraCostEntry {
  provider:
    | "railway"
    | "vercel"
    | "posthog"
    | "sentry"
    | "anthropic"
    | "voyage";
  plan: string;
  usdMonth: number;
}

/**
 * Build static config з поточних env-snapshot. Викликається лиш раз
 * (env-vars зчитані через `env.ts`-модуль; зміни на runtime не
 * фіксуються — для зміни plan-у потрібен рестарт). Експортуємо
 * сепарато від `applyInfraMonthlyCosts` щоб тести могли переконатися
 * у формі без mocking-у Gauge.
 */
export function buildInfraCostConfig(): InfraCostEntry[] {
  return [
    {
      provider: "railway",
      plan: env.RAILWAY_PLAN,
      usdMonth: env.RAILWAY_MONTHLY_COST_USD,
    },
    {
      provider: "vercel",
      plan: env.VERCEL_PLAN,
      usdMonth: env.VERCEL_MONTHLY_COST_USD,
    },
    {
      provider: "posthog",
      plan: env.POSTHOG_PLAN,
      usdMonth: env.POSTHOG_MONTHLY_COST_USD,
    },
    {
      provider: "sentry",
      plan: env.SENTRY_PLAN,
      usdMonth: env.SENTRY_MONTHLY_COST_USD,
    },
    {
      provider: "anthropic",
      plan: env.ANTHROPIC_PLAN,
      usdMonth: env.ANTHROPIC_MONTHLY_BUDGET_USD,
    },
    {
      provider: "voyage",
      plan: env.VOYAGE_PLAN,
      usdMonth: env.VOYAGE_MONTHLY_BUDGET_USD,
    },
  ];
}

/**
 * Idempotent — викликати кілька разів безпечно (gauge.set перезаписує
 * попереднє значення на ту саму label-комбінацію). 0/NaN-значення —
 * skip-имо (порожня серія краща за фейкі-нуль).
 *
 * Записати у логи перелік виставлених рядків — operations team побачить,
 * що cost monitoring увімкнений ще до першого AI-запиту.
 */
export function applyInfraMonthlyCosts(): void {
  const entries = buildInfraCostConfig();
  const reported: Array<{ provider: string; plan: string; usdMonth: number }> =
    [];
  for (const entry of entries) {
    if (!Number.isFinite(entry.usdMonth) || entry.usdMonth <= 0) continue;
    try {
      infraMonthlyCostUsd
        .labels({ provider: entry.provider, plan: entry.plan })
        .set(entry.usdMonth);
      reported.push({
        provider: entry.provider,
        plan: entry.plan,
        usdMonth: entry.usdMonth,
      });
    } catch (err) {
      logger.warn({
        msg: "infra_monthly_cost_set_failed",
        provider: entry.provider,
        plan: entry.plan,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (reported.length > 0) {
    logger.info({
      msg: "infra_monthly_cost_applied",
      count: reported.length,
      total_usd: reported.reduce((acc, r) => acc + r.usdMonth, 0),
      providers: reported.map((r) => r.provider),
    });
  }
}
