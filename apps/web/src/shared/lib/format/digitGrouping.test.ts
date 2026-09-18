// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  GROUP_SEPARATOR as SEP,
  applyDigitGrouping,
  groupIntegerDigits,
} from "./digitGrouping";
import { normalizeAmountInput } from "./amount";
import { normalizeDecimalInput } from "./numberInput";
import { GROUP_SEPARATOR as SHARED_SEP } from "@sergeant/shared";

/** Поле у стані «показано `value`, курсор на `caret`». */
function field(value: string, caret = value.length): HTMLInputElement {
  const el = document.createElement("input");
  el.type = "text";
  el.value = value;
  el.setSelectionRange(caret, caret);
  return el;
}

describe("роздільник", () => {
  it("той самий, що й у форматері дисплея — інакше поле і Money розійдуться", () => {
    // Константа продубльована навмисно (див. докстрінг `digitGrouping.ts`),
    // тож парність тримає цей тест, а не тайпчекер.
    expect(SEP).toBe(SHARED_SEP);
  });

  it("НЕ вузький U+202F: саме його непомітність і була скаргою", () => {
    expect(SEP).toBe(" ");
    expect(groupIntegerDigits("1234567")).not.toContain(" ");
  });
});

describe("groupIntegerDigits", () => {
  it("розставляє роздільник кожні три цифри з кінця", () => {
    expect(groupIntegerDigits("80000")).toBe(`80${SEP}000`);
    expect(groupIntegerDigits("1234567")).toBe(`1${SEP}234${SEP}567`);
  });

  it("лишає короткі числа недоторканими", () => {
    expect(groupIntegerDigits("")).toBe("");
    expect(groupIntegerDigits("5")).toBe("5");
    expect(groupIntegerDigits("999")).toBe("999");
  });

  it("групує лише цілу частину", () => {
    expect(groupIntegerDigits("12500,50")).toBe(`12${SEP}500,50`);
    expect(groupIntegerDigits("1234.5")).toBe(`1${SEP}234.5`);
  });

  it("не зʼїдає незавершену кому — заради неї існує useDecimalDraft", () => {
    expect(groupIntegerDigits("82,")).toBe("82,");
    expect(groupIntegerDigits("1000,")).toBe(`1${SEP}000,`);
  });

  it("перегруповує вже розділений ввід замість подвоєння роздільників", () => {
    expect(groupIntegerDigits(`1${SEP}234`)).toBe(`1${SEP}234`);
    expect(groupIntegerDigits("1 234 5")).toBe(`12${SEP}345`);
  });

  it("парсери знімають наш роздільник — значення в сторі не змінюється", () => {
    const grouped = groupIntegerDigits("1234567,89");
    expect(normalizeAmountInput(grouped)).toBe("1234567.89");
    expect(normalizeDecimalInput(grouped)).toBe("1234567.89");
  });
});

describe("applyDigitGrouping — каретка", () => {
  it("тримає курсор після набраної цифри, а не в кінці рядка", () => {
    // «800» + «0» у кінці → «8 000», курсор лишається після 4-ї цифри.
    const el = field("8000");
    applyDigitGrouping(el, "800");
    expect(el.value).toBe(`8${SEP}000`);
    expect(el.selectionStart).toBe(5);
  });

  it("не перестрибує через вставлений роздільник при вводі всередині", () => {
    // «80 000», курсор після «8», набрано «5» → «850 000».
    const el = field("850000", 2);
    applyDigitGrouping(el, `80${SEP}000`);
    expect(el.value).toBe(`850${SEP}000`);
    expect(el.selectionStart).toBe(2);
  });

  it("Backspace на роздільнику стирає цифру перед ним, а не вертає пробіл", () => {
    // «80 000», курсор після роздільника, Backspace прибрав саме його.
    const el = field("80000", 2);
    applyDigitGrouping(el, `80${SEP}000`);
    expect(el.value).toBe(`8${SEP}000`);
    expect(el.selectionStart).toBe(1);
  });

  it("звичайний Backspace на цифрі лишається звичайним", () => {
    const el = field("8000", 4);
    applyDigitGrouping(el, `80${SEP}000`);
    expect(el.value).toBe(`8${SEP}000`);
    expect(el.selectionStart).toBe(5);
  });

  it("курсор у дробовій частині не збивається групуванням цілої", () => {
    const el = field("12500,5", 7);
    applyDigitGrouping(el, "12500,");
    expect(el.value).toBe(`12${SEP}500,5`);
    expect(el.selectionStart).toBe(8);
  });

  it("зайвий пробіл посеред числа не лишається в полі", () => {
    // Ре-рендеру тут не буде — текст стану той самий, тож DOM правимо самі.
    const el = field("8 0", 2);
    applyDigitGrouping(el, "80");
    expect(el.value).toBe("80");
    expect(el.selectionStart).toBe(1);
  });
});
