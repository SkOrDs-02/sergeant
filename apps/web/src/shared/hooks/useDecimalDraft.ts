/**
 * Last validated: 2026-08-16
 * Status: Active
 *
 * Контрольоване десяткове поле, яке не зʼїдає ввід під пальцями.
 *
 * # Навіщо
 *
 * Патерн `value={state} onChange={e => setState(clampNumericInput(e.target.value, max))}`
 * виглядає нешкідливо і ламає рівно один сценарій — той, яким користуються
 * українці. Клемп повертає `number`, тож проміжний стан «82,» нормалізується
 * до `82`, поле перемальовується без коми, і наступна цифра дає `825` замість
 * `82,5`. Дріб зникає без жодного натяку.
 *
 * `type="number"` цього не рятує, а погіршує: за специфікацією `.value`
 * віддає порожній рядок, щойно вміст перестає бути валідним числом. Кома
 * робить його невалідним, тож обробник бачить `""` і записує `0`. Тому поле
 * має бути `type="text"` + `inputMode="decimal"` — цифрова клавіатура
 * лишається, а сирий текст доїжджає до нас.
 *
 * # Контракт
 *
 * Хук тримає сирий текст, а назовні віддає вже зклемплене число (або `null`
 * для порожнього поля) — щоб решта форми працювала з числами, як і раніше.
 *
 * - Стеля лишається ВИДИМОЮ: якщо клемп справді спрацював, у полі зʼявляється
 *   `max`, а не те, що надрукували. Інакше користувач бачить «99999999», а в
 *   сторі лежить `1000`.
 * - Символи, з яких десяткове число скластись не може (літери, `-`, `e`),
 *   ігноруються на вході — так `type="text"` не втрачає «цифрову» поведінку,
 *   заради якої тут колись і стояв `type="number"`.
 * - Зовнішня зміна значення (скидання форми, підвантажені дані) переписує
 *   чернетку; власне відлуння — ні, інакше кома гасилася б на кожному
 *   натисканні.
 */
import { useCallback, useState } from "react";
import type { ChangeEvent } from "react";
import {
  clampNumericInput,
  normalizeDecimalInput,
} from "../lib/format/numberInput";

/**
 * Усе, з чого може складатись десятковий ввід: цифри, обидва десяткові
 * роздільники і роздільники груп із `normalizeDecimalInput`. Свідомо БЕЗ
 * `-` та `e` — від'ємних тут не буває, а експоненту клемп все одно читає
 * як «завелике», тож дозволяти її друкувати нема сенсу.
 */
const DECIMAL_DRAFT_ALLOWED = /^[\d.,\s']*$/;

export interface DecimalDraft {
  /** Сирий текст користувача — для `value` контрольованого інпута. */
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

/** Числове представлення значення поля; `null` — поле порожнє. */
function toNumberOrNull(
  raw: number | string | null | undefined,
): number | null {
  if (raw == null || raw === "") return null;
  const value =
    typeof raw === "number" ? raw : Number(normalizeDecimalInput(raw));
  return Number.isFinite(value) ? value : null;
}

function toText(value: number | null): string {
  return value == null ? "" : String(value);
}

/**
 * @param committed Значення, що вже лежить у стані форми.
 * @param max Стеля; те саме число, що йшло у `clampNumericInput`.
 * @param onCommit Викликається на кожну зміну: зклемплене число або `null`
 *   для порожнього поля. Порожнє — це НЕ `0`: інакше поле неможливо очистити.
 */
export function useDecimalDraft(
  committed: number | string | null | undefined,
  max: number,
  onCommit: (value: number | null) => void,
): DecimalDraft {
  const [text, setText] = useState(() => toText(toNumberOrNull(committed)));
  // Попереднє значення тримає СТАН, а не ref: React-патерн «adjusting state
  // when props change» саме такий, і `react-hooks/refs` справедливо
  // забороняє читати чи писати ref у фазі рендера.
  const [lastCommitted, setLastCommitted] = useState(committed);

  // Синхронізація на зовнішню зміну. Порівнюємо ЧИСЛА, а не рядки: поки
  // чернетка «82,» і значення `82` означають те саме, переписувати її не
  // можна — саме це й гасило б кому.
  if (lastCommitted !== committed) {
    setLastCommitted(committed);
    const external = toNumberOrNull(committed);
    if (external !== toNumberOrNull(text)) setText(toText(external));
  }

  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;
      if (!DECIMAL_DRAFT_ALLOWED.test(raw)) return;
      if (normalizeDecimalInput(raw) === "") {
        setText(raw);
        onCommit(null);
        return;
      }
      const clamped = clampNumericInput(raw, max);
      const parsed = Number(normalizeDecimalInput(raw));
      // Показуємо стелю, тільки якщо вона справді спрацювала. У решті
      // випадків у полі лишається те, що надрукував користувач, — разом із
      // незавершеною комою.
      setText(
        Number.isFinite(parsed) && parsed !== clamped ? toText(clamped) : raw,
      );
      onCommit(clamped);
    },
    [max, onCommit],
  );

  return { value: text, onChange };
}
