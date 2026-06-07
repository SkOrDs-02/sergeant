/**
 * Generic per-id diff helper shared by every list-shaped Fizruk
 * dual-write diff (workouts, custom exercises, measurements,
 * daily-log entries, workout templates).
 *
 * Extracted from the monolithic `diff.ts` during decomposition.
 * Behaviour is byte-for-byte equivalent to the inlined helper: ids
 * are sorted alphabetically before invoking the callbacks so the
 * emitted op order stays deterministic.
 */

export function diffArray<T extends { readonly id: string }>(
  prev: readonly T[],
  next: readonly T[],
  getId: (item: T) => string,
  hasChanged: (prev: T, next: T) => boolean,
  onUpsert: (item: T) => void,
  onDelete: (id: string) => void,
): void {
  const prevMap = new Map<string, T>();
  for (const item of prev) prevMap.set(getId(item), item);

  const nextMap = new Map<string, T>();
  for (const item of next) nextMap.set(getId(item), item);

  const sortedNextIds = [...nextMap.keys()].sort();
  for (const id of sortedNextIds) {
    const nextItem = nextMap.get(id)!;
    const prevItem = prevMap.get(id);
    if (!prevItem) {
      onUpsert(nextItem);
    } else if (prevItem !== nextItem && hasChanged(prevItem, nextItem)) {
      onUpsert(nextItem);
    }
  }

  const sortedPrevIds = [...prevMap.keys()].sort();
  for (const id of sortedPrevIds) {
    if (!nextMap.has(id)) {
      onDelete(id);
    }
  }
}
