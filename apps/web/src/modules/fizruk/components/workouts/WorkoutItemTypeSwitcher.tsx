/**
 * Last validated: 2026-11-18
 * Status: Active
 */

import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { ChoiceGroup } from "@shared/components/ui/Choice";
import { messages } from "@shared/i18n/uk";
import type { WorkoutItem } from "@sergeant/fizruk-domain";
import {
  EXERCISE_MEASURES,
  itemMeasure,
  measureSwitchPatch,
  type ExerciseMeasure,
} from "@sergeant/fizruk-domain/domain";

export type SwitchableWorkoutItem = Pick<
  WorkoutItem,
  "type" | "measure" | "sets" | "durationSec" | "distanceM"
>;

export interface WorkoutItemTypeSwitcherProps {
  item: SwitchableWorkoutItem;
  isReadOnly: boolean;
  onChange: (patch: Partial<WorkoutItem>) => void;
  /**
   * Тип, обраний людиною (зріз 5 спеки типу виміру): памʼять типу вправи,
   * що їде між пристроями. Без пропа вибір діє лише на це тренування.
   */
  onMeasureChosen?: ((measure: ExerciseMeasure) => void) | undefined;
}

/**
 * Патч для перемикання типу вправи. Спільний для обох поверхонь, де тип
 * можна змінити (`ExerciseDetailSheet` і компактний перемикач на
 * `WorkoutItemCard`). Пише `measure` і похідний старий `type`; рядки
 * лишаються, сумісні поля зберігаються, несумісні зникають
 * (`measureSwitchPatch`, домен). `updateItem` мержить патч поверх наявного
 * item-а, тож суми `durationSec` / `distanceM` у патчі явні — інакше старе
 * значення пережило б перемикання.
 */
export function buildTypeSwitchPatch(
  m: ExerciseMeasure,
  item: SwitchableWorkoutItem,
): Partial<WorkoutItem> {
  const patch = measureSwitchPatch(m, item);
  return {
    ...patch,
    durationSec: patch.durationSec,
    distanceM: patch.distanceM,
  };
}

/** Шість плиток типу «за виміром» (рішення founder-а 2026-11-18, Б-1 (А)). */
export function measureChoiceItems() {
  const t = messages.fizruk.measureSwitcher;
  return EXERCISE_MEASURES.map((m) => ({
    value: m,
    label: t[m],
    ariaLabel: t[`${m}Aria`],
  }));
}

export interface MeasureChoiceProps {
  item: SwitchableWorkoutItem;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  onChange: (patch: Partial<WorkoutItem>, measure: ExerciseMeasure) => void;
}

/** Сітка вибору типу: 3 × 2 плитки, значення — тип виміру item-а. */
export function MeasureChoice({
  item,
  ariaLabel,
  className,
  disabled,
  onChange,
}: MeasureChoiceProps) {
  return (
    <ChoiceGroup
      className={className ?? "grid grid-cols-3"}
      disabled={disabled}
      ariaLabel={ariaLabel}
      value={itemMeasure(item)}
      items={measureChoiceItems()}
      onChange={(m) => {
        if (disabled) return;
        onChange(buildTypeSwitchPatch(m, item), m);
      }}
    />
  );
}

/**
 * "Тип" control for a logged workout item inside `ExerciseDetailSheet`.
 * Six measures (вага × повтори … дистанція × час).
 */
export function WorkoutItemTypeSwitcher({
  item,
  isReadOnly,
  onChange,
  onMeasureChosen,
}: WorkoutItemTypeSwitcherProps) {
  const ts = messages.fizruk.typeSwitcher;

  return (
    <div
      aria-disabled={isReadOnly || undefined}
      className="rounded-panel border border-line bg-panelHi px-3"
    >
      <SectionHeading as="div" size="xs" variant="fizruk" className="pt-2">
        {ts.heading}
      </SectionHeading>
      <MeasureChoice
        className="grid grid-cols-3 pb-3 pt-2"
        disabled={isReadOnly}
        ariaLabel={ts.ariaLabel}
        item={item}
        onChange={(patch, m) => {
          onChange(patch);
          onMeasureChosen?.(m);
        }}
      />
    </div>
  );
}
