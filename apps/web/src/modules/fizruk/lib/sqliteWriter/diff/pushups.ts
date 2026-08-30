/**
 * Pushup-лічильник — перенос власності routine → fizruk (канон
 * `routine.md` §10, рішення founder-а 2026-08-30).
 *
 * Мапа `dateKey → reps` (device-local `YYYY-MM-DD`, ADR-0078) диффиться
 * по ключах — той самий підхід, що й `nutrition_water_log`
 * (`modules/nutrition/lib/sqliteWriter/diff.ts`). Видалення рядка немає:
 * обнулення дня = `reps: 0` (сервер `applyFizrukPushups` так само
 * відхиляє `op='delete'`).
 */

export interface PushupSetOp {
  readonly kind: "pushup-set";
  readonly dateKey: string;
  readonly reps: number;
}

export function diffPushupOps(
  prev: Readonly<Record<string, number>> | undefined,
  next: Readonly<Record<string, number>> | undefined,
): PushupSetOp[] {
  const prevMap = prev ?? {};
  const nextMap = next ?? {};
  if (prevMap === nextMap) return [];
  const ops: PushupSetOp[] = [];
  const allKeys = new Set([...Object.keys(prevMap), ...Object.keys(nextMap)]);
  for (const dateKey of allKeys) {
    const prevVal = prevMap[dateKey] ?? 0;
    const nextVal = nextMap[dateKey] ?? 0;
    if (prevVal === nextVal) continue;
    ops.push({ kind: "pushup-set", dateKey, reps: nextVal });
  }
  ops.sort((a, b) =>
    a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0,
  );
  return ops;
}
