/** Стабільне сортування звичок за збереженим порядком */

import type { Habit } from "./types.js";

/**
 * Reconcile a candidate order against the current active-habit set:
 * keep only active, de-duplicated ids from `candidateOrder` (in their
 * relative order), then append any active id missing from it.
 */
export function reconcileHabitOrder(
  active: readonly string[],
  candidateOrder: readonly string[],
): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const id of candidateOrder) {
    if (active.includes(id) && !seen.has(id)) {
      order.push(id);
      seen.add(id);
    }
  }
  for (const id of active) {
    if (!seen.has(id)) order.push(id);
  }
  return order;
}

export function sortHabitsByOrder<T extends Habit = Habit>(
  habits: T[],
  order: string[] | null | undefined,
): T[] {
  const idx = new Map<string, number>(
    (order || []).map((id, i) => [id, i] as const),
  );
  return [...habits].sort((a, b) => {
    const ia = idx.has(a.id) ? (idx.get(a.id) as number) : 99999;
    const ib = idx.has(b.id) ? (idx.get(b.id) as number) : 99999;
    if (ia !== ib) return ia - ib;
    return (a.name || "").localeCompare(b.name || "", "uk");
  });
}
