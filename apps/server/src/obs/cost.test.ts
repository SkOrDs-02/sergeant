/**
 * PR-33 — обкладинка тестів cost-monitoring bootstrap-у:
 *
 *   1. `applyInfraMonthlyCosts()` пушить env-driven monthly USD у
 *      `infra_monthly_cost_usd` Gauge для виставлених provider-ів.
 *   2. Нульові / невиставлені env-vars НЕ пре-allocate-ять серії
 *      (gauge має не з'являтися у `/metrics` для skip-нутих провайдерів).
 *   3. `applyInfraMonthlyCosts()` idempotent (повторні виклики не
 *      ламають snapshot, перезаписують ту саму label-комбінацію).
 *
 * Фінальна перевірка через `register.metrics()`-payload — той самий
 * формат, який бачить Prometheus, тож тест ловить drift у label-set.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ENV_VARS = [
  "RAILWAY_MONTHLY_COST_USD",
  "RAILWAY_PLAN",
  "VERCEL_MONTHLY_COST_USD",
  "VERCEL_PLAN",
  "POSTHOG_MONTHLY_COST_USD",
  "POSTHOG_PLAN",
  "SENTRY_MONTHLY_COST_USD",
  "SENTRY_PLAN",
  "ANTHROPIC_MONTHLY_BUDGET_USD",
  "ANTHROPIC_PLAN",
  "VOYAGE_MONTHLY_BUDGET_USD",
  "VOYAGE_PLAN",
] as const;

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_VARS) savedEnv[k] = process.env[k];
  // Скидаємо всі — тести виставляють тільки потрібні.
  for (const k of ENV_VARS) delete process.env[k];
  // Reset module cache: env.ts зчитує process.env при load-і ОДИН раз;
  // cost.ts зчитує env.ts. Без resetModules() тести побачать перший
  // env-snapshot, не свій. Re-import-ить також metrics.js — інакше
  // gauge-инстанс у cost.js і `register` у тесті будуть з різних
  // module-instance-ів.
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_VARS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("applyInfraMonthlyCosts() — PR-33", () => {
  it("пушить виставлені env-vars у gauge з provider/plan лейблами", async () => {
    process.env["RAILWAY_MONTHLY_COST_USD"] = "20";
    process.env["RAILWAY_PLAN"] = "hobby";
    process.env["SENTRY_MONTHLY_COST_USD"] = "26";
    process.env["SENTRY_PLAN"] = "developer";
    process.env["ANTHROPIC_MONTHLY_BUDGET_USD"] = "200";
    process.env["ANTHROPIC_PLAN"] = "usage";

    const { applyInfraMonthlyCosts } = await import("./cost.js");
    const { register } = await import("./metrics.js");
    applyInfraMonthlyCosts();

    const text = await register.metrics();
    expect(text).toContain("# TYPE infra_monthly_cost_usd gauge");
    expect(text).toMatch(
      /infra_monthly_cost_usd\{provider="railway",plan="hobby"\} 20/,
    );
    expect(text).toMatch(
      /infra_monthly_cost_usd\{provider="sentry",plan="developer"\} 26/,
    );
    expect(text).toMatch(
      /infra_monthly_cost_usd\{provider="anthropic",plan="usage"\} 200/,
    );
  });

  it("НЕ пре-allocate серії для нульових / невиставлених env-vars", async () => {
    // Тільки railway. Vercel/PostHog/Sentry/Anthropic/Voyage — без env →
    // у metrics-payload ці лейбли не з'являються (PromQL-фільтр стає
    // тривіальним: `infra_monthly_cost_usd > 0` не потрібно).
    process.env["RAILWAY_MONTHLY_COST_USD"] = "20";
    process.env["RAILWAY_PLAN"] = "hobby";

    const { applyInfraMonthlyCosts } = await import("./cost.js");
    const { register } = await import("./metrics.js");
    applyInfraMonthlyCosts();

    const text = await register.metrics();
    // Витягуємо лиш `infra_monthly_cost_usd`-серії — інакше label
    // `provider="…"` може випадково матчитись з іншою метрикою (e.g.
    // `external_http_requests_total{upstream=...}`).
    const infraSeries = text
      .split("\n")
      .filter((l) => l.startsWith("infra_monthly_cost_usd{"))
      .join("\n");
    expect(infraSeries).toMatch(/provider="railway"/);
    expect(infraSeries).not.toMatch(/provider="vercel"/);
    expect(infraSeries).not.toMatch(/provider="posthog"/);
    expect(infraSeries).not.toMatch(/provider="sentry"/);
    expect(infraSeries).not.toMatch(/provider="anthropic"/);
    expect(infraSeries).not.toMatch(/provider="voyage"/);
  });

  it("idempotent: повторні виклики не дублюють серії", async () => {
    process.env["VOYAGE_MONTHLY_BUDGET_USD"] = "20";
    process.env["VOYAGE_PLAN"] = "usage";

    const { applyInfraMonthlyCosts } = await import("./cost.js");
    const { register } = await import("./metrics.js");
    applyInfraMonthlyCosts();
    applyInfraMonthlyCosts();
    applyInfraMonthlyCosts();

    const text = await register.metrics();
    // Лише одна серія для voyage — gauge.set перезаписує попереднє
    // значення на ту саму label-комбінацію.
    const matches =
      text.match(/infra_monthly_cost_usd\{provider="voyage"[^}]+\}/g) ?? [];
    expect(matches.length).toBe(1);
    expect(text).toMatch(
      /infra_monthly_cost_usd\{provider="voyage",plan="usage"\} 20/,
    );
  });

  it("приймає float-значення (20.50 USD не ламається на parseInt)", async () => {
    process.env["VERCEL_MONTHLY_COST_USD"] = "20.50";
    process.env["VERCEL_PLAN"] = "pro";

    const { applyInfraMonthlyCosts } = await import("./cost.js");
    const { register } = await import("./metrics.js");
    applyInfraMonthlyCosts();

    const text = await register.metrics();
    expect(text).toMatch(
      /infra_monthly_cost_usd\{provider="vercel",plan="pro"\} 20\.5/,
    );
  });

  it("ігнорує невалідне (non-numeric) env-значення", async () => {
    process.env["POSTHOG_MONTHLY_COST_USD"] = "not-a-number";
    process.env["POSTHOG_PLAN"] = "scale";

    const { applyInfraMonthlyCosts } = await import("./cost.js");
    const { register } = await import("./metrics.js");
    applyInfraMonthlyCosts();

    const text = await register.metrics();
    const infraSeries = text
      .split("\n")
      .filter((l) => l.startsWith("infra_monthly_cost_usd{"))
      .join("\n");
    // parseFloatEnv → NaN → fallback `0` → skip-нуто (>0 умова).
    expect(infraSeries).not.toMatch(/provider="posthog"/);
  });
});

describe("buildInfraCostConfig() — PR-33", () => {
  it("повертає 6 entries у фіксованому порядку (контракт для ordering у дашборді)", async () => {
    const { buildInfraCostConfig } = await import("./cost.js");
    const cfg = buildInfraCostConfig();
    expect(cfg.map((e) => e.provider)).toEqual([
      "railway",
      "vercel",
      "posthog",
      "sentry",
      "anthropic",
      "voyage",
    ]);
  });
});
