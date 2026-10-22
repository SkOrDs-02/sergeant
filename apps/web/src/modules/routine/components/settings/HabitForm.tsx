import { pluralTimes } from "@sergeant/shared";
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
import { messages } from "@shared/i18n/uk";
import { Button } from "@shared/components/ui/Button";
import { ChoiceGroup } from "@shared/components/ui/Choice";
import { MorphChevron } from "@shared/components/ui/MorphChevron";
import { DateField } from "@shared/components/ui/DateField";
import { FIELD_LABEL, Input } from "@shared/components/ui/Input";
import { Label } from "@shared/components/ui/FormField";
import { VoiceMicButton } from "@shared/components/ui/VoiceMicButton";
import { NAME_MAX_LEN } from "@shared/lib/text/limits";
import {
  classifyDateBound,
  DATE_WARN_MESSAGE,
} from "@shared/lib/time/dateBounds";
import {
  RECURRENCE_OPTIONS,
  WEEKLY_TARGET_CHOICES,
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
  /**
   * Monotonic tick bumped by the parent (`RoutineApp`) when the
   * `add_habit` PWA action or the FTUX first-action sheet wants us to
   * scroll into view and focus the name input. A tick — not a bool —
   * so repeated triggers keep re-firing without the parent having to
   * reset anything.
   */
  focusTick?: number;
  /**
   * Inline error messages for individual fields, rendered next to the
   * offending field (red border + message). Replaces the old toast-only
   * validation pattern so users can see what to fix without scrolling
   * back up.
   */
  errors?: HabitFormErrors;
}

/**
 * Поля створення й редагування звички — і **тільки поля**.
 *
 * AI-CONTEXT: форма навмисно не несе ні власного заголовка, ні кнопок дії,
 * ні `Card`-обгортки. Усе це дає єдиний хост — `HabitQuickCreateDialog`
 * (`title` аркуша та sticky-футер із «Зберегти зміни» / «Скасувати» /
 * «Додати звичку»), і саме там воно під тестом.
 *
 * Доти тут стояв другий комплект того самого хрому під прапорцями
 * `hideHeading`/`hideActions`, які єдиний хост **завжди** вмикав — тож
 * жодна з тих гілок не рендерилась ніколи (знахідка PR-R12 огляду
 * 2026-09-13). Вкладений `Card` до того ж малював «дві панелі одна в
 * одній» на mobile Safari і зʼїдав ~32px бічних відступів.
 *
 * **Додаєш сюди заголовок або кнопку — спершу подивись на хост:** майже
 * напевно там уже є те саме, і зʼявиться третій комплект замість другого.
 */
