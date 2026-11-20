/**
 * Нормалізація полів лічильника й автовідмітки звички (міграція 170,
 * Р-1 (а) і (в)). Окремий файл без залежностей від редʼюсерів, бо його
 * кличе `normalizeHabit` (`storage.ts`), а `counterHabit.ts` сам імпортує
 * редʼюсери.
 *
 * Звичка без лічильника й автовідмітки лишається без цих ключів зовсім, а
 * не з `null`: інакше кожна наявна звичка змінила б форму після читання.
 */

import { AUTO_MARK_SOURCES, type AutoMarkSource, type Habit } from "./types.js";

export function isAutoMarkSource(v: unknown): v is AutoMarkSource {
  return (
    typeof v === "string" &&
    (AUTO_MARK_SOURCES as readonly string[]).includes(v)
  );
}

/** Ціль лічильника звички або `null`, якщо звичка «так/ні». */
export function habitCountTarget(
  h: Pick<Habit, "countTarget"> | null | undefined,
): number | null {
  const t = h?.countTarget;
  return typeof t === "number" && Number.isInteger(t) && t >= 1 ? t : null;
}

export function normalizeHabitCounterFields(h: Habit): Habit {
  const out: Habit = { ...h };
  const target = habitCountTarget(h);
  if (target === null) {
    delete out.countTarget;
    delete out.countUnit;
  } else {
    out.countTarget = target;
    const unit = typeof h.countUnit === "string" ? h.countUnit.trim() : "";
    if (unit) out.countUnit = unit;
    else delete out.countUnit;
  }
  if (isAutoMarkSource(h.autoMarkSource)) out.autoMarkSource = h.autoMarkSource;
  else delete out.autoMarkSource;
  return out;
}

/** `habitId → dateKey → ціле ≥ 1`; нулі й сміття відкидаються. */
export function normalizeHabitCounts(
  raw: unknown,
): Record<string, Record<string, number>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, Record<string, number>> = {};
  for (const [habitId, days] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    if (!days || typeof days !== "object" || Array.isArray(days)) continue;
    const clean: Record<string, number> = {};
    for (const [dk, n] of Object.entries(days as Record<string, unknown>)) {
      if (typeof n === "number" && Number.isInteger(n) && n > 0) clean[dk] = n;
    }
    if (Object.keys(clean).length > 0) out[habitId] = clean;
  }
  return out;
}
