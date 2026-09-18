/**
 * PR-38 — error class для soft-budget skip-у. Виокремлено у власний
 * файл (а не біля `embeddings.ts` чи `voyageBudget.ts`), щоб
 * `service.ts` міг ловити `instanceof VoyageSoftBudgetExceededError` без
 * затягування runtime-side-effects з `embeddings.ts`
 * (`circuitBreaker.ts:244` читає `env.AI_CIRCUIT_BREAKER_THRESHOLD` на
 * module-load — це breaks `connection.test.ts`-style env-proxy-mock-и,
 * де `const mockEnv` ще TDZ-нутий під час hoisted imports).
 *
 * Файл свідомо без imports — нульова cost для test-mock-у.
 */
export class VoyageSoftBudgetExceededError extends Error {
  readonly code = "VOYAGE_SOFT_BUDGET_EXCEEDED";
  readonly usage: number;
  readonly threshold: number;
  readonly dayKey: string;
  constructor(opts: { usage: number; threshold: number; dayKey: string }) {
    super(
      `Voyage soft daily budget exceeded ($${opts.usage.toFixed(4)} > $${opts.threshold.toFixed(4)}) for ${opts.dayKey}; skipping non-critical embedding.`,
    );
    this.name = "VoyageSoftBudgetExceededError";
    this.usage = opts.usage;
    this.threshold = opts.threshold;
    this.dayKey = opts.dayKey;
  }
}
