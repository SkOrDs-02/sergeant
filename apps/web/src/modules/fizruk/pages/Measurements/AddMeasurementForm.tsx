/**
 * Last validated: 2026-08-08
 * Status: Active
 *
 * Форма «Додати замір» екрана «Заміри». Винесена з `pages/Measurements.tsx`
 * у власний модуль з двох причин: Hard Rule #18 (`max-lines: 600` — сторінка
 * підходила до межі) і V-9 (fizruk deep audit 2026-08-07) — усі 14 полів
 * форми рендерились одразу стіною, тож картку варто було виділити разом із
 * новою логікою прогресивного розкриття.
 *
 * V-9: лише 3 найчастіші поля (вага, % жиру, талія) видно завжди; решта 11
 * ховається за кнопкою «Більше полів». Якщо користувач уже вписав значення
 * в приховане поле (наприклад, розгорнув групу, щось ввів і клацнув
 * «Менше полів»), група лишається розкритою — інакше введене зникло б з очей
 * без жодного індикатора, а дані в стані форми лишились би, просто
 * невидимі. Це відрізняється від toggle «+N ще» в рядку історії нижче на
 * сторінці (`Measurements.tsx`) — та кнопка ховає ЗБЕРЕЖЕНІ записи, ця —
 * порожні поля форми ДОДАВАННЯ.
 */
import { useState } from "react";
import { z } from "zod";
import { messages } from "@shared/i18n/uk";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import {
  MEASURE_FIELDS,
  type MeasurementEntry,
  type MeasurementFieldId,
} from "../../hooks/useMeasurements";
import { Card } from "@shared/components/ui/Card";

// F3: runtime range gate — mirrors <input min max> attributes so a
// browser-bypass or programmatic submit cannot persist out-of-range PII.
const measurementSchema = z.object(
  Object.fromEntries(
    MEASURE_FIELDS.map((f) => [
      f.id,
      z
        .number()
        .min(f.min, `${f.label}: мін ${f.min} ${f.unit}`)
        .max(f.max, `${f.label}: макс ${f.max} ${f.unit}`)
        .optional(),
    ]),
  ),
);

const inp =
  "input-focus-fizruk w-full h-11 rounded-2xl border border-line bg-panelHi px-4 text-text";

// Field-caption styling for the measurements grid. This is a genuine form
// <label> (htmlFor/id bound below), not a narrative eyebrow, so the
// uppercase + tracking combo is intentional here.
const lbl =
  // eslint-disable-next-line sergeant-design/no-raw-type-size -- перенесено дослівно з `Measurements.tsx` разом із формою; це справжній form-label (htmlFor/id), і його типографіку не змінюємо в PR, який про прогресивне розкриття полів.
  "px-1 block text-xs uppercase tracking-wider font-bold text-fizruk-strong dark:text-fizruk-300/70";

// V-9: the 3 most-checked metrics stay visible without an extra tap; the
// remaining 11 (limb girths etc.) collapse behind "Більше полів". Order
// mirrors MEASURE_FIELDS so the layout reads top-to-bottom, left-to-right.
const PRIMARY_FIELD_IDS: readonly MeasurementFieldId[] = [
  "weightKg",
  "bodyFatPct",
  "waistCm",
];
const PRIMARY_FIELDS = MEASURE_FIELDS.filter((f) =>
  (PRIMARY_FIELD_IDS as readonly string[]).includes(f.id),
);
const SECONDARY_FIELDS = MEASURE_FIELDS.filter(
  (f) => !(PRIMARY_FIELD_IDS as readonly string[]).includes(f.id),
);

interface AddMeasurementFormProps {
  addEntry: (entry: Partial<MeasurementEntry>) => MeasurementEntry;
}

