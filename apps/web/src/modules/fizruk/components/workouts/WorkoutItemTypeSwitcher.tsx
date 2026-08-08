/**
 * Last validated: 2026-08-08
 * Status: Active
 */
import { useEffect, useRef } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Segmented } from "@shared/components/ui/Segmented";
import { messages } from "@shared/i18n/uk";
import type { WorkoutItem } from "@sergeant/fizruk-domain";

export type SwitchableWorkoutItem = Pick<
  WorkoutItem,
  "type" | "sets" | "durationSec" | "distanceM"
>;

export interface WorkoutItemTypeSwitcherProps {
  item: SwitchableWorkoutItem;
  isReadOnly: boolean;
  onChange: (patch: Partial<WorkoutItem>) => void;
}

/**
 * "Тип" segmented control (Силова / Час / Дистанція) for a logged
 * workout item. Moved out of `WorkoutItemCard` in the 2026-08 redesign
 * (item 5) — it was the single biggest control on the card, changed
 * once per exercise or never, yet rendered at full size in every
 * item. Now lives inside `ExerciseDetailSheet` for the exercise
 * currently being logged; the card only ever renders the
 * type-specific fields.
 *
 * Read-only guard mirrors the pre-redesign behaviour exactly: `Segmented`
 * has no `disabled` prop, so a CSS-only block would still let Tab +
 * Arrow keys reach the control. The `onChange` guard refuses the
 * mutation outright, and the effect below pulls every tab out of the
 * Tab order once read-only so keyboard users can't even reach it.
 */
export function WorkoutItemTypeSwitcher({
  item,
  isReadOnly,
  onChange,
}: WorkoutItemTypeSwitcherProps) {
  const ts = messages.fizruk.typeSwitcher;
  const segmentedTypeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isReadOnly) return;
    const tabs =
      segmentedTypeRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]',
      );
    tabs?.forEach((tab) => {
      tab.tabIndex = -1;
    });
  });

  return (
    <div
      ref={segmentedTypeRef}
      aria-disabled={isReadOnly || undefined}
      className="rounded-2xl border border-line bg-panelHi px-3"
    >
      <SectionHeading as="div" size="xs" variant="fizruk" className="pt-2">
        {ts.heading}
      </SectionHeading>
      <Segmented
        variant="fizruk"
        style="solid"
        size="md"
        ariaLabel={ts.ariaLabel}
        className={isReadOnly ? "opacity-50 pointer-events-none" : ""}
        value={item.type || "strength"}
        items={[
          {
            value: "strength",
            label: ts.strengthLabel,
            title: ts.strengthTitle,
            ariaLabel: ts.strengthAriaLabel,
          },
          {
            value: "time",
            label: ts.timeLabel,
            title: ts.timeTitle,
            ariaLabel: ts.timeAriaLabel,
          },
          {
            value: "distance",
            label: ts.distanceLabel,
            title: ts.distanceTitle,
            ariaLabel: ts.distanceAriaLabel,
          },
        ]}
        onChange={(t) => {
          // Real block, not just visual — see the effect above for why
          // (Segmented has no `disabled` prop, and both mouse AND
          // keyboard paths land here).
          if (isReadOnly) return;
          if (t === "strength") {
            onChange({
              type: t,
              sets: item.sets?.length ? item.sets : [{ weightKg: 0, reps: 0 }],
            });
          }
          if (t === "time") {
            onChange({ type: t, durationSec: item.durationSec ?? 0 });
          }
          if (t === "distance") {
            onChange({
              type: t,
              distanceM: item.distanceM ?? 0,
              durationSec: item.durationSec ?? 0,
            });
          }
        }}
      />
    </div>
  );
}
