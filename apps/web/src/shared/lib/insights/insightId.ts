/**
 * Last validated: 2026-07-25
 * Status: Active
 * Owner: @Skords-01
 *
 * Розбір стабільного `InsightId` на телеметрійну пару `{ module, kind }`.
 *
 * Навіщо окремий модуль, а не «зріж останній сегмент» на місці виклику:
 *
 * 1. **Кардинальність.** `finyk-coffee-limit-2026-07` і
 *    `nutrition-streak-7-days-2026-W30` дають новий рядок щомісяця/щотижня.
 *    Сирий id у PostHog-property = нескінченно зростаючий словник значень,
 *    у якому неможливо порахувати конверсію петлі.
 * 2. **PII.** `finyk-budget-overrun-${budget.categoryId}` несе id кастомної
 *    категорії користувача. `scrubPII` чистить за ІМЕНАМИ ключів
 *    (`packages/shared/src/lib/pii.ts`), тож значення всередині `signal` він
 *    не виріже — захист мусить бути тут (Hard Rule #21).
 *
 * Реалізація — ЯВНИЙ реєстр відомих kind + longest-prefix match, а НЕ
 * евристика «зріж останній сегмент». Евристика мовчки зламала б групування
 * для будь-якого нового id зі складеним kind (напр. гіпотетичний
 * `routine-todo-evening-late` схлопнувся б у `routine-todo-evening`, а
 * `routine-todo` — у `routine`). Незнайомий id свідомо їде як `"unknown"`:
 * краще одна видима порожня бакет-категорія, ніж тихе розмиття знаменника.
 *
 * Чиста функція: без I/O, без React, без глобального стану — тестується
 * табличкою і викликається з рендер-шляху `InsightCard`.
 */

import { isDashboardModuleId, type DashboardModuleId } from "@sergeant/shared";

/** Значення `kind`/`module` для id, якого немає в реєстрі. */
export const UNKNOWN_INSIGHT_KIND = "unknown";

/**
 * Реєстр усіх 9 продуктових сигналів, що рендеряться через `InsightCard`.
 *
 * Пари `[kind, module]` виписані ЯВНО (а не виведені з першого сегмента)
 * саме тому, що це реєстр: додаючи новий сигнал, автор мусить свідомо
 * дописати рядок сюди — інакше подія поїде як `unknown` і це буде видно
 * на дашборді, а не втратиться.
 *
 * Джерела id (звірено з кодом 2026-07-25):
 *   finyk-budget-overrun-${categoryId}  useBudgetOverrunInsight.ts:90
 *   finyk-coffee-limit-${YYYY-MM}       useCoffeeLimitInsight.ts:135
 *   finyk-recurring-detected            useRecurringDetectedInsight.ts:75
 *   fizruk-rest-day-overdue             useRestDayOverdueInsight.ts:70
 *   fizruk-pr-pending                   usePrPendingInsight.ts:134
 *   routine-streak-record-pending       useStreakRecordPendingInsight.ts:41
 *   routine-todo-evening                useTodoEveningInsight.ts:42
 *   nutrition-protein-low               useProteinLowInsight.ts:40
 *   nutrition-streak-7-days-${weekKey}  useStreakSevenDaysInsight.ts:64
 */
const INSIGHT_KIND_REGISTRY = [
  ["finyk-budget-overrun", "finyk"],
  ["finyk-coffee-limit", "finyk"],
  ["finyk-recurring-detected", "finyk"],
  ["fizruk-rest-day-overdue", "fizruk"],
  ["fizruk-pr-pending", "fizruk"],
  ["routine-streak-record-pending", "routine"],
  ["routine-todo-evening", "routine"],
  ["nutrition-protein-low", "nutrition"],
  ["nutrition-streak-7-days", "nutrition"],
] as const satisfies ReadonlyArray<readonly [string, DashboardModuleId]>;

/** Стабільний вид сигналу — рівно те, що їде у property `signal`. */
export type KnownInsightKind = (typeof INSIGHT_KIND_REGISTRY)[number][0];

export type InsightKind = KnownInsightKind | typeof UNKNOWN_INSIGHT_KIND;

export interface ParsedInsightId {
  /**
   * Модуль-власник сигналу. Для відомого kind — завжди валідний
   * `DashboardModuleId`. Для незнайомого id — перший сегмент, але ЛИШЕ
   * якщо він сам є валідним `DashboardModuleId`; інакше `"unknown"`
   * (та сама вимога кардинальності, що й для `kind`).
   */
  module: DashboardModuleId | typeof UNKNOWN_INSIGHT_KIND;
  /** Стабільний вид сигналу без змінного суфікса. */
  kind: InsightKind;
}

// Longest-prefix match: `nutrition-streak-7-days` мусить перемогти будь-який
// коротший префікс, тому реєстр сортується один раз за спаданням довжини.
const KINDS_LONGEST_FIRST = [...INSIGHT_KIND_REGISTRY].sort(
  (a, b) => b[0].length - a[0].length,
);

const UNKNOWN_PARSED: ParsedInsightId = Object.freeze({
  module: UNKNOWN_INSIGHT_KIND,
  kind: UNKNOWN_INSIGHT_KIND,
});

/**
 * Розібрати `InsightId` на телеметрійну пару `{ module, kind }`.
 *
 * Ніколи не кидає і ніколи не повертає сирий id — і те, і те є частиною
 * контракту подій `value_signal_*` (`analyticsEvents.valueLoops.ts` §1).
 */
export function parseInsightId(id: string): ParsedInsightId {
  if (typeof id !== "string" || id.length === 0) return UNKNOWN_PARSED;

  for (const [kind, module] of KINDS_LONGEST_FIRST) {
    // Точний збіг (стабільні id) або `kind` + `-` + змінний суфікс.
    // Просто `startsWith(kind)` НЕ годиться: воно зматчило б гіпотетичний
    // `finyk-coffee-limitless` як `finyk-coffee-limit`.
    if (id === kind || id.startsWith(`${kind}-`)) return { module, kind };
  }

  const firstSegment = id.split("-", 1)[0] ?? "";
  return {
    module: isDashboardModuleId(firstSegment)
      ? firstSegment
      : UNKNOWN_INSIGHT_KIND,
    kind: UNKNOWN_INSIGHT_KIND,
  };
}
