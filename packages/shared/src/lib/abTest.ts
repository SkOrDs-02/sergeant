/**
 * Lightweight A/B testing — DOM-free, shared logic.
 *
 * Provides deterministic variant assignment based on a stable user
 * fingerprint. Assignments are persisted in KVStore so the same user
 * always sees the same variant. The module is decoupled from analytics
 * — callers emit tracking events via the `onExposure` callback.
 *
 * Usage:
 *   const variant = assignVariant(store, "soft_auth_timing", ["control", "day3", "day5"]);
 *   if (variant === "day3") { ... }
 */

import { readJSON, writeJSON, type KVStore } from "../storage/kv";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExperimentDefinition {
  /** Unique experiment id (snake_case). */
  id: string;
  /** Variant names, first is control. */
  variants: readonly string[];
  /** Optional weights (must sum to 1). Defaults to uniform distribution. */
  weights?: readonly number[];
}

interface AssignmentMap {
  [experimentId: string]: string;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const ASSIGNMENTS_KEY = "hub_ab_assignments_v1";
const FINGERPRINT_KEY = "hub_ab_fingerprint_v1";

function getAssignments(store: KVStore): AssignmentMap {
  return readJSON<AssignmentMap>(store, ASSIGNMENTS_KEY) ?? {};
}

function saveAssignments(store: KVStore, map: AssignmentMap): void {
  writeJSON(store, ASSIGNMENTS_KEY, map);
}

// ---------------------------------------------------------------------------
// Fingerprint — stable per-device random seed
// ---------------------------------------------------------------------------

function getOrCreateFingerprint(store: KVStore): string {
  const existing = store.getString(FINGERPRINT_KEY);
  if (existing) return existing;
  const fp = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  store.setString(FINGERPRINT_KEY, fp);
  return fp;
}

/** Simple string → 0..1 hash for deterministic bucketing. */
function hashToFraction(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash % 10000) / 10000;
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

/**
 * Assign (or retrieve existing) variant for an experiment.
 * Assignment is deterministic: same fingerprint + experimentId → same variant.
 * Once assigned, the variant is persisted and never changes.
 */
export function assignVariant(
  store: KVStore,
  experiment: ExperimentDefinition,
): string {
  const assignments = getAssignments(store);

  const existing = assignments[experiment.id];
  if (existing && experiment.variants.includes(existing)) {
    return existing;
  }

  const fp = getOrCreateFingerprint(store);
  const fraction = hashToFraction(fp + ":" + experiment.id);
  const weights =
    experiment.weights ??
    experiment.variants.map(() => 1 / experiment.variants.length);

  let cumulative = 0;
  // Fallback to the first variant; experiments are required to declare ≥1.
  let chosen = experiment.variants[0] ?? "control";
  for (let i = 0; i < experiment.variants.length; i++) {
    cumulative += weights[i] ?? 0;
    if (fraction < cumulative) {
      chosen = experiment.variants[i] ?? chosen;
      break;
    }
  }

  assignments[experiment.id] = chosen;
  saveAssignments(store, assignments);
  return chosen;
}

/**
 * Get current variant without creating an assignment.
 * Returns null if the user hasn't been assigned yet.
 */
export function getVariant(
  store: KVStore,
  experimentId: string,
): string | null {
  const assignments = getAssignments(store);
  return assignments[experimentId] ?? null;
}

/**
 * Get all active experiment assignments.
 */
export function getAllAssignments(store: KVStore): Readonly<AssignmentMap> {
  return getAssignments(store);
}

/**
 * Force a specific variant for an experiment (useful for QA / Settings UI).
 */
export function overrideVariant(
  store: KVStore,
  experimentId: string,
  variant: string,
): void {
  const assignments = getAssignments(store);
  assignments[experimentId] = variant;
  saveAssignments(store, assignments);
}

/**
 * Reset all experiment assignments. Useful for "restart onboarding".
 */
export function resetAllAssignments(store: KVStore): void {
  store.remove(ASSIGNMENTS_KEY);
}
