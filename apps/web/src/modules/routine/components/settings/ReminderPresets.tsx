import type { Dispatch, SetStateAction } from "react";
import { cn } from "@shared/lib/ui/cn";
import { IconButton } from "@shared/components/ui/IconButton";
import { Icon } from "@shared/components/ui/Icon";
import { TimeField } from "@shared/components/ui/TimeField";
import { ROUTINE_THEME as C } from "../../lib/routineConstants";
import {
  REMINDER_PRESETS,
  matchReminderPreset,
} from "../../lib/routineDraftUtils";
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
  // Збіг за частиною доби, а не за точним часом: правка 08:00 → 11:00 має
  // перевести підсвітку на «День», а не погасити її. Розбір — у
  // `matchReminderPreset`.
  const activePresetId = matchReminderPreset(times)?.id ?? null;
  return (
    <div className="space-y-2">
      <div className="text-style-caption text-subtle">
        Нагадування (необовʼязково)
      </div>
      <div
        className="flex flex-wrap gap-1.5"
        role="radiogroup"
        aria-label="Нагадування"
      >
        {REMINDER_PRESETS.map((preset) => {
          const active = activePresetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={cn(
                "text-style-caption px-2.5 py-1.5 rounded-xl border transition-colors min-h-[44px]",
                active ? C.chipOn : C.chipOff,
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
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={times.length === 0}
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
          {/* `flex-1` сам по собі НЕ рятує: він ставить `flex-basis: 0`, але
              floor `min-width: auto` лишається, і нативний time-контрол зі
              своїм intrinsic inline-size розпирає рядок. Контракт несе
              `TimeField`; `min-w-0 flex-1` — на обгортці, бо корінь примітива
              вже `w-full` і власного класу ззовні не приймає.
              Рецепт: docs/start/instructions/fix-mobile-horizontal-overflow.md */}
          <div className="min-w-0 flex-1">
            <TimeField
              className="routine-touch-field"
              aria-label={`Час нагадування ${i + 1}`}
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
          </div>
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
            <Icon name="close" size="sm" aria-hidden />
          </IconButton>
        </div>
      ))}
      {times.length < 5 && times.length > 0 && (
        <button
          type="button"
          className="text-style-caption text-routine-strong dark:text-routine font-semibold hover:underline"
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
