/**
 * Load / normalise helpers for the persisted
 * {@link ActiveProgramState}.
 *
 * Pure — no `localStorage`, no MMKV, no `window`. Apps hand in whatever
 * `JSON.parse(raw)` produced (or `null` on a fresh install) and we
 * return a safe state, ready to consume.
 */

import type { ActiveProgramState } from "./types.js";

/** Blank state for a fresh install (no program activated yet). */
export function defaultActiveProgramState(): ActiveProgramState {
  return { activeProgramId: null };
}

/**
 * Normalise arbitrary JSON (parsed MMKV / localStorage payload) into
 * an {@link ActiveProgramState}.
 *
 * Accepted shapes:
 *  - `null` / `undefined` → default state.
 *  - A plain string id (legacy web format, stored directly under
 *    `fizruk_active_program_id_v1` without JSON wrapping).
 *  - An object with `{ activeProgramId: string | null }`.
 *
 * Unknown or malformed input returns the default — callers can always
 * trust the result.
 */
export function normalizeActiveProgramState(raw: unknown): ActiveProgramState {
  if (raw == null) return defaultActiveProgramState();
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return {
      activeProgramId: trimmed.length > 0 ? trimmed : null,
    };
  }
  if (typeof raw === "object") {
    const src = raw as Record<string, unknown>;
    const id = src["activeProgramId"];
    if (typeof id === "string" && id !== "") {
      return { activeProgramId: id };
    }
  }
  return defaultActiveProgramState();
}