export function HabitForm({
  routine,
  habitDraft,
  setHabitDraft,
  editingId,
  focusTick,
  errors,
}: HabitFormProps) {
  const fieldIds = useId();
  const startId = `${fieldIds}-start`;
  const endId = `${fieldIds}-end`;
  const advancedId = `${fieldIds}-advanced`;
  const nameErrId = `${fieldIds}-name-err`;
  const nameId = `${fieldIds}-name`;
  const weekdaysErrId = `${fieldIds}-weekdays-err`;
  const tagsLabelId = `${fieldIds}-tags`;
  const recurrenceLabelId = `${fieldIds}-recurrence`;
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

  // Тип обгортки тримай СТАЛИМ між рендерами: оголошення компонента
  // всередині render перемонтовує поле вводу на кожній зміні стану, а це
  // закриває софт-клавіатуру в мобільних PWA-браузерах.
  const formContent = (
    <>
      <div>
        <Label htmlFor={nameId}>Назва звички</Label>
        <div className="flex gap-2 items-center">
          <Input
            id={nameId}
            ref={nameRef}
            className={cn(
              "routine-touch-field min-w-0 flex-1",
              errors?.name && "border-danger",
            )}
            placeholder="Назва звички"
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
            module="routine"
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
            className="text-style-label text-danger-strong mt-1 dark:text-danger"
          >
            {errors.name}
          </p>
        )}
      </div>

      <div>
        <div id={recurrenceLabelId} className={`${FIELD_LABEL} mb-1`}>
          Регулярність
        </div>
        <ChoiceGroup
          ariaLabelledBy={recurrenceLabelId}
          className="grid grid-cols-3"
          value={habitDraft.recurrence || "daily"}
          items={RECURRENCE_OPTIONS.map((o) => ({
            value: o.value,
            label: o.shortLabel ?? o.label,
          }))}
          onChange={(recurrence) =>
            setHabitDraft((d) => ({ ...d, recurrence }))
          }
        />
      </div>

      {/* When user picks «По тижню», surface the weekday selector inline
          — previously buried under «Більше опцій», which meant the user
          had to pick a recurrence, then Save, then hunt for the hidden
          disclosure when the toast complained. S3 / S10. */}
      {habitDraft.recurrence === "weekly" && (
        <div
          ref={weekdaysRef}
          className={cn(
            "border-l-2 pl-3 transition-colors",
            errors?.weekdays
              ? "border-danger bg-danger/5"
              : "border-transparent",
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
              className="text-style-label text-danger-strong mt-2 dark:text-danger"
            >
              {errors.weekdays}
            </p>
          )}
        </div>
      )}

      {/* «N разів на тиждень» — ціль без прив'язки до конкретних днів.
          Стоїть поруч із селектором днів і за тією ж логікою: щойно людина
          обрала режим, потрібне число видно одразу, а не за «Більше опцій».
          Стеля 7: ціль «8 разів на тиждень» означала б двічі за день, а
          відмітка в моделі одна на день. */}
      {habitDraft.recurrence === "flexible" && (
        <div>
          <ChoiceGroup
            variant="rows"
            ariaLabel="Скільки разів на тиждень"
            value={String(habitDraft.weeklyTarget)}
            items={WEEKLY_TARGET_CHOICES.map((n) => ({
              value: String(n),
              label: messages.routine.weeklyTarget
                .replace("{n}", String(n))
                .replace("{times}", pluralTimes(n)),
            }))}
            onChange={(n) =>
              setHabitDraft((d) => ({ ...d, weeklyTarget: Number(n) }))
            }
          />
          <p className="text-style-body text-muted mt-2">
            Дні обирати не треба: відмічай тоді, коли вийшло.
          </p>
        </div>
      )}

      {/* Reminder presets — previously hidden under "Більше опцій". Push
          notifications are the single highest-value habit feature, so the
          chip row lives on the first screen. The time-input list and the
          "+ Додати час" affordance still live in advanced for users who
          want to customise — the inline version only renders the preset
          chips. */}
      <ReminderPresets habitDraft={habitDraft} setHabitDraft={setHabitDraft} />

      <Button
        variant="text"
        className="gap-2"
        onClick={() => setShowAdvanced((v) => !v)}
        aria-expanded={showAdvanced}
        aria-controls={advancedId}
      >
        Більше опцій
        <MorphChevron open={showAdvanced} className="text-subtle" />
      </Button>

      {showAdvanced && (
        <div id={advancedId} className="space-y-3">
          <div>
            <div className={`${FIELD_LABEL} mb-1`}>Іконка</div>
            <HabitGlyphPicker
              value={habitDraft.emoji}
              onChange={(glyph) =>
                setHabitDraft((d) => ({ ...d, emoji: glyph }))
              }
              label="Обрати іконку звички"
            />
          </div>
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
            <p className="text-style-label text-warning-strong dark:text-warning">
              {dateWarning}
            </p>
          ) : null}

          {/* AI-NOTE: caption тут навмисний — це підказка під контролом,
              названий виняток `no-sentence-in-caption`
              (docs/design/design/density-hierarchy-spec.md §4). Рядок
              пояснює поведінку вже обраного режиму й читається разом із
              полями дат над ним, а не як окремий абзац. */}
          {(habitDraft.recurrence === "once" ||
            habitDraft.recurrence === "monthly") && (
            <p className="text-style-label text-subtle leading-snug">
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
            <div>
              <span id={tagsLabelId} className={`${FIELD_LABEL} block`}>
                Теги
              </span>
              <ChoiceGroup
                multiple
                variant="rows"
                ariaLabelledBy={tagsLabelId}
                className="mt-1"
                value={habitDraft.tagIds}
                items={routine.tags.map((t) => ({
                  value: t.id,
                  label: t.name,
                }))}
                onChange={(tagIds) => setHabitDraft((d) => ({ ...d, tagIds }))}
              />
              {/* AI-NOTE: caption навмисний — підказка під контролом,
                  названий виняток `no-sentence-in-caption`
                  (docs/design/design/density-hierarchy-spec.md §4). */}
              <span className="mt-1 block text-style-label text-subtle leading-snug">
                Можна обрати кілька. Теги створюються в Налаштуваннях →
                «Рутина».
              </span>
            </div>
          )}

          {routine.categories.length > 0 && (
            <label className={`${FIELD_LABEL} block`}>
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
    </>
  );

  return (
    <section ref={sectionRef} className="space-y-4">
      {formContent}
    </section>
  );
}
