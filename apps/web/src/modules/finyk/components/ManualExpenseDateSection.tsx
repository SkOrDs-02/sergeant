/**
 * Last validated: 2026-09-15
 * Status: Active
 *
 * Поле дати для {@link ManualExpenseSheet} — однакове для витрати і для
 * надходження. Винесено окремо, щоб аркуш лишався під Hard Rule #18
 * (`max-lines: 600`).
 *
 * **Один дефолт замість трьох варіацій.** Доти поле мало три стани: чіп
 * «Не сьогодні? Змінити дату», під ним стрічка днів, а під нею ще й
 * розкривний нативний пікер. Два з трьох були про одне й те саме — дійти
 * до стрічки, — тож чіп лише додавав крок перед тим, що й так стоїть
 * першим варіантом у списку. Тепер стрічка видима завжди (сьогодні —
 * правий край, під пальцем), а нативний пікер лишається одним фолбеком
 * «Інша дата» для дат, старіших за вікно стрічки.
 *
 * Прихований у `<details>` `input` тримає реєстрацію в react-hook-form і
 * покриває саме цей фолбек. Коли редагований запис має дату ПОЗА вікном
 * стрічки, деталі розкриті одразу: у стрічці такого дня немає, і згорнутий
 * фолбек лишив би людину зі стрічкою без жодного вибраного чіпа.
 *
 * **Нативний `input[type=date]` малюємо через `DateField`, не через сирий
 * `Input`.** У нативного контрола власний intrinsic inline-size, і в
 * flex/grid-контейнері з дефолтним `min-width: auto` комірка слухняно під
 * нього розширюється — поле стає ширшим за екран. `DateField` несе контракт
 * проти цього (`min-w-0` + явний `inline-size: 100%`). Той самий баг уже
 * ловили у формах Фініка і в `LogPastWorkoutSheet`; рецепт —
 * `docs/start/instructions/fix-mobile-horizontal-overflow.md`.
 */
import { useState } from "react";
import type { UseFormRegister } from "react-hook-form";
import {
  DateScrubber,
  isWithinDateScrubberWindow,
} from "@shared/components/ui/DateScrubber";
import { DateField } from "@shared/components/ui/DateField";
import { Label } from "@shared/components/ui/FormField";
import { toKyivISODate } from "@sergeant/shared";
import {
  HARD_MAX_DAY_KEY,
  HARD_MIN_DAY_KEY,
} from "@shared/lib/time/dateBounds";
import { messages } from "@shared/i18n/uk";
import type { ExpenseFormValues } from "./manualExpenseForm";

const copy = messages.finyk.manualExpenseSheet;

export interface ManualExpenseDateSectionProps {
  dateId: string;
  date: string;
  dateError: string | undefined;
  /** Мʼяке вікно: зберігати дозволено, але рік варто перечитати. */
  dateWarning: string | null;
  isSubmitting: boolean;
  onDateChange: (iso: string) => void;
  register: UseFormRegister<ExpenseFormValues>;
}

export function ManualExpenseDateSection({
  dateId,
  date,
  dateError,
  dateWarning,
  isSubmitting,
  onDateChange,
  register,
}: ManualExpenseDateSectionProps) {
  const value = date || toKyivISODate();
  const outOfWindow = !isWithinDateScrubberWindow(value);

  // `null` — «людина ще не чіпала деталі», тож рішення лишається за датою.
  // Явний перемикач людини важливіший і перекриває його. Тримаємо саме
  // override, а не синхронізуючий ефект: аркуш заповнює форму в мікротаску
  // ПІСЛЯ монтування, тож стан, ініціалізований один раз, не побачив би
  // дату редагованого запису.
  const [otherOpenOverride, setOtherOpenOverride] = useState<boolean | null>(
    null,
  );
  const otherOpen = otherOpenOverride ?? outOfWindow;

  return (
    <div>
      <Label htmlFor={dateId}>{copy.dateLabel}</Label>
      <DateScrubber
        aria-label={copy.dateScrubberLabel}
        value={value}
        onChange={onDateChange}
      />
      <details
        className="mt-2"
        open={otherOpen}
        onToggle={(event) => setOtherOpenOverride(event.currentTarget.open)}
      >
        <summary className="text-style-caption text-muted hover:text-text cursor-pointer list-none underline decoration-dotted underline-offset-2">
          {copy.dateOther}
        </summary>
        <DateField
          id={dateId}
          className="mt-2"
          // Мітка секції вище стоїть над стрічкою, а не над цим полем, тож
          // власне імʼя контролу задаємо явно — інакше `DateField` підставив
          // би службове «Обери дату».
          aria-label={copy.dateLabel}
          value={value}
          // Аркуш рахує і помилку, і мʼяке попередження сам (`dateWarning`
          // нижче) — вбудована звірка меж дублювала б їх.
          bounded={false}
          min={HARD_MIN_DAY_KEY}
          max={HARD_MAX_DAY_KEY}
          error={!!dateError}
          helperText={dateError ?? undefined}
          disabled={isSubmitting}
          {...register("date")}
        />
      </details>
      {dateWarning ? (
        <p className="mt-2 text-style-caption text-warning-strong dark:text-warning">
          {dateWarning}
        </p>
      ) : null}
    </div>
  );
}
