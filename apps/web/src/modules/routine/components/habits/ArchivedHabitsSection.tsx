/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import type { Dispatch, SetStateAction } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { setHabitArchived } from "../../lib/routineStorage";
import type { PendingHabitDeletion, RoutineState } from "../../lib/types";

export interface ArchivedHabitsSectionProps {
  routine: RoutineState;
  setRoutine: Dispatch<SetStateAction<RoutineState>>;
  onRequestDelete: (pending: PendingHabitDeletion) => void;
}

export function ArchivedHabitsSection({
  routine,
  setRoutine,
  onRequestDelete,
}: ArchivedHabitsSectionProps) {
  const archived = routine.habits.filter((h) => h.archived);
  if (archived.length === 0) return null;

  return (
    <Card as="section" radius="lg" padding="md" className="space-y-2">
      <SectionHeading as="h2" size="lg">
        Архів
      </SectionHeading>
      <p className="text-style-body text-subtle">
        Не показуються в календарі; відмітки збережені.
      </p>
      <ul className="space-y-2">
        {archived.map((h) => (
          <li
            key={h.id}
            className="flex flex-col gap-2 border-b border-line/40 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="flex items-center gap-1.5 text-style-label-lg font-semibold text-text">
              <span className="truncate">{h.name}</span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              <Button
                tone="neutral"
                type="button"
                variant="outline"
                size="sm"
                className="h-9! px-3! text-style-label"
                onClick={() =>
                  setRoutine((s) => setHabitArchived(s, h.id, false))
                }
              >
                Відновити
              </Button>
              <Button
                type="button"
                variant="soft"
                tone="danger"
                size="sm"
                className="h-9! px-3! text-style-label"
                onClick={() =>
                  onRequestDelete({ id: h.id, name: h.name, archived: true })
                }
              >
                Видалити
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
