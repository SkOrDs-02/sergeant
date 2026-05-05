/**
 * Load / normalise / serialise helpers for `MonthlyPlanState`.
 *
 * Pure — no `localStorage`, no MMKV, no `window`. Apps hand us whatever
 * `JSON.parse(raw)` produced (or `null` on a fresh install) and we
 * return a safe `MonthlyPlanState`.
 */

import type { MonthlyPlanDay, MonthlyPlanState } from "./types.js";

const DEFAULT_HOUR = 18;
const DEFAULT_MINUTE = 0;

/** Blank plan state for a fresh install. */
export function defaultMonthlyPlanState(): MonthlyPlanState {
  return {
    reminderEnabled: true,
    reminderHour: DEFAULT_HOUR,
    reminderMinute: DEFAULT_MINUTE,
    days: {},
  };
}

function clampHour(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : DEFAULT_HOUR;
  return Math.max(0, Math.min(23, Math.trunc(n)));
}

function clampMinute(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : DEFAULT_MINUTE;
  return Math.max(0, Math.min(59, Math.trunc(n)));
}

function normalizeDays(raw: unknown): Record<string, MonthlyPlanDay> {
  if (!raw || typeof raw !== "object") return {};
  const src = raw as Record<string, unknown>;
  const out: Record<string, MonthlyPlanDay> = {};
  for (const key of Object.keys(src)) {
    const entry = src[key];
    if (!entry || typeof entry !== "object") continue;
    const templateId = (entry as { templateId?: unknown }).templateId;
    if (typeof templateId !== "string" || templateId === "") continue;
    out[key] = { templateId };
  }
  return out;
}

/**
 * Normalise arbitrary JSON (parsed MMKV/localStorage payload) into a
 * `MonthlyPlanState`. Missing / malformed fields fall back to defaults;
 * unknown extras are dropped. Idempotent — `normalizeMonthlyPlanState`
 * applied twice yields the same value as once.
 */
export function normalizeMonthlyPlanState(raw: unknown): MonthlyPlanState {
  if (!raw || typeof raw !== "object") return defaultMonthlyPlanState();
  const src = raw as Record<string, unknown>;
  return {
    reminderEnabled: src["reminderEnabled"] !== false,
    reminderHour: clampHour(src["reminderHour"]),
    reminderMinute: clampMinute(src["reminderMinute"]),
    days: normalizeDays(src["days"]),
  };
}

/** JSON-serialise a `MonthlyPlanState` for persistence. */
export function serializeMonthlyPlanState(state: MonthlyPlanState): string {
  return JSON.stringify(state);
}
