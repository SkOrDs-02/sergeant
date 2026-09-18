/**
 * Last validated: 2026-09-11
 * Status: Active
 */
import { useId, useState } from "react";
import type { ChecklistItem, Workout } from "@sergeant/fizruk-domain";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
import { NOTE_MAX_LEN } from "@shared/lib/text/limits";
import { WarmupCooldownChecklist } from "../workouts/WarmupCooldownChecklist";
import { WorkoutTimeEditor } from "../workouts/WorkoutTimeEditor";

type ExtraKey = "warmup" | "cooldown" | "note" | "time";

export interface SessionExtrasRowProps {
  activeWorkout: Workout;
  updateWorkout: (id: string, patch: Partial<Workout>) => void;
  pendingRetroEnd?: string | null | undefined;
  onPendingRetroEndChange?: ((iso: string) => void) | undefined;
  onToggleChecklist: (field: "warmup" | "cooldown", itemId: string) => void;
  onInitWarmup: () => void;
  onInitCooldown: () => void;
}

function checklistCount(items: ChecklistItem[] | null | undefined): string {
  if (!items) return "";
  return `${items.filter((x) => x.done).length}/${items.length}`;
}

/**
 * Периферія сесії одним рядом чипів: Розминка · Заминка · Нотатка · Час.
 * Замінює чотири однакові акордеони по різні боки від вправ (аудит 09-03,
 * A3): тап по чипу розгортає відповідний блок під рядом, розминка більше
 * не відкрита за замовчуванням і не штовхає першу вправу вниз. Самі
 * блоки — ті ж компоненти, що й раніше; змінився лише контейнер.
 */
export function SessionExtrasRow({
  activeWorkout,
  updateWorkout,
  pendingRetroEnd,
  onPendingRetroEndChange,
  onToggleChecklist,
  onInitWarmup,
  onInitCooldown,
}: SessionExtrasRowProps) {
  const ss = messages.fizruk.session;
  const [open, setOpen] = useState<ExtraKey | null>(null);
  const noteId = useId();
  const toggle = (key: ExtraKey) => setOpen((k) => (k === key ? null : key));

  const chips: Array<{ key: ExtraKey; label: string; count: string }> = [
    {
      key: "warmup",
      label: ss.warmup,
      count: checklistCount(activeWorkout.warmup),
    },
    {
      key: "cooldown",
      label: ss.cooldown,
      count: checklistCount(activeWorkout.cooldown),
    },
    { key: "note", label: ss.note, count: activeWorkout.note ? "•" : "" },
    { key: "time", label: ss.time, count: "" },
  ];

  return (
    <div className="space-y-2">
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label={ss.extrasAria}
      >
        {chips.map((c) => {
          const active = open === c.key;
          return (
            <button
              key={c.key}
              type="button"
              aria-expanded={active}
              onClick={() => toggle(c.key)}
              className={cn(
                "focus-ring flex h-11 items-center gap-1.5 rounded-xl border px-3 text-style-caption transition-colors",
                active
                  ? "border-fizruk-ring bg-fizruk-surface text-fizruk-soft-fg font-semibold"
                  : "border-line bg-panelHi text-muted hover:text-text",
              )}
            >
              {c.label}
              {c.count ? (
                <span className="font-bold tabular-nums text-text">
                  {c.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {open === "warmup" && (
        <WarmupCooldownChecklist
          title={ss.warmup}
          items={activeWorkout.warmup}
          onToggle={(id) => onToggleChecklist("warmup", id)}
          onInit={onInitWarmup}
        />
      )}
      {open === "cooldown" && (
        <WarmupCooldownChecklist
          title={ss.cooldown}
          items={activeWorkout.cooldown}
          onToggle={(id) => onToggleChecklist("cooldown", id)}
          onInit={onInitCooldown}
        />
      )}
      {open === "note" && (
        <div className="rounded-xl border border-line bg-panelHi/50 px-3 py-2">
          <label
            htmlFor={noteId}
            className="block text-style-caption text-subtle"
          >
            {ss.noteTitle} · {ss.noteHint}
          </label>
          <textarea
            id={noteId}
            className="input-focus-fizruk mt-2 w-full min-h-[72px] rounded-xl border border-line bg-bg px-3 py-2.5 text-style-body text-text placeholder:text-subtle resize-none"
            placeholder={ss.notePlaceholder}
            value={activeWorkout.note || ""}
            maxLength={NOTE_MAX_LEN}
            onChange={(e) =>
              updateWorkout(activeWorkout.id, { note: e.target.value })
            }
          />
        </div>
      )}
      {open === "time" && (
        <WorkoutTimeEditor
          activeWorkout={activeWorkout}
          updateWorkout={updateWorkout}
          pendingEndedAt={pendingRetroEnd}
          onPendingEndChange={onPendingRetroEndChange}
        />
      )}
    </div>
  );
}
