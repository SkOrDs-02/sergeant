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
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { z } from "zod";
import { Card } from "@shared/components/ui/Card";
import { Label } from "@shared/components/ui/FormField";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { useApiForm } from "@shared/forms";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";
import {
  ENERGY_LABELS,
  MOOD_LABELS,
  ScoreButton,
  SelectedLevelLabel,
} from "./ScoreButton";

/**
 * Form schema — повторює UX-обмеження інпутів (`min`/`max`/`step`),
 * але дозволяє пусті стрічки для не-заповнених метрик. Ціна порожнього
 * рядка в `weightKg`/`sleepHours` — `null` у persisted entry; саме тому
 * client-side валідація працює на string-полях, а конверсія в number
 * відбувається в `onSubmit`.
 */
const bodyFormObjectSchema = z.object({
  weightKg: z
    .string()
    .refine(
      (v) =>
        v === "" ||
        (!Number.isNaN(Number(v)) && Number(v) >= 20 && Number(v) <= 300),
      messages.validation.weightKgRange,
    ),
  sleepHours: z
    .string()
    .refine(
      (v) =>
        v === "" ||
        (!Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 24),
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

/**
 * Arrow-key navigation for radiogroup score buttons (WCAG 2.1 §4.1.2 /
 * ARIA authoring practices — roving tabIndex pattern).
 * ArrowRight / ArrowDown → next value (wraps from 5 → 1).
 * ArrowLeft / ArrowUp   → prev value (wraps from 1 → 5).
 * Home → 1, End → 5.
 * Clicking the same selected value deselects it (toggle to null).
 */
function handleScoreKeyDown(
  e: KeyboardEvent<HTMLDivElement>,
  current: number | null,
  setter: (v: number | null) => void,
  groupEl: HTMLDivElement | null,
) {
  const VALUES = [1, 2, 3, 4, 5] as const;
  let next: number | null = null;
  const cur = current ?? 0;
  const idx = VALUES.indexOf(cur as (typeof VALUES)[number]);
  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
    e.preventDefault();
    next = VALUES[(idx + 1) % VALUES.length] ?? 1;
  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
    e.preventDefault();
    next = VALUES[(idx - 1 + VALUES.length) % VALUES.length] ?? 5;
  } else if (e.key === "Home") {
    e.preventDefault();
    next = 1;
  } else if (e.key === "End") {
    e.preventDefault();
    next = 5;
  }
  if (next !== null) {
    setter(next);
    const buttons =
      groupEl?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    if (buttons) {
      const target = buttons[next - 1];
      target?.focus();
    }
  }
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
          weightKg: values.weightKg !== "" ? Number(values.weightKg) : null,
          sleepHours:
            values.sleepHours !== "" ? Number(values.sleepHours) : null,
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

  const energyGroupRef = useRef<HTMLDivElement | null>(null);
  const moodGroupRef = useRef<HTMLDivElement | null>(null);

  const onEnergyKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      handleScoreKeyDown(
        e,
        energyLevel,
        (v) => setValue("energyLevel", v, { shouldDirty: true }),
        energyGroupRef.current,
      );
    },
    [energyLevel, setValue],
  );

  const onMoodKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      handleScoreKeyDown(
        e,
        moodScore,
        (v) => setValue("moodScore", v, { shouldDirty: true }),
        moodGroupRef.current,
      );
    },
    [moodScore, setValue],
  );

  return (
    <Card
      as="section"
      radius="lg"
      aria-label={messages.fizruk.body.formAriaLabel}
    >
      <SectionHeading as="h2" size="xs" className="mb-3" variant="fizruk">
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
              type="number"
              inputMode="decimal"
              step="0.1"
              min="20"
              max="300"
              className="input-focus-fizruk w-full h-11 rounded-xl border border-line bg-panelHi px-3 text-sm text-text"
              placeholder="70.5"
              disabled={isSubmitting}
              aria-invalid={weightError ? true : undefined}
              aria-describedby={weightError ? "body-weight-error" : undefined}
              {...register("weightKg")}
            />
            {weightError && (
              <p
                id="body-weight-error"
                className="mt-1 text-xs text-danger-strong"
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
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0"
              max="24"
              className="input-focus-fizruk w-full h-11 rounded-xl border border-line bg-panelHi px-3 text-sm text-text"
              placeholder="8.0"
              disabled={isSubmitting}
              aria-invalid={sleepError ? true : undefined}
              aria-describedby={sleepError ? "body-sleep-error" : undefined}
              {...register("sleepHours")}
            />
            {sleepError && (
              <p
                id="body-sleep-error"
                className="mt-1 text-xs text-danger-strong"
                role="alert"
              >
                {sleepError}
              </p>
            )}
          </div>
        </div>

        <div>
          <SectionHeading as="p" size="xs" variant="fizruk" className="mb-2">
            {messages.fizruk.body.energyLevel}
          </SectionHeading>
          <div
            ref={energyGroupRef}
            className="flex gap-1.5"
            role="radiogroup"
            tabIndex={-1}
            aria-label={messages.fizruk.body.energyLevel}
            onKeyDown={onEnergyKeyDown}
          >
            {[1, 2, 3, 4, 5].map((v) => (
              <ScoreButton
                key={v}
                value={v}
                label={ENERGY_LABELS[v] ?? ""}
                selected={energyLevel === v}
                tabbable={energyLevel === v || (energyLevel == null && v === 1)}
                onClick={(val: number) =>
                  setValue("energyLevel", energyLevel === val ? null : val, {
                    shouldDirty: true,
                  })
                }
              />
            ))}
          </div>
          <SelectedLevelLabel
            shortLabel={messages.fizruk.body.energyShort}
            value={energyLevel}
            labels={ENERGY_LABELS}
          />
        </div>

        <div>
          <SectionHeading as="p" size="xs" variant="fizruk" className="mb-2">
            {messages.fizruk.body.mood}
          </SectionHeading>
          <div
            ref={moodGroupRef}
            className="flex gap-1.5"
            role="radiogroup"
            tabIndex={-1}
            aria-label={messages.fizruk.body.mood}
            onKeyDown={onMoodKeyDown}
          >
            {[1, 2, 3, 4, 5].map((v) => (
              <ScoreButton
                key={v}
                value={v}
                label={MOOD_LABELS[v] ?? ""}
                selected={moodScore === v}
                tabbable={moodScore === v || (moodScore == null && v === 1)}
                onClick={(val: number) =>
                  setValue("moodScore", moodScore === val ? null : val, {
                    shouldDirty: true,
                  })
                }
              />
            ))}
          </div>
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
            className="input-focus-fizruk w-full h-11 rounded-xl border border-line bg-panelHi px-3 text-sm text-text"
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
              className="mt-1 text-xs text-danger-strong"
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
            "focus-ring w-full py-3 rounded-xl text-style-label transition-[background-color,box-shadow,opacity,transform]",
            // WHY: the resting CTA carries the module accent (fizruk cyan)
            // for module-accent containment (Hard Rule #12) — it must not
            // borrow another module's accent. The confirmed state stays
            // green because that green is success semantics (shared across
            // modules), not a module accent.
            submitSuccess
              ? "bg-success-strong text-white"
              : "bg-fizruk-strong text-white hover:bg-fizruk-hover active:scale-[0.98]",
            (isSubmitting || isEntryEmpty) && "opacity-60",
          )}
        >
          {submitSuccess ? "Записано" : "Записати"}
        </button>
        {isEntryEmpty && !submitSuccess && (
          <p id="body-entry-empty" className="text-xs text-subtle -mt-2">
            {messages.fizruk.body.entryEmpty}
          </p>
        )}
      </form>
    </Card>
  );
}
