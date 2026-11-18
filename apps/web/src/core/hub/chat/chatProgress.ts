import { getToolProgressLabel } from "@sergeant/shared";

/**
 * Підпис, коли один хід виконує різні інструменти. Чесно називає, що
 * відбувається, і не вдає, ніби йде лише перший із них: sync-виконавці
 * батча проходять за один тік, тож покроково їх однаково не видно.
 */
export const MULTI_TOOL_STEP_LABEL = "Виконую кілька дій";

/**
 * Крок для бульбашки очікування чату (С-1 (б), рішення власника 2026-11-18):
 * що Сержант робить, поки клієнт виконує інструменти першого ходу. Підпис
 * береться з каталогу асистента (`progressLabel`), другого словника немає.
 * `null` означає «показати нейтральний підпис»: нічого не вигадуємо.
 */
export function describeToolStep(toolNames: readonly string[]): string | null {
  const distinct = [...new Set(toolNames)];
  if (distinct.length === 0) return null;
  if (distinct.length > 1) return MULTI_TOOL_STEP_LABEL;
  return getToolProgressLabel(distinct[0] ?? "");
}
