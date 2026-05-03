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
    <Card
      as="section"
      radius="lg"
      padding="md"
      className="space-y-2 opacity-95"
    >
      <SectionHeading as="h2" size="sm">
        Архів
      </SectionHeading>
      <p className="text-2xs text-subtle">
        Не показуються в календарі; відмітки збережені.
      </p>
      <ul className="space-y-2">
        {archived.map((h) => (
          <li
            key={h.id}
            className="flex flex-col gap-2 border-b border-line/40 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="text-sm text-muted">
              {h.emoji} {h.name}
            </span>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9! px-3! text-xs! border border-line"
                onClick={() =>
                  setRoutine((s) => setHabitArchived(s, h.id, false))
                }
              >
                Відновити
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9! px-3! text-xs! text-danger border border-danger/25"
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
