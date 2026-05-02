import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { RoutineEmptyIllustration } from "@shared/components/ui/EmptyStateIllustrations";
import { sortHabitsByOrder } from "../../lib/habitOrder";
import {
  moveHabitInOrder,
  setHabitArchived,
  setHabitOrder,
} from "../../lib/routineStorage";
import { HabitListItem } from "./HabitListItem";
import type {
  Habit,
  PendingHabitDeletion,
  RoutineState,
} from "../../lib/types";

export interface ActiveHabitsSectionProps {
  routine: RoutineState;
  setRoutine: Dispatch<SetStateAction<RoutineState>>;
  editingId: string | null;
  onEdit: (habit: Habit) => void;
  onCancelEditIf: (id: string) => void;
  onOpenDetails: (id: string) => void;
  onOpenCalendar?: () => void;
  onRequestDelete: (pending: PendingHabitDeletion) => void;
}

export function ActiveHabitsSection({
  routine,
  setRoutine,
  editingId,
  onEdit,
  onCancelEditIf,
  onOpenDetails,
  onOpenCalendar,
  onRequestDelete,
}: ActiveHabitsSectionProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [habitListQuery, setHabitListQuery] = useState("");

  const q = habitListQuery.trim().toLowerCase();
  const filteredActiveHabits = useMemo(() => {
    const active = sortHabitsByOrder(
      routine.habits.filter((h) => !h.archived),
      routine.habitOrder || [],
    );
    if (!q) return active;
    return active.filter((h) =>
      `${h.emoji} ${h.name}`.toLowerCase().includes(q),
    );
  }, [routine.habits, routine.habitOrder, q]);

  const hasActive = routine.habits.some((h) => !h.archived);

  return (
    <Card as="section" radius="lg" padding="md" className="space-y-2">
      <SectionHeading as="h2" size="sm">
        Активні звички
      </SectionHeading>
      <p className="text-2xs text-subtle leading-snug">
        Порядок у списку = порядок у календарі. На десктопі можна перетягнути;
        на телефоні — кнопки ↑↓. Для клавіатури та скрінрідерів зручніші кнопки
        ↑↓.
      </p>
      <Input
        className="routine-touch-field w-full max-w-md"
        placeholder="Пошук у списку звичок…"
        value={habitListQuery}
        onChange={(e) => setHabitListQuery(e.target.value)}
        aria-label="Пошук звичок у списку"
      />
      <p className="sr-only" aria-live="polite">
        Порядок у списку можна змінити перетягуванням або кнопками вгору вниз.
      </p>
      {!hasActive && (
        <EmptyState
          icon={<RoutineEmptyIllustration size={72} />}
          title="Поки порожньо"
          description="Додай першу звичку формою вище."
          action={
            typeof onOpenCalendar === "function" ? (
              <Button
                type="button"
                variant="ghost"
                className="border border-line"
                onClick={onOpenCalendar}
              >
                Перейти до календаря
              </Button>
            ) : undefined
          }
        />
      )}
      <ul className="space-y-2">
        {filteredActiveHabits.map((h) => (
          <HabitListItem
            key={h.id}
            habit={h}
            editing={editingId === h.id}
            dragging={dragId === h.id}
            onDragStart={(e) => {
              setDragId(h.id);
              try {
                e.dataTransfer.setData("text/plain", h.id);
                e.dataTransfer.effectAllowed = "move";
              } catch {
                /* noop */
              }
            }}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => {
              e.preventDefault();
              try {
                e.dataTransfer.dropEffect = "move";
              } catch {
                /* noop */
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              const fromId = e.dataTransfer.getData("text/plain");
              setDragId(null);
              if (!fromId || fromId === h.id) return;
              setRoutine((s) => {
                const ordered = sortHabitsByOrder(
                  s.habits.filter((x) => !x.archived),
                  s.habitOrder || [],
                ).map((x) => x.id);
                const fi = ordered.indexOf(fromId);
                const ti = ordered.indexOf(h.id);
                if (fi < 0 || ti < 0) return s;
                const next = [...ordered];
                const [row] = next.splice(fi, 1);
                next.splice(ti, 0, row);
                return setHabitOrder(s, next);
              });
            }}
            onMoveUp={() => setRoutine((s) => moveHabitInOrder(s, h.id, -1))}
            onMoveDown={() => setRoutine((s) => moveHabitInOrder(s, h.id, 1))}
            onOpenDetails={() => onOpenDetails(h.id)}
            onStartEdit={() => onEdit(h)}
            onArchive={() => {
              setRoutine((s) => setHabitArchived(s, h.id, true));
              onCancelEditIf(h.id);
            }}
            onRequestDelete={() =>
              onRequestDelete({ id: h.id, name: h.name, archived: false })
            }
          />
        ))}
      </ul>
    </Card>
  );
}
