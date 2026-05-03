/**
 * Semantic Tailwind classes for monetary amounts and signed deltas.
 *
 * Sergeant's tone palette intentionally distinguishes two intents:
 *
 *  1. **Transaction amount** (income vs expense): income gets a positive
 *     accent, expense stays *neutral*. We don't want every spend to
 *     feel "alarming red" — most expenses are normal life events.
 *  2. **Signed delta** (balance, plan-vs-fact, savings): sign carries
 *     real meaning, so + → success, − → danger, 0 → muted.
 *
 * Use the helper that matches your *intent*, not just the value:
 *
 *   <span className={transactionAmountClass(tx.amount)}>{fmt(tx.amount)}</span>
 *   <span className={signedDeltaClass(plan - fact)}>{fmtSigned(...)}</span>
 *
 * Both helpers return tokens from `packages/design-tokens` (`success`,
 * `danger`, `text`, `muted`) — never raw `text-emerald-XXX` /
 * `text-red-XXX`. The semantic tokens already encode dark-mode
 * contrast tuning via CSS variables, and they participate in the
 * WCAG-AA `-strong` companion scheme (see AGENTS.md hard rule #9).
 *
 * If you find yourself reaching for `text-emerald-` / `text-green-` /
 * `text-red-` to colour an amount, that's a code smell — use these
 * helpers (or `text-success-strong` / `text-danger` directly).
 */

/**
 * Класи для signed delta — баланс, дельта плану/факту, дельта ваги,
 * ROI, savings rate, тощо. + → success, − → danger, 0 → muted.
 */
export function signedDeltaClass(value: number): string {
  if (value > 0) return "text-success-strong dark:text-success";
  if (value < 0) return "text-danger";
  return "text-muted";
}

/**
 * Класи для суми транзакції за Sergeant-філософією: income (+)
 * виділяємо успіх-токеном, expense (−) лишаємо нейтральним
 * `text-text`, бо "кожна витрата = тривога" — це anti-pattern.
 *
 * Якщо хочеш виділити over-budget transaction — обгортай у `cn()`
 * з `signedDeltaClass`-логікою, не міняй цей хелпер.
 */
export function transactionAmountClass(amount: number): string {
  return amount > 0 ? "text-success-strong dark:text-success" : "text-text";
}
