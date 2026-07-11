/**
 * Pure aggregator for the Fizruk Dashboard "Top PRs" section.
 *
 * Scans completed workouts' strength sets and, for each unique
 * `exerciseId`, computes the best Epley-estimated 1RM
 * (`weight * (1 + reps / 30)`). Returns the top `limit` entries
 * sorted descending by 1RM.
 *
 * The resolver also surfaces the weight / reps that produced the PR
 * and the ISO timestamp of the workout — enough for the UI to render
 * "Присід · 120 × 5 · 20 кві".
 */

import { epley1rm } from "../../lib/workoutStats.js";
import type { DashboardPRItem, DashboardWorkoutInput } from "./types.js";

/** Default top-N rendered on the dashboard. */
export const DEFAULT_TOP_PRS_LIMIT = 3;

function toFiniteNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

interface Candidate {
  exerciseId: string;
  nameUk: string | null;
  oneRmKg: number;
  weightKg: number;
  reps: number;
  atIso: string | null;
}

export interface ComputeTopPRsOptions {
  readonly limit?: number;
}

/**
 * Top-N strength PRs across all completed workouts. Ties are broken
 * by the more recent `endedAt` (later wins).
 */
export function computeTopPRs(
  workouts: readonly DashboardWorkoutInput[] | null | undefined,
  options: ComputeTopPRsOptions = {},
): DashboardPRItem[] {
  const { limit = DEFAULT_TOP_PRS_LIMIT } = options;
  const list = Array.isArray(workouts) ? workouts : [];
  if (list.length === 0 || limit <= 0) return [];

  const best = new Map<string, Candidate>();

  for (const w of list) {
    if (!w || typeof w.endedAt !== "string" || !w.endedAt) continue;
    const items = w.items ?? [];
    for (const item of items) {
      if (item?.type !== "strength") continue;
      const exerciseId =
        typeof item?.exerciseId === "string" ? item.exerciseId : "";
      if (!exerciseId) continue;
      const nameUk =
        typeof (item as { nameUk?: unknown }).nameUk === "string"
          ? (item as { nameUk: string }).nameUk
          : null;
      const sets = item.sets ?? [];
      for (const s of sets) {
        const weight = toFiniteNumber(s?.weightKg);
        const reps = toFiniteNumber(s?.reps);
        if (weight == null || reps == null) continue;
        const one = epley1rm(weight, reps);
        if (one <= 0) continue;

        const prev = best.get(exerciseId);
        const prevMs = prev?.atIso ? Date.parse(prev.atIso) : -Infinity;
        const nowMs = Date.parse(w.endedAt);
        const isBetter =
          !prev ||
          one > prev.oneRmKg ||
          (one === prev.oneRmKg && Number.isFinite(nowMs) && nowMs > prevMs);
        if (!isBetter) continue;

        best.set(exerciseId, {
          exerciseId,
          nameUk,
          oneRmKg: one,
          weightKg: weight,
          reps,
          atIso: w.endedAt,
        });
      }
    }
  }

  return [...best.values()]
    .sort((a, b) => {
      if (a.oneRmKg !== b.oneRmKg) return b.oneRmKg - a.oneRmKg;
      const aMs = a.atIso ? Date.parse(a.atIso) : 0;
      const bMs = b.atIso ? Date.parse(b.atIso) : 0;
      return bMs - aMs;
    })
    .slice(0, Math.max(0, limit))
    .map((c) => ({
      exerciseId: c.exerciseId,
      nameUk: c.nameUk,
      oneRmKg: Math.round(c.oneRmKg * 10) / 10,
      weightKg: c.weightKg,
      reps: c.reps,
      atIso: c.atIso,
    }));
}
