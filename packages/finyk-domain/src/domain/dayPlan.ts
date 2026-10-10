/** Canonical day plan at the start of the Kyiv day (ADR-0079).
 * Inputs and result are minor units. Today's spending is deducted only by
 * the caller when displaying the amount still available today.
 * Owner decision 2026-10-09: reserve scheduled outflows, add inflows,
 * preserve fractional results and deficits; no floor or zero clamp.
 */
export function calculateFinykDayPlan({
  planExpenseMinor,
  spentBeforeTodayMinor,
  recurringOutMinor,
  recurringInMinor,
  remainingDays,
}: {
  planExpenseMinor: number;
  spentBeforeTodayMinor: number;
  recurringOutMinor: number;
  recurringInMinor: number;
  remainingDays: number;
}): number | null {
  if (planExpenseMinor <= 0) return null;
  return (
    (planExpenseMinor -
      spentBeforeTodayMinor -
      recurringOutMinor +
      recurringInMinor) /
    Math.max(1, remainingDays)
  );
}
