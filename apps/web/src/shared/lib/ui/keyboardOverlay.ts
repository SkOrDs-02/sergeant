/**
 * Last validated: 2026-08-16
 * Status: Active
 *
 * Геометрія `position: fixed` оверлея під відкритою софт-клавіатурою —
 * для діалогів, які НЕ побудовані на `Sheet`.
 *
 * `Sheet` тримає власну геометрію (`marginBottom` на панелі + `maxHeight`)
 * і сюди не заходить. Решта fixed-оверлеїв із полями вводу
 * (`Modal` у центрованій гілці, `InputDialog`, `DeleteAccountDialog`,
 * `CommandPaletteUI`) до 2026-08-16 не робили з клавіатурою нічого:
 * поле просто опинялось під нею, а видимим його робив **пан visual
 * viewport** від самого iOS. Щойно `useKeyboardAwareOverlay` починає
 * той пан компенсувати, цей механізм зникає — тож компенсацію не можна
 * вмикати без власної геометрії, інакше поле лишиться під клавіатурою
 * назавжди. Ці дві правки ходять парою.
 *
 * Механіка навмисно одна на всі три вирівнювання: `paddingBottom` на
 * `inset-0` контейнері звужує flex-бокс до видимої смуги над
 * клавіатурою, і далі `items-end` / `items-center` / `items-start`
 * самі роблять правильну річ — притискають, центрують або лишають на
 * місці вже всередині цієї смуги.
 */
import type { CSSProperties } from "react";

export interface KeyboardOverlayStyles {
  /** На `position: fixed inset-0` контейнері оверлея. */
  container: CSSProperties | undefined;
  /** На панелі діалогу; вимагає власного скрол-регіону всередині. */
  panel: CSSProperties | undefined;
}

const NONE: KeyboardOverlayStyles = { container: undefined, panel: undefined };

export function keyboardOverlayStyles(
  kbInsetPx: number,
): KeyboardOverlayStyles {
  if (kbInsetPx <= 0) return NONE;
  return {
    container: { paddingBottom: kbInsetPx },
    // `100dvh` на iOS не враховує клавіатуру, тож віднімаємо інсет
    // самі. Верхній запас — notch/статус-бар, з мінімумом на пристроях
    // без вирізу (те саме `max(env(...), …)`, що й у `Sheet`).
    panel: {
      maxHeight: `calc(100dvh - ${kbInsetPx}px - max(env(safe-area-inset-top, 0px), 1rem))`,
    },
  };
}
