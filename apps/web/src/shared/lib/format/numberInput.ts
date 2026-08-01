/**
 * Last validated: 2026-08-01
 * Status: Active
 *
 * Clamp for free-form numeric inputs that write straight into storage.
 *
 * Without it `Number(e.target.value)` lets `Infinity`, `NaN` and a pasted
 * 20-digit number reach the store, the sync outbox and every downstream
 * aggregate. Callers own the ceiling — it is domain knowledge (a 1000 kg
 * lift, a 10 000 000 ₴ plan), not something this helper can guess.
 */

export function clampNumericInput(raw: string, max: number): number {
  if (raw === "") return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 0;
  return value > max ? max : value;
}
