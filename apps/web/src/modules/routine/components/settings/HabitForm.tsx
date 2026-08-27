import {
  useEffect,
  useId,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { cn } from "@shared/lib/ui/cn";
import { motionScrollBehavior } from "@shared/lib/ui/motion";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { DateField } from "@shared/components/ui/DateField";
import { Input } from "@shared/components/ui/Input";
import { Label } from "@shared/components/ui/FormField";
import { VoiceMicButton } from "@shared/components/ui/VoiceMicButton";
import { NAME_MAX_LEN } from "@shared/lib/text/limits";
import {
  classifyDateBound,
  DATE_WARN_MESSAGE,
} from "@shared/lib/time/dateBounds";
import {
  ROUTINE_THEME as C,
  RECURRENCE_OPTIONS,
} from "../../lib/routineConstants";
import { HabitGlyphPicker } from "../HabitGlyphPicker";
import { ReminderPresets } from "./ReminderPresets";
import { WeekdayPicker } from "./WeekdayPicker";
import type { HabitDraft, RoutineState } from "../../lib/types";

export interface HabitFormErrors {
  name?: string | undefined;
  weekdays?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
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
  /**
   * When the form is embedded inside a dialog host that renders its
   * own action buttons in a sticky footer, suppress the in-flow
   * "Скасувати / Додати звичку" row so the user always sees the CTA
   * without scrolling to the end of the form.
   */
  hideActions?: boolean;
}

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
  hideActions = false,
}: HabitFormProps) {
  const fieldIds = useId();
  const startId = `${fieldIds}-start`;
  const endId = `${fieldIds}-end`;
  const advancedId = `${fieldIds}-advanced`;
  const nameErrId = `${fieldIds}-name-err`;
  const nameId = `${fieldIds}-name`;
  const weekdaysErrId = `${fieldIds}-weekdays-err`;
  const tagsLabelId = `${fieldIds}-tags`;
  const sectionRef = useRef<HTMLElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const weekdaysRef = useRef<HTMLDivElement | null>(null);
  // Scroll the weekday picker into view when the parent surfaces a
  // weekdays error (e.g. user picked «По тижню» but no days). Without
  // this the inline error can sit off-screen on small viewports.
  useEffect(() => {
    if (!errors?.weekdays) return;
    const el = weekdaysRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: motionScrollBehavior(), block: "center" });
    }
  }, [errors?.weekdays]);
  // Minimal-first UX: icon + name + regularity are visible on first
  // render. Dates, reminders, tags and categories live behind a
  // "Більше опцій" disclosure. When editing an existing habit we open
  // the advanced block so the user doesn't lose track of values they
  // already set.
  // Мʼяке вікно дат — попередження, не блокування (жорстке вікно ловить
  // `HabitQuickCreateDialog.handleSave` як помилку валідації).
  const dateWarning = [habitDraft.startDate, habitDraft.endDate].some(
    (d) => d && classifyDateBound(d) === "warn",
  )
    ? DATE_WARN_MESSAGE
    : null;

  const [showAdvanced, setShowAdvanced] = useState(() => Boolean(editingId));
  const [prevEditingId, setPrevEditingId] = useState(editingId);
  if (editingId !== prevEditingId) {
    setPrevEditingId(editingId);
    if (editingId) setShowAdvanced(true);
  }

  useEffect(() => {
    if (!focusTick) return;
    const section = sectionRef.current;
    const name = nameRef.current;
    if (section && typeof section.scrollIntoView === "function") {
      section.scrollIntoView({
        behavior: motionScrollBehavior(),
        block: "start",
      });
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
        <SectionHeading as="h2" size="xs" variant="routine">
          {editingId ? "Редагувати звичку" : "Нова звичка"}
        </SectionHeading>
      )}

      <div>
        <Label htmlFor={nameId}>Назва звички</Label>
        <div className="flex gap-2 items-center">
          <HabitGlyphPicker
            value={habitDraft.emoji}
            onChange={(glyph) => setHabitDraft((d) => ({ ...d, emoji: glyph }))}
            label="Обрати іконку звички"
          />
          <Input
            id={nameId}
            ref={nameRef}
            className={cn(
              "routine-touch-field min-w-0 flex-1",
              errors?.name && "border-danger",
            )}
            placeholder="Напр. Пити воду, медитувати, ранкова пробіжка"
            maxLength={NAME_MAX_LEN}
            showCharCount={false}
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
          <p
            id={nameErrId}
            className="text-style-caption text-danger-strong mt-1 dark:text-danger"
          >
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
        <div className="text-style-caption text-subtle mb-1">Регулярність</div>
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
                  "text-style-caption px-2.5 py-1.5 rounded-xl border transition-colors min-h-[44px]",
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
            <p
              id={weekdaysErrId}
              className="text-style-caption text-danger-strong mt-2 dark:text-danger"
            >
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
        className="flex items-center gap-1 text-style-caption text-muted hover:text-text transition-colors"
      >
        <span>{showAdvanced ? "Менше опцій" : "Більше опцій"}</span>
        <span
          aria-hidden
          className={cn(
            "inline-flex shrink-0 transition-transform",
            showAdvanced ? "rotate-180" : "rotate-0",
          )}
        >
          <Icon name="chevron-down" size="sm" />
        </span>
      </button>

      {showAdvanced && (
        <div id={advancedId} className="space-y-3">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <DateField
              id={startId}
              label="Початок (дата)"
              className="routine-touch-field"
              error={errors?.startDate ? true : undefined}
              helperText={errors?.startDate}
              value={habitDraft.startDate || ""}
              onChange={(e) =>
                setHabitDraft((d) => ({ ...d, startDate: e.target.value }))
              }
            />
            <DateField
              id={endId}
              label="Кінець (необовʼязково)"
              className="routine-touch-field"
              error={errors?.endDate ? true : undefined}
              helperText={errors?.endDate}
              value={habitDraft.endDate || ""}
              onChange={(e) =>
                setHabitDraft((d) => ({ ...d, endDate: e.target.value }))
              }
            />
          </div>
          {/* Мʼяке вікно: зберігати дозволено, попереджаємо про рік. */}
          {dateWarning ? (
            <p className="text-style-caption text-warning-strong dark:text-warning">
              {dateWarning}
            </p>
          ) : null}

          {(habitDraft.recurrence === "once" ||
            habitDraft.recurrence === "monthly") && (
            <p className="text-style-caption text-subtle leading-snug">
              {habitDraft.recurrence === "once"
                ? "Подія зʼявиться лише в день «Початок». Кінець можна залишити порожнім."
                : "Орієнтир – день місяця з «Початок». У коротких місяцях (наприклад 31 → лютий): останній день місяця."}
            </p>
          )}

          {/*
            Мультивибір тегів. До 2026-08-03 тут стояв `<select>`, який писав
            рівно один id, хоча `tagIds` і в типі, і в SQLite, і в sync-контракті
            завжди був масивом — підказка під полем прямо це визнавала
            («масив для сумісності»). Через це «ранкова пробіжка» не могла бути
            одночасно «ранок» і «спорт», а фільтр у календарі показував її лише
            під одним чипом. Чипи-тумблери знімають обмеження, не чіпаючи схему.
          */}
          {routine.tags.length > 0 && (
            <div className="block text-style-caption text-subtle">
              <span id={tagsLabelId}>Теги</span>
              <div
                role="group"
                aria-labelledby={tagsLabelId}
                className="mt-1 flex flex-wrap gap-1.5"
              >
                {routine.tags.map((t) => {
                  const active = habitDraft.tagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={active}
                      className={cn(
                        "text-style-caption min-h-[44px] rounded-xl border px-2.5 py-1.5 transition-colors",
                        active ? C.chipOn : C.chipOff,
                      )}
                      onClick={() =>
                        setHabitDraft((d) => ({
                          ...d,
                          tagIds: d.tagIds.includes(t.id)
                            ? d.tagIds.filter((id) => id !== t.id)
                            : [...d.tagIds, t.id],
                        }))
                      }
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
              <span className="mt-1 block text-style-caption text-subtle leading-snug">
                Можна обрати кілька. Теги створюються в Налаштуваннях →
                «Рутина».
              </span>
            </div>
          )}

          {routine.categories.length > 0 && (
            <label className="block text-style-caption text-subtle">
              Категорія
              <select
                className="routine-touch-select mt-1"
                value={habitDraft.categoryId || ""}
                onChange={(e) => {
                  const id = e.target.value;
                  setHabitDraft((d) => ({ ...d, categoryId: id || null }));
                }}
              >
                <option value="">Без категорії</option>
                {routine.categories.map((c) => (
                  // Нативний `<option>` малює лише текст — SVG-іконка туди
                  // не поміститься, тож у селекті лишається сама назва.
                  // Гліф видно в списку категорій і на картці звички.
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {!hideActions && (
        <div
          className={cn(
            "flex gap-2",
            // Inside the quick-create dialog the sheet already has an "X"
            // close in the top-right, so the Cancel button would be
            // redundant. Editing actions stack on narrow phones so neither
            // label is squeezed beyond its button, then share the row at sm.
            editingId ? "flex-col sm:flex-row" : "flex-col",
          )}
        >
          {editingId && (
            <Button
              type="button"
              variant="secondary"
              className="w-full min-w-0 sm:flex-1"
              onClick={onCancel}
            >
              Скасувати
            </Button>
          )}
          <Button
            type="button"
            variant="routine"
            className="w-full min-w-0 sm:flex-1"
            onClick={onSave}
          >
            {editingId ? "Зберегти зміни" : "Додати звичку"}
          </Button>
        </div>
      )}
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
