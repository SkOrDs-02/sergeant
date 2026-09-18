// @vitest-environment jsdom
/**
 * Тести `MoneyInput` на СПРАВЖНЬОМУ React-рендері, а не на хуку окремо.
 *
 * Тут перевіряється те, чого `renderHook` показати не може: групування
 * пише в `value` вузла просто в обробнику, а React після цього ще й
 * перемальовує контрольований інпут. Якщо ReactDOM вирішить перезаписати
 * `value`, каретка поїде в кінець рядка — рівно та регресія, через яку
 * форматування «на кожне натискання» зазвичай і не роблять.
 */
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MoneyInput } from "./MoneyInput";

const SEP = "\u00a0";

function Harness() {
  const [value, setValue] = useState<number | string>("");
  return (
    <MoneyInput
      aria-label="Сума"
      value={value}
      onValueChange={(next) => setValue(next == null ? "" : next)}
    />
  );
}

const nativeValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value",
)?.set as (this: HTMLInputElement, value: string) => void;

/**
 * Те, що робить браузер перед `change`: пише значення повз React-трекер і
 * ставить каретку. Без нативного сеттера React вважав би подію відлунням
 * власного рендеру й не викликав би обробник.
 */
function browserInput(el: HTMLInputElement, value: string, caret: number) {
  nativeValueSetter.call(el, value);
  el.setSelectionRange(caret, caret);
  fireEvent.change(el);
}

/** Набір символа в поточній позиції каретки. */
function typeChar(el: HTMLInputElement, char: string) {
  const at = el.selectionStart ?? el.value.length;
  browserInput(el, el.value.slice(0, at) + char + el.value.slice(at), at + 1);
}

function amountField() {
  render(<Harness />);
  return screen.getByLabelText("Сума") as HTMLInputElement;
}

describe("MoneyInput", () => {
  it("групує розряди під час набору й лишає каретку в кінці", () => {
    const el = amountField();

    for (const char of "80000") typeChar(el, char);

    expect(el.value).toBe(`80${SEP}000`);
    expect(el.selectionStart).toBe(6);
  });

  it("каретка переживає ре-рендер контрольованого поля", () => {
    const el = amountField();

    for (const char of "1234567") typeChar(el, char);

    expect(el.value).toBe(`1${SEP}234${SEP}567`);
    expect(el.selectionStart).toBe(el.value.length);
  });

  it("правка всередині числа не відкидає курсор у кінець", () => {
    const el = amountField();

    for (const char of "80000") typeChar(el, char);
    el.setSelectionRange(1, 1);
    typeChar(el, "5");

    expect(el.value).toBe(`850${SEP}000`);
    expect(el.selectionStart).toBe(2);
  });

  it("Backspace на роздільнику стирає цифру, а не вертає пробіл", () => {
    const el = amountField();

    for (const char of "80000") typeChar(el, char);
    // Курсор одразу за роздільником; Backspace прибирає саме його.
    browserInput(el, "80000", 2);

    expect(el.value).toBe(`8${SEP}000`);
    expect(el.selectionStart).toBe(1);
  });

  it("порожнє поле лишається порожнім, а не стає нулем", () => {
    const el = amountField();

    for (const char of "500") typeChar(el, char);
    browserInput(el, "", 0);

    expect(el.value).toBe("");
  });
});
