/**
 * Last validated: 2026-08-22
 * Status: Active
 *
 * Групування розрядів для грошових полів, які тримає `react-hook-form`.
 *
 * Контрольовані поля користуються `useDecimalDraft({ group: true })` (або
 * готовим `MoneyInput`), але під `register` значення живе в DOM, а не в
 * React-стані. Тому тут перегруповується сам елемент, а RHF отримує подію
 * вже з відформатованим `value` — схеми це переживають, бо
 * `parseAmountToMinor` знімає роздільники нарівні з комою.
 *
 * Попереднє значення тримає ref: воно потрібне рівно для Backspace на
 * роздільнику (див. `applyDigitGrouping`). Після програмного `setValue`
 * ref на крок відстане — найгірше, що з цього вийде, це один Backspace зі
 * старою семантикою.
 */
import { useRef } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { applyDigitGrouping } from "../lib/format/digitGrouping";

export function useGroupedAmountField<Name extends string>(
  field: UseFormRegisterReturn<Name>,
): UseFormRegisterReturn<Name> {
  const previous = useRef("");
  // Тип бере RHF-івський `ChangeHandler`, а не React-івський `ChangeEvent`:
  // під `register` подія приходить у власному звуженому вигляді.
  const onChange: UseFormRegisterReturn<Name>["onChange"] = (event) => {
    previous.current = applyDigitGrouping(
      event.target as HTMLInputElement,
      previous.current,
    );
    return field.onChange(event);
  };
  return { ...field, onChange };
}
