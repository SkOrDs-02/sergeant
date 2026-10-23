/**
 * Last validated: 2026-07-25
 * Status: Active
 *
 * Форма «Записати сьогодні» екрана «Тіло». Винесена з `pages/Body.tsx`
 * у власний модуль у межах W1-WEIGHT-SOT (стадія 1): сторінка була 655
 * рядків, тобто над лімітом Hard Rule #18 (`max-lines: 600`).
 *
 * Компонент лишається чисто презентаційним: він валідує ввід і віддає
 * нормалізований запис нагору через `onSubmitEntry`. Куди саме той запис
 * лягає (daily_log / measurements / біометрія) — не його справа.
 */
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Card } from "@shared/components/ui/Card";
import { ChoiceGroup } from "@shared/components/ui/Choice";
import { FIELD_LABEL } from "@shared/components/ui/Input";
import { Label } from "@shared/components/ui/FormField";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { useApiForm } from "@shared/forms";
import { useRegisterDirtyState } from "@shared/hooks/useRegisterDirtyState";
import { messages } from "@shared/i18n/uk";
import { parseDecimalInput } from "@shared/lib/format/numberInput";
import { cn } from "@shared/lib/ui/cn";
import {
  ENERGY_LABELS,
  MOOD_LABELS,
  SelectedLevelLabel,
} from "./SelectedLevelLabel";

const SCALE = ["1", "2", "3", "4", "5"] as const;
type ScaleValue = (typeof SCALE)[number];

const scaleItems = (labels: readonly string[]) =>
  SCALE.map((v) => ({ value: v, label: v, ariaLabel: labels[Number(v)] }));

/**
 * Form schema — повторює UX-обмеження інпутів (`min`/`max`/`step`),
 * але дозволяє пусті стрічки для не-заповнених метрик. Ціна порожнього
 * рядка в `weightKg`/`sleepHours` — `null` у persisted entry; саме тому
 * client-side валідація працює на string-полях, а конверсія в number
 * відбувається в `onSubmit`.
 */
/**
 * Число з поля, або `null` для порожнього і зіпсованого вводу.
 *
 * `parseDecimalInput`, а не `Number()`: поля мають `inputMode="decimal"`, і
 * українська розкладка дає кому — `Number("82,5")` це `NaN`, тож форма
 * відхиляла коректну вагу. Той самий баг, що бета-тестер зловив 2026-08-10
 * у КБЖВ; тут його просто ще не встигли зловити.
 */
function bodyFieldValue(raw: string): number | null {
  if (raw === "") return null;
  const parsed = parseDecimalInput(raw);
  return parsed.ok ? parsed.value : null;
}

/** `true`, якщо поле порожнє або тримає число в межах діапазону. */
function bodyFieldInRange(raw: string, min: number, max: number): boolean {
  if (raw === "") return true;
  const value = bodyFieldValue(raw);
  return value != null && value >= min && value <= max;
}

const bodyFormObjectSchema = z.object({
  weightKg: z
    .string()
    .refine(
      (v) => bodyFieldInRange(v, 20, 300),
      messages.validation.weightKgRange,
    ),
  sleepHours: z
    .string()
    .refine(
      (v) => bodyFieldInRange(v, 0, 24),
      messages.validation.sleepHoursRange,
    ),
  energyLevel: z.number().int().min(1).max(5).nullable(),
  moodScore: z.number().int().min(1).max(5).nullable(),
  note: z.string().max(200, messages.validation.noteMax200),
});

/** True when at least one metric was filled in — an empty submit is a no-op. */
export function hasAnyBodyEntryValue(
  v: z.infer<typeof bodyFormObjectSchema>,
): boolean {
  return (
    v.weightKg !== "" ||
    v.sleepHours !== "" ||
    v.energyLevel !== null ||
    v.moodScore !== null ||
    v.note.trim() !== ""
  );
}

const bodyFormSchema = bodyFormObjectSchema.refine(hasAnyBodyEntryValue, {
  message: messages.fizruk.body.entryEmpty,
  path: ["note"],
});

type BodyFormValues = z.infer<typeof bodyFormObjectSchema>;