export function AddMeasurementForm({ addEntry }: AddMeasurementFormProps) {
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(MEASURE_FIELDS.map((f) => [f.id, ""])),
  );
  /**
   * Помилки діапазону — під конкретним полем, не в тості.
   *
   * До 2026-08-05 zod віддавав лише ПЕРШУ проблему, і вона летіла
   * `toast.warning` у нижній кут: із восьми полів користувач не бачив, яке
   * саме завелике, і мусив здогадуватись. Тепер підписані всі поля, що не
   * пройшли, — рівно там, де їх виправляти.
   */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [secondaryOpen, setSecondaryOpen] = useState(false);

  // V-9: if any hidden field already carries a value, force the group
  // visible regardless of the manual toggle — a collapsed group must never
  // hide data the user already typed.
  const hasFilledSecondaryValue = SECONDARY_FIELDS.some(
    (f) => (form[f.id] ?? "").trim() !== "",
  );
  const secondaryVisible = secondaryOpen || hasFilledSecondaryValue;

  const onFieldChange = (fieldId: string, value: string) => {
    setForm((s) => ({ ...s, [fieldId]: value }));
    setFieldErrors((prev) => {
      if (!prev[fieldId]) return prev;
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  };

  const renderField = (f: (typeof MEASURE_FIELDS)[number]) => (
    <div key={f.id} className="space-y-1">
      {/* WCAG 1.3.1: explicit label association via htmlFor/id. */}
      <label htmlFor={`measure-input-${f.id}`} className={lbl}>
        {f.label} · {f.unit}
      </label>
      <input
        id={`measure-input-${f.id}`}
        className={inp}
        // `type="text"` навмисно: `type="number"` мовчки відкидає кому як
        // десятковий роздільник — UA-мобільна клавіатура дає «82,5»,
        // браузер обнуляє `value` ще ДО того, як цей компонент побачить
        // подію, тож нормалізація коми на сабміті нижче
        // (`v.replace(",", ".")`) ставала недосяжною: значення губилось
        // раніше. `inputMode="decimal"` усе одно піднімає числову
        // клавіатуру. Межі f.min/f.max — той самий підхід, що й у
        // ManualExpenseAmountSection — лишаються enforced нижче:
        // zod-схема (`measurementSchema`) на сабміті і повторний clamp у
        // `useMeasurements.addEntry`.
        type="text"
        inputMode="decimal"
        placeholder="—"
        value={form[f.id] ?? ""}
        aria-invalid={fieldErrors[f.id] ? true : undefined}
        aria-describedby={
          fieldErrors[f.id] ? `measure-error-${f.id}` : undefined
        }
        onChange={(e) => onFieldChange(f.id, e.target.value)}
      />
      {fieldErrors[f.id] && (
        <p
          id={`measure-error-${f.id}`}
          role="alert"
          className="text-style-caption text-danger-strong dark:text-danger"
        >
          {fieldErrors[f.id]}
        </p>
      )}
    </div>
  );

  // F4: forbid saving a fully-empty form — button disabled until at least
  // one field has a parseable numeric value. NaN inputs ("abc") are
  // stripped before persisting so a stray entry cannot pollute the
  // snapshot.
  const parsedPayload: Record<string, number> = {};
  for (const f of MEASURE_FIELDS) {
    const v = (form[f.id] || "").trim();
    if (!v) continue;
    const n = Number(v.replace(",", "."));
    if (Number.isFinite(n)) parsedPayload[f.id] = n;
  }
  const hasAnyValue = Object.keys(parsedPayload).length > 0;

  const handleSubmit = () => {
    if (!hasAnyValue) return;
    // F3: run the zod range schema and surface first error via toast so
    // out-of-range PII (negative weight, 99 999 kg, etc.) can never reach
    // the SQLite dual-write pipeline.
    const validation = measurementSchema.safeParse(parsedPayload);
    if (!validation.success) {
      const next: Record<string, string> = {};
      for (const issue of validation.error.issues) {
        const key = issue.path[0];
        if (typeof key !== "string") continue;
        next[key] ??=
          issue.message || messages.fizruk.measurements.invalidValue;
      }
      setFieldErrors(next);
      return;
    }
    setFieldErrors({});
    addEntry(parsedPayload);
    setForm(Object.fromEntries(MEASURE_FIELDS.map((f) => [f.id, ""])));
    setSecondaryOpen(false);
  };

  return (
    <Card radius="lg">
      <SectionHeading as="div" size="xs" className="mb-3" variant="fizruk">
        {messages.fizruk.measurements.addHeading}
      </SectionHeading>
      <div className="grid grid-cols-2 gap-2">
        {PRIMARY_FIELDS.map(renderField)}
      </div>

      {/*
        Тогл ховається, коли якесь із додаткових полів уже заповнене.
        Видимість там рахується як `secondaryOpen || hasFilledSecondaryValue`
        — тобто в цьому стані згорнути НЕМОЖЛИВО за задумом (інакше
        введене зникло б з очей). Лишити кнопку означало б показувати
        «Менше полів», яке на тап не робить нічого — а це читається як
        зламана кнопка, а не як захист даних.
      */}
      {!hasFilledSecondaryValue && (
        <button
          type="button"
          className="focus-ring touch-target mt-3 -mx-1 px-1 rounded-lg inline-flex items-center text-style-caption text-fizruk-strong dark:text-fizruk font-semibold hover:underline"
          aria-expanded={secondaryVisible}
          onClick={() => setSecondaryOpen((o) => !o)}
        >
          {secondaryVisible
            ? messages.fizruk.measurements.addFormFewerFields
            : messages.fizruk.measurements.addFormMoreFields}
        </button>
      )}

      {secondaryVisible && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          {SECONDARY_FIELDS.map(renderField)}
        </div>
      )}

      <div className="mt-3">
        <button
          type="button"
          disabled={!hasAnyValue}
          aria-disabled={!hasAnyValue}
          // eslint-disable-next-line sergeant-design/no-raw-type-size -- розмір КОНТРОЛА: висота кнопки тримається на парі `text-base` + `py-4`; перенесено дослівно з `Measurements.tsx`.
          className="focus-ring w-full py-4 rounded-full font-bold text-base bg-fizruk-strong text-white transition-[background-color,box-shadow,opacity,transform] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
          onClick={handleSubmit}
        >
          {messages.fizruk.measurements.submit}
        </button>
      </div>
    </Card>
  );
}
