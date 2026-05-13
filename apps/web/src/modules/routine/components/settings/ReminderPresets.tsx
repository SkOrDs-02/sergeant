import type { Dispatch, SetStateAction } from "react";
import { cn } from "@shared/lib/ui/cn";
import { IconButton } from "@shared/components/ui/IconButton";
import { Input } from "@shared/components/ui/Input";
import { ROUTINE_THEME as C } from "../../lib/routineConstants";
import { REMINDER_PRESETS } from "../../lib/routineDraftUtils";
import type { HabitDraft } from "../../lib/types";

export interface ReminderPresetsProps {
  habitDraft: HabitDraft;
  setHabitDraft: Dispatch<SetStateAction<HabitDraft>>;
}

export function ReminderPresets({
  habitDraft,
  setHabitDraft,
}: ReminderPresetsProps) {
  const times = habitDraft.reminderTimes || [];
  return (
    <div className="space-y-2">
      <div className="text-xs text-subtle">Нагадування (необовʼязково)</div>
      <div className="flex flex-wrap gap-1.5">
        {REMINDER_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={cn(
              "text-style-caption px-2.5 py-1.5 rounded-xl border transition-colors min-h-[44px]",
              JSON.stringify(times.slice().sort()) ===
                JSON.stringify(preset.times.slice().sort())
                ? C.chipOn
                : C.chipOff,
            )}
            onClick={() =>
              setHabitDraft((d) => ({
                ...d,
                reminderTimes: [...preset.times],
                timeOfDay: preset.times[0] || "",
              }))
            }
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          className={cn(
            "text-style-caption px-2.5 py-1.5 rounded-xl border transition-colors min-h-[44px]",
            times.length === 0 ? C.chipOn : C.chipOff,
          )}
          onClick={() =>
            setHabitDraft((d) => ({
              ...d,
              reminderTimes: [],
              timeOfDay: "",
            }))
          }
        >
          Без
        </button>
      </div>
      {times.map((t, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            type="time"
            className="routine-touch-field flex-1"
            value={t}
            onChange={(e) =>
              setHabitDraft((d) => {
                const arr = [...(d.reminderTimes || [])];
                arr[i] = e.target.value;
                return {
                  ...d,
                  reminderTimes: arr,
                  timeOfDay: arr[0] || "",
                };
              })
            }
          />
          <IconButton
            size="xs"
            variant="ghost"
            className="rounded-xl text-subtle hover:text-danger hover:bg-danger/10"
            onClick={() =>
              setHabitDraft((d) => {
                const arr = (d.reminderTimes || []).filter((_, j) => j !== i);
                return {
                  ...d,
                  reminderTimes: arr,
                  timeOfDay: arr[0] || "",
                };
              })
            }
            aria-label="Видалити час"
          >
            ✕
          </IconButton>
        </div>
      ))}
      {times.length < 5 && times.length > 0 && (
        <button
          type="button"
          className="text-xs text-routine-strong dark:text-routine font-semibold hover:underline"
          onClick={() =>
            setHabitDraft((d) => ({
              ...d,
              reminderTimes: [...(d.reminderTimes || []), "12:00"],
            }))
          }
        >
          + Додати час
        </button>
      )}
    </div>
  );
}
