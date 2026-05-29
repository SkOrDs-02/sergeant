/**
 * Mobile port of `apps/web/src/core/onboarding/presetApply.ts`.
 *
 * The FTUX PresetSheet turns "tap a tile" into a real (non-demo) entry
 * without forcing the user into a module's full input flow. On web each
 * `apply*Preset` writer pokes the module's localStorage key directly
 * (the module reads the same key, and the direct write skips a debounce
 * window so the entry is visible on the next Hub render).
 *
 * On mobile only `routine` writes directly — a habit is just «name +
 * ✓», there is no metric to fabricate (mirrors web, where routine is
 * the only preset that persists immediately). The other modules
 * (`finyk` / `nutrition` / `fizruk`) navigate into their add-sheet with
 * a `presetPrefill` instead of writing here, so we expose only the
 * `routine` writer plus the shared `ModuleId` / `ModulePreset` surface.
 *
 * The routine write reuses the module's own SQLite-backed store
 * (`applyCreateHabit` reducer + `saveRoutineState` dual-write trigger)
 * rather than poking storage by hand: mobile routine state moved from
 * MMKV to the SQLite cache (Stage 8), so a hand-written MMKV blob would
 * never reach the module. `saveRoutineState` updates the warm cache
 * synchronously, so the habit is visible on the next routine render —
 * the same "instantly real" guarantee the web direct write provides.
 */

import { applyCreateHabit } from "@sergeant/routine-domain";

import {
  loadRoutineState,
  saveRoutineState,
} from "@/modules/routine/lib/routineStore";

export type RoutinePreset = {
  name: string;
  emoji?: string;
};

export type FinykPreset = {
  description: string;
  category: string;
};

export type ModuleId = "routine" | "finyk" | "nutrition" | "fizruk";

export type ModulePreset = RoutinePreset | FinykPreset | Record<string, unknown>;

function applyRoutinePreset(preset: RoutinePreset): void {
  const next = applyCreateHabit(loadRoutineState(), {
    name: preset.name,
    emoji: preset.emoji || "✓",
  });
  saveRoutineState(next);
}

/**
 * Apply a preset to the matching module storage. Only `routine` writes
 * directly on mobile; every other module navigates into its add-sheet
 * with a `presetPrefill` (see `PresetStep`), so this is intentionally a
 * no-op for them.
 */
export function applyPreset(moduleId: ModuleId, preset: ModulePreset): void {
  if (moduleId === "routine") {
    applyRoutinePreset(preset as RoutinePreset);
  }
}
