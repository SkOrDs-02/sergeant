/**
 * Canonical list of Fizruk measurement fields available on the mobile
 * port. Ordering drives the form and "latest values" UI.
 *
 * Scope note: the web `MEASURE_FIELDS` list in
 * `apps/web/src/modules/fizruk/hooks/useMeasurements.ts` is wider
 * (separate left/right biceps, forearm, thigh, calf, neck, body-fat).
 * Phase 6 deliberately trims the mobile set to the high-signal fields
 * listed in the migration plan: core weight + top body-part
 * circumferences + wellbeing scores. New fields can be added here
 * without touching the screens (the form + list iterate this array).
 */

import { MEASUREMENT_BOUNDS } from "@sergeant/shared";

import type { MeasurementFieldDef, MeasurementFieldId } from "./types.js";

/**
 * Межі (`min` / `max` / `integer`) НЕ живуть тут — вони приходять з
 * канонічного реєстру `MEASUREMENT_BOUNDS` у `@sergeant/shared`, який
 * той самий сервер використовує для санітарної перевірки sync-апплаєра
 * (`applyMisc.ts`). Тут лишається лише презентаційна частина — порядок,
 * український label і одиниця. Правиш діапазон — прав у shared, інакше
 * клієнт і сервер розійдуться (рішення власника 2026-08-25).
 */
export const MEASUREMENT_FIELDS: readonly MeasurementFieldDef[] = [
  { id: "weightKg", label: "Вага", unit: "кг", ...MEASUREMENT_BOUNDS.weightKg },
  { id: "waistCm", label: "Талія", unit: "см", ...MEASUREMENT_BOUNDS.waistCm },
  { id: "chestCm", label: "Груди", unit: "см", ...MEASUREMENT_BOUNDS.chestCm },
  { id: "hipsCm", label: "Стегна", unit: "см", ...MEASUREMENT_BOUNDS.hipsCm },
  { id: "bicepCm", label: "Біцепс", unit: "см", ...MEASUREMENT_BOUNDS.bicepCm },
  {
    id: "sleepHours",
    label: "Сон",
    unit: "год",
    ...MEASUREMENT_BOUNDS.sleepHours,
  },
  {
    id: "energyLevel",
    label: "Енергія",
    unit: "/5",
    ...MEASUREMENT_BOUNDS.energyLevel,
  },
  { id: "mood", label: "Настрій", unit: "/5", ...MEASUREMENT_BOUNDS.mood },
] as const;

/** Convenience: just the ids, in declaration order. */
export const MEASUREMENT_FIELD_IDS: readonly MeasurementFieldId[] =
  MEASUREMENT_FIELDS.map((f) => f.id);

/** O(1) lookup helper for callers that only have an id in hand. */
export function getMeasurementFieldDef(
  id: MeasurementFieldId,
): MeasurementFieldDef {
  const def = MEASUREMENT_FIELDS.find((f) => f.id === id);
  if (!def) {
    throw new Error(`Unknown measurement field id: ${String(id)}`);
  }
  return def;
}
