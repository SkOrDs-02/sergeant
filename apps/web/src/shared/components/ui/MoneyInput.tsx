/**
 * Last validated: 2026-08-22
 * Status: Active
 *
 * Гривневе поле вводу: те саме, що `Input`, але з групуванням розрядів під
 * час набору («80000» → «80 000») і без пасток `type="number"`.
 *
 * Чому не проп на самому `Input`: група потрібна разом із конкретним
 * контрактом значення — назовні їде ЧИСЛО (або `null` для порожнього), а
 * не сирий рядок. `Input` лишається тонким і нічого не знає про гроші.
 *
 * `type="text"` тут обовʼязковий, а не стильова примха: під `type="number"`
 * будь-який роздільник робить значення невалідним, і `.value` віддає
 * порожній рядок — те саме, через що колись зникала кома (див.
 * `useDecimalDraft`). `inputMode="decimal"` лишає цифрову клавіатуру.
 */
import { Input, type InputProps } from "./Input";
import { useDecimalDraft } from "../../hooks/useDecimalDraft";
import { MAX_AMOUNT_HRYVNIA } from "../../lib/format/amount";

export interface MoneyInputProps extends Omit<
  InputProps,
  "value" | "onChange" | "type" | "inputMode" | "defaultValue"
> {
  /** Поточна сума у гривнях; порожнє поле — `""`, `null` або `undefined`. */
  value: number | string | null | undefined;
  /** Отримує зклемплене число або `null` для порожнього поля. */
  onValueChange: (value: number | null) => void;
  /** Стеля; за замовчуванням — гривнева межа домену. */
  max?: number | undefined;
}

export function MoneyInput({
  value,
  onValueChange,
  max = MAX_AMOUNT_HRYVNIA,
  ...rest
}: MoneyInputProps) {
  const draft = useDecimalDraft(value, max, onValueChange, { group: true });
  return (
    <Input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={draft.value}
      onChange={draft.onChange}
    />
  );
}
