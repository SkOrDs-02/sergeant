/**
 * Active-workout singleton diff for the Fizruk dual-write layer
 * (Stage 12.5 / PR #070f3-active-workout-dualwrite). Per-shape
 * module-folder split from the monolithic `diff.ts` — see
 * `docs/audits/2026-05-13-mobile-reliability-ux-roast.md` § P2.2a.
 *
 * Unlike the previous nine entity classes, the active-workout id
 * does NOT have a dedicated `fizruk_*` table: it is a single string
 * slot persisted into the shared Stage 9 `kv_store` table under
 * key `fizruk_active_workout_id_v1`. The op shape mirrors the
 * `programs-set` singleton pattern. `null` on `next` ≡ "hook didn't
 * include this tick" → cold-cache no-op; the hook explicitly emits
 * a snapshot with `activeWorkoutId = null` when clearing the slot.
 */

export interface FizrukActiveWorkoutSnapshot {
  readonly activeWorkoutId: string | null;
}

export interface ActiveWorkoutSetOp {
  readonly kind: "active-workout-set";
  readonly activeWorkout: FizrukActiveWorkoutSnapshot;
}

export type ActiveWorkoutOp = ActiveWorkoutSetOp;

export function diffActiveWorkoutOps(
  prev: FizrukActiveWorkoutSnapshot | null | undefined,
  next: FizrukActiveWorkoutSnapshot | null | undefined,
): ActiveWorkoutOp[] {
  const prevActive = prev ?? null;
  const nextActive = next ?? null;
  if (nextActive === null) return [];
  if (prevActive && prevActive.activeWorkoutId === nextActive.activeWorkoutId) {
    return [];
  }
  return [{ kind: "active-workout-set", activeWorkout: nextActive }];
}
