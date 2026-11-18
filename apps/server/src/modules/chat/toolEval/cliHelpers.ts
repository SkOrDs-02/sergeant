/**
 * Дрібниці CLI стенду вибору інструментів (`scripts/tool-selection-eval.ts`).
 *
 * Винесено зі скрипта з двох причин: він упирається в `max-lines: 600`
 * (Hard Rule #18), а `scripts/` не бачать ані typecheck, ані vitest, тож
 * усе, що можна перевірити без мережі, живе тут.
 */

import type { ToolCase } from "../toolSelectionCases/index.js";
import type { RecordedTurn } from "./cassette.js";
import type { ReplayedCase } from "./replay.js";

/** Мітка рядка звіту: транспортна помилка, вигаданий id, влучання чи промах. */
export function mark(r: ReplayedCase): string {
  if (r.error) return "ERR";
  if (r.hallucinated.length) return "FAKE";
  return r.correct ? "  ok" : "MISS";
}

/** Текст останнього ходу моделі одним рядком, обрізаний для звіту. */
export function textOf(turn: RecordedTurn | undefined): string {
  return (turn?.blocks ?? [])
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text as string)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 220);
}

/**
 * `--only=<підрядок>[,<підрядок>…]`: лише кейси, у назві яких є бодай один із
 * підрядків. Потрібно для малого платного перезаміру конкретних кейсів
 * (2026-11-18: `forget` і `archive_habit`) без оплати всього набору.
 *
 * Порожній збіг кидає, а не повертає порожній список: прогін без кейсів
 * виглядав би як зелений, а насправді нічого не виміряв.
 */
export function filterCasesByName(
  cases: ToolCase[],
  only: string | undefined,
): ToolCase[] {
  if (only === undefined) return cases;
  const needles = only
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const picked = cases.filter((c) => needles.some((n) => c.name.includes(n)));
  if (picked.length === 0) {
    throw new Error(`--only=${only}: жоден кейс не збігся за назвою.`);
  }
  return picked;
}