const DEFAULT_VALUES: BodyFormValues = {
  weightKg: "",
  sleepHours: "",
  energyLevel: null,
  moodScore: null,
  note: "",
};

/** Нормалізований запис журналу, який форма віддає сторінці. */
export interface BodyEntryDraft {
  weightKg: number | null;
  sleepHours: number | null;
  energyLevel: number | null;
  moodScore: number | null;
  note: string;
}

interface BodyEntryFormProps {
  /** Викликається лише з валідним, непорожнім записом. */
  onSubmitEntry: (draft: BodyEntryDraft) => void;
}

export function BodyEntryForm({ onSubmitEntry }: BodyEntryFormProps) {
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const submitSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    return () => {
      if (submitSuccessTimerRef.current) {
        clearTimeout(submitSuccessTimerRef.current);
        submitSuccessTimerRef.current = null;
      }
    };
  }, []);

  const { register, submit, formState, watch, setValue, reset, isSubmitting } =
    useApiForm<BodyFormValues, void>({
      schema: bodyFormSchema,
      defaultValues: DEFAULT_VALUES,
      onSubmit: async (values) => {
        onSubmitEntry({
          weightKg: bodyFieldValue(values.weightKg),
          sleepHours: bodyFieldValue(values.sleepHours),
          energyLevel: values.energyLevel,
          moodScore: values.moodScore,
          note: values.note.trim(),
        });
      },
      onSuccess: () => {
        reset(DEFAULT_VALUES);
        setSubmitSuccess(true);
        if (submitSuccessTimerRef.current) {
          clearTimeout(submitSuccessTimerRef.current);
        }
        submitSuccessTimerRef.current = setTimeout(() => {
          setSubmitSuccess(false);
          submitSuccessTimerRef.current = null;
        }, 2000);
      },
    });

  const energyLevel = watch("energyLevel");
  const moodScore = watch("moodScore");
  const weightKg = watch("weightKg");
  const sleepHours = watch("sleepHours");
  const note = watch("note");
  const weightError = formState.errors.weightKg?.message;
  const sleepError = formState.errors.sleepHours?.message;
  const noteError = formState.errors.note?.message;
  // Native `disabled` blocks an empty submit outright (rung 4 — no JS
  // validation round-trip needed); the schema `.refine` above is the
  // defense-in-depth backstop for programmatic/paste submits.
  const isEntryEmpty = !hasAnyBodyEntryValue({
    weightKg,
    sleepHours,
    energyLevel,
    moodScore,
    note,
  });

  // Форма стоїть на сторінці, не в `Sheet`: без реєстрації тихий reload
  // оновлення стер би неподаний замір (оцінки енергії/настрою — кнопки, їх
  // трекер полів не бачить).
  useRegisterDirtyState(!isEntryEmpty);

  const setScore = (field: "energyLevel" | "moodScore", v: number | null) =>
    setValue(field, v, { shouldDirty: true });

  return (
    <Card as="section" aria-label={messages.fizruk.body.formAriaLabel}>
      <SectionHeading as="h2" size="lg" className="mb-3" variant="fizruk">
        {messages.fizruk.body.formHeading}
      </SectionHeading>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="body-weight">
              {messages.fizruk.body.weightLabel}
            </Label>
            <input
              id="body-weight"
              // `type="text"`, а не `number`: під `number` браузер віддає
              // порожній рядок, щойно вміст перестає бути валідним числом,
              // тож «82,5» доїжджало сюди як «нічого не ввели» і вага тихо
              // не зберігалась. `inputMode` лишає цифрову клавіатуру.
              type="text"
              inputMode="decimal"
              className="input-focus-fizruk w-full h-11 rounded-lg border border-line bg-panelHi px-3 text-sm text-text"
              placeholder="70,5"
              disabled={isSubmitting}
              aria-invalid={weightError ? true : undefined}
              aria-describedby={weightError ? "body-weight-error" : undefined}
              {...register("weightKg")}
            />
            {weightError && (
              <p
                id="body-weight-error"
                className="mt-1 text-style-caption text-danger-strong"
                role="alert"
              >
                {weightError}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="body-sleep">
              {messages.fizruk.body.sleepLabel}
            </Label>
            <input
              id="body-sleep"
              // Той самий привід, що й у полі ваги вище.
              type="text"
              inputMode="decimal"
              className="input-focus-fizruk w-full h-11 rounded-lg border border-line bg-panelHi px-3 text-sm text-text"
              placeholder="8,0"
              disabled={isSubmitting}
              aria-invalid={sleepError ? true : undefined}
              aria-describedby={sleepError ? "body-sleep-error" : undefined}
              {...register("sleepHours")}
            />
            {sleepError && (
              <p
                id="body-sleep-error"
                className="mt-1 text-style-caption text-danger-strong"
                role="alert"
              >
                {sleepError}
              </p>
            )}
          </div>
        </div>

        <div>
          <div id="body-energy-label" className={`${FIELD_LABEL} mb-2`}>
            {messages.fizruk.body.energyLevel}
          </div>
          <ChoiceGroup
            size="sm"
            className="grid grid-cols-5"
            ariaLabelledBy="body-energy-label"
            value={
              energyLevel == null ? null : (String(energyLevel) as ScaleValue)
            }
            onChange={(v) => setScore("energyLevel", Number(v))}
            onDeselect={() => setScore("energyLevel", null)}
            items={scaleItems(ENERGY_LABELS)}
          />
          <SelectedLevelLabel
            shortLabel={messages.fizruk.body.energyShort}
            value={energyLevel}
            labels={ENERGY_LABELS}
          />
        </div>

        <div>
          <div id="body-mood-label" className={`${FIELD_LABEL} mb-2`}>
            {messages.fizruk.body.mood}
          </div>
          <ChoiceGroup
            size="sm"
            className="grid grid-cols-5"
            ariaLabelledBy="body-mood-label"
            value={moodScore == null ? null : (String(moodScore) as ScaleValue)}
            onChange={(v) => setScore("moodScore", Number(v))}
            onDeselect={() => setScore("moodScore", null)}
            items={scaleItems(MOOD_LABELS)}
          />
          <SelectedLevelLabel
            shortLabel={messages.fizruk.body.mood}
            value={moodScore}
            labels={MOOD_LABELS}
          />
        </div>

        <div>
          <Label htmlFor="body-note" optional>
            {messages.fizruk.body.note}
          </Label>
          <input
            id="body-note"
            type="text"
            className="input-focus-fizruk w-full h-11 rounded-lg border border-line bg-panelHi px-3 text-sm text-text"
            placeholder={messages.fizruk.body.notePlaceholder}
            maxLength={200}
            disabled={isSubmitting}
            aria-invalid={noteError ? true : undefined}
            aria-describedby={noteError ? "body-note-error" : undefined}
            {...register("note")}
          />
          {noteError && (
            <p
              id="body-note-error"
              className="mt-1 text-style-caption text-danger-strong"
              role="alert"
            >
              {noteError}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting || isEntryEmpty}
          aria-describedby={
            isEntryEmpty && !submitSuccess ? "body-entry-empty" : undefined
          }
          className={cn(
            "focus-ring w-full py-3 rounded-lg text-style-label transition-[background-color,box-shadow,opacity,transform]",
            // WHY: the resting CTA carries the module accent (fizruk cyan)
            // for module-accent containment (Hard Rule #12) — it must not
            // borrow another module's accent. The confirmed state stays
            // green because that green is success semantics (shared across
            // modules), not a module accent.
            submitSuccess
              ? "bg-text text-bg"
              : "bg-text text-bg hover:bg-panelHi dark:text-bg dark:hover:bg-panelHi",
            (isSubmitting || isEntryEmpty) && "opacity-60",
          )}
        >
          {submitSuccess ? "Записано" : "Записати"}
        </button>
        {isEntryEmpty && !submitSuccess && (
          <p
            id="body-entry-empty"
            className="text-style-caption text-subtle -mt-2"
          >
            {messages.fizruk.body.entryEmpty}
          </p>
        )}
      </form>
    </Card>
  );
}
