import {
  useEffect,
  useId,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { cn } from "@shared/lib/ui/cn";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";
import { VoiceMicButton } from "@shared/components/ui/VoiceMicButton";
import {
  ROUTINE_THEME as C,
  RECURRENCE_OPTIONS,
} from "../../lib/routineConstants";
import { ReminderPresets } from "./ReminderPresets";
import { WeekdayPicker } from "./WeekdayPicker";
import type { HabitDraft, RoutineState } from "../../lib/types";

export interface HabitFormErrors {
  name?: string;
  weekdays?: string;
}

export interface HabitFormProps {
  routine: RoutineState;
  habitDraft: HabitDraft;
  setHabitDraft: Dispatch<SetStateAction<HabitDraft>>;
  editingId: string | null;
  onSave: () => void;
  onCancel: () => void;
  /**
   * Monotonic tick bumped by the parent (`RoutineApp`) when the
   * `add_habit` PWA action or the FTUX first-action sheet wants us to
   * scroll into view and focus the name input. A tick — not a bool —
   * so repeated triggers keep re-firing without the parent having to
   * reset anything.
   */
  focusTick?: number;
  /**
   * When true, suppress the internal "Нова звичка / Редагувати звичку"
   * heading. The dialog host already renders a bolder title so we skip
   * the duplicate for a cleaner one-title-per-screen look.
   */
  hideHeading?: boolean;
  /**
   * Inline error messages for individual fields, rendered next to the
   * offending field (red border + message). Replaces the old toast-only
   * validation pattern so users can see what to fix without scrolling
   * back up.
   */
  errors?: HabitFormErrors;
}

const EMOJI_SUGGESTIONS: readonly string[] = [
  "✓",
  "💧",
  "🚶",
  "🏃",
  "💪",
  "🧘",
  "📖",
  "✍️",
  "🧠",
  "💊",
  "🥗",
  "😴",
  "☕",
  "🎯",
  "⏰",
  "🌙",
];

export function HabitForm({
  routine,
  habitDraft,
  setHabitDraft,
  editingId,
  onSave,
  onCancel,
  focusTick,
  hideHeading = false,
  errors,
}: HabitFormProps) {
  const fieldIds = useId();
  const startId = `${fieldIds}-start`;
  const endId = `${fieldIds}-end`;
  const advancedId = `${fieldIds}-advanced`;
  const nameErrId = `${fieldIds}-name-err`;
  const weekdaysErrId = `${fieldIds}-weekdays-err`;
  const sectionRef = useRef<HTMLElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const weekdaysRef = useRef<HTMLDivElement | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiWrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        emojiWrapRef.current &&
        !emojiWrapRef.current.contains(e.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [showEmojiPicker]);
  // Scroll the weekday picker into view when the parent surfaces a
  // weekdays error (e.g. user picked «По тижню» but no days). Without
  // this the inline error can sit off-screen on small viewports.
  useEffect(() => {
    if (!errors?.weekdays) return;
    const el = weekdaysRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [errors?.weekdays]);
  // Minimal-first UX: emoji + name + regularity are visible on first
  // render. Dates, reminders, tags and categories live behind a
  // "Більше опцій" disclosure. When editing an existing habit we open
  // the advanced block so the user doesn't lose track of values they
  // already set.
  const [showAdvanced, setShowAdvanced] = useState(() => Boolean(editingId));
  useEffect(() => {
    if (editingId) setShowAdvanced(true);
  }, [editingId]);

  useEffect(() => {
    if (!focusTick) return;
    const section = sectionRef.current;
    const name = nameRef.current;
    if (section && typeof section.scrollIntoView === "function") {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (name && typeof name.focus === "function") {
      // Defer to the next frame so the scroll-into-view doesn't steal
      // focus by re-rendering the parent tab panel.
      requestAnimationFrame(() => {
        try {
          name.focus({ preventScroll: true });
        } catch {
          name.focus();
        }
      });
    }
  }, [focusTick]);

  // When embedded in a dialog (HabitQuickCreateDialog) we skip the outer
  // Card chrome — the dialog already provides the bordered, rounded
  // container. Nesting another Card here visually duplicates the "flash
  // card" around the form (noticed on mobile Safari where it looked like
  // two stacked panels) and eats ~32px of horizontal padding.
  const formContent = (
    <>
      {!hideHeading && (
        <SectionHeading as="h2" size="sm">
          {editingId ? "Редагувати звичку" : "Нова звичка"}
        </SectionHeading>
      )}

      <div>
        <div className="flex gap-2 items-center">
          <div className="relative shrink-0" ref={emojiWrapRef}>
            <button
              type="button"
              onClick={() => setShowEmojiPicker((v) => !v)}
              aria-label="Обрати емодзі"
              aria-expanded={showEmojiPicker}
              className={cn(
                "routine-touch-field w-12 shrink-0 flex items-center justify-center",
                "rounded-2xl border border-line bg-panelHi text-xl",
                "hover:bg-panel transition-colors",
              )}
            >
              <span aria-hidden>{habitDraft.emoji || "✓"}</span>
            </button>
            {showEmojiPicker && (
              <div
                role="dialog"
                aria-label="Обрати емодзі"
                className={cn(
                  "absolute z-30 mt-2 left-0",
                  "rounded-2xl border border-line bg-panel shadow-float p-2",
                  "grid grid-cols-4 gap-1",
                )}
              >
                {EMOJI_SUGGESTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      setHabitDraft((d) => ({ ...d, emoji: e }));
                      setShowEmojiPicker(false);
                    }}
                    className={cn(
                      "w-9 h-9 rounded-xl text-lg",
                      "hover:bg-panelHi transition-colors",
                      habitDraft.emoji === e && "bg-panelHi ring-1 ring-line",
                    )}
                    aria-label={`Емодзі ${e}`}
                  >
                    <span aria-hidden>{e}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Input
            ref={nameRef}
            className={cn(
              "routine-touch-field min-w-0 flex-1",
              errors?.name && "border-danger",
            )}
            placeholder="Назва"
            aria-invalid={errors?.name ? true : undefined}
            aria-describedby={errors?.name ? nameErrId : undefined}
            value={habitDraft.name}
            onChange={(e) =>
              setHabitDraft((d) => ({ ...d, name: e.target.value }))
            }
          />
          <VoiceMicButton
            size="md"
            onResult={(transcript: string) => {
              const t = (transcript || "").trim();
              if (!t) return;
              setHabitDraft((d) => ({ ...d, name: t }));
            }}
            label="Голосовий ввід назви звички"
            promptHint="Назва звички українською: пити воду, медитувати, ранкова пробіжка, читати книгу."
            className="shrink-0"
          />
        </div>
        {errors?.name && (
          <p id={nameErrId} className="text-xs text-danger mt-1">
            {errors.name}
          </p>
        )}
      </div>

      {/* Segmented chips — a native <select> sits right on top of the
          keyboard on mobile and collapses long labels into a single line.
          Chip row puts every regularity option one tap away with no
          picker sheet, and the selected state is visible without opening
          anything. `once` is rare enough to live behind the advanced
          disclosure (it also swaps the UI semantics from repeat to
          single date), so we only surface the 4 repeating patterns
          here. */}
      <div>
        <div className="text-xs text-subtle mb-1">Регулярність</div>
        <div
          className="flex flex-wrap gap-1.5"
          role="radiogroup"
          aria-label="Регулярність"
        >
          {RECURRENCE_OPTIONS.map((o) => {
            const active = (habitDraft.recurrence || "daily") === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={active}
                className={cn(
                  "text-style-caption px-2.5 py-1.5 rounded-xl border transition-colors min-h-[32px]",
                  active ? C.chipOn : C.chipOff,
                )}
                onClick={() =>
                  setHabitDraft((d) => ({ ...d, recurrence: o.value }))
                }
              >
                {o.shortLabel ?? o.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* When user picks «По тижню», surface the weekday selector inline
          — previously buried under «Більше опцій», which meant the user
          had to pick a recurrence, then Save, then hunt for the hidden
          disclosure when the toast complained. S3 / S10. */}
      {habitDraft.recurrence === "weekly" && (
        <div
          ref={weekdaysRef}
          className={cn(
            "rounded-2xl border p-3 transition-colors",
            errors?.weekdays
              ? "border-danger bg-danger/5"
              : "border-line bg-panel/40",
          )}
          aria-invalid={errors?.weekdays ? true : undefined}
          aria-describedby={errors?.weekdays ? weekdaysErrId : undefined}
        >
          <WeekdayPicker
            weekdays={habitDraft.weekdays}
            onChange={(next) =>
              setHabitDraft((d) => ({ ...d, weekdays: next }))
            }
          />
          {errors?.weekdays && (
            <p id={weekdaysErrId} className="text-xs text-danger mt-2">
              {errors.weekdays}
            </p>
          )}
        </div>
      )}

      {/* Reminder presets — previously hidden under "Більше опцій". Push
          notifications are the single highest-value habit feature, so the
          chip row lives on the first screen. The time-input list and the
          "+ Додати час" affordance still live in advanced for users who
          want to customise — the inline version only renders the preset
          chips. */}
      <ReminderPresets habitDraft={habitDraft} setHabitDraft={setHabitDraft} />

      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        aria-expanded={showAdvanced}
        aria-controls={advancedId}
        className="flex items-center gap-1 text-xs text-muted hover:text-text transition-colors"
      >
        <span>{showAdvanced ? "Менше опцій" : "Більше опцій"}</span>
        <span aria-hidden className="text-2xs">
          {showAdvanced ? "▲" : "▼"}
        </span>
      </button>

      {showAdvanced && (
        <div id={advancedId} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs text-subtle" htmlFor={startId}>
              Початок (дата)
              <Input
                id={startId}
                type="date"
                className="routine-touch-field mt-1 w-full"
                value={habitDraft.startDate || ""}
                onChange={(e) =>
                  setHabitDraft((d) => ({ ...d, startDate: e.target.value }))
                }
              />
            </label>
            <label className="block text-xs text-subtle" htmlFor={endId}>
              Кінець (необовʼязково)
              <Input
                id={endId}
                type="date"
                className="routine-touch-field mt-1 w-full"
                value={habitDraft.endDate || ""}
                onChange={(e) =>
                  setHabitDraft((d) => ({ ...d, endDate: e.target.value }))
                }
              />
            </label>
          </div>

          {(habitDraft.recurrence === "once" ||
            habitDraft.recurrence === "monthly") && (
            <p className="text-xs text-subtle leading-snug">
              {habitDraft.recurrence === "once"
                ? "Подія зʼявиться лише в день «Початок». Кінець можна залишити порожнім."
                : "Орієнтир — день місяця з «Початок». У коротких місяцях (наприклад 31 → лютий) — останній день місяця."}
            </p>
          )}

          {routine.tags.length > 0 && (
            <label className="block text-xs text-subtle">
              Тег
              <select
                className="routine-touch-select mt-1"
                value={habitDraft.tagIds[0] || ""}
                onChange={(e) => {
                  const id = e.target.value;
                  setHabitDraft((d) => ({
                    ...d,
                    tagIds: id ? [id] : [],
                  }));
                }}
              >
                <option value="">— без тегу —</option>
                {routine.tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <span className="block text-2xs text-subtle mt-1 leading-snug">
                Один тег на звичку (поле tagIds у даних — масив для сумісності).
              </span>
            </label>
          )}

          {routine.categories.length > 0 && (
            <label className="block text-xs text-subtle">
              Категорія
              <select
                className="routine-touch-select mt-1"
                value={habitDraft.categoryId || ""}
                onChange={(e) => {
                  const id = e.target.value;
                  setHabitDraft((d) => ({ ...d, categoryId: id || null }));
                }}
              >
                <option value="">— без категорії —</option>
                {routine.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.emoji ? `${c.emoji} ` : ""}
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <div
        className={cn(
          "flex gap-2",
          // Inside the quick-create dialog the sheet already has an "X"
          // close in the top-right, so the Cancel button would be
          // redundant. Stretch the primary save button to fill the row.
          editingId ? "flex-row" : "flex-col",
        )}
      >
        {editingId && (
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={onCancel}
          >
            Скасувати
          </Button>
        )}
        <Button
          type="button"
          className={cn("flex-1", C.primary)}
          onClick={onSave}
        >
          {editingId ? "Зберегти зміни" : "Додати звичку"}
        </Button>
      </div>
    </>
  );

  // When embedded in a dialog (HabitQuickCreateDialog) we skip the outer
  // Card chrome. Keep the wrapper element type stable across keystrokes:
  // declaring a component inside render remounts the input on every state
  // update, which closes the software keyboard in mobile PWA browsers.
  return hideHeading ? (
    <section ref={sectionRef} className="space-y-4">
      {formContent}
    </section>
  ) : (
    <Card as="section" ref={sectionRef} radius="lg" className="space-y-3">
      {formContent}
    </Card>
  );
}
