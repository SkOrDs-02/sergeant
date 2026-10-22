/**
 * Last validated: 2026-10-22
 * Status: Active
 *
 * Запасні цілі фокуса для тригерів, які розмонтовуються (аудит 2026-10-01,
 * ux-08, WCAG 2.4.3).
 *
 * `useDialogFocusTrap` повертає фокус на елемент, що мав його до відкриття
 * діалогу. Якщо цей елемент уже відсутній у DOM (порожній стан зник після
 * створення першої звички, діалог відкрився сам без жесту, рядок видалено),
 * фокус падає на `<body>`. Місце, куди він має піти натомість, знає
 * викликач, а не хук, тож викликач позначає його `data-focus-fallback` і
 * передає діалогу `returnFocusFallback`.
 */

export const FOCUS_FALLBACK_ATTR = "data-focus-fallback";
const ROW_ATTR = "data-focus-row";
const ROW_TARGET_ATTR = "data-focus-row-target";

/**
 * Пропси для елемента-запасної цілі. Не-інтерактивний елемент (заголовок)
 * додатково мусить мати `tabIndex={-1}`, інакше `focus()` на ньому нічого
 * не зробить.
 */
export function focusFallbackProps(name: string): Record<string, string> {
  return { [FOCUS_FALLBACK_ATTR]: name };
}

/** Фабрика для `returnFocusFallback`: шукає ціль у момент закриття. */
export function focusFallbackTarget(name: string): () => HTMLElement | null {
  return () =>
    typeof document === "undefined"
      ? null
      : document.querySelector<HTMLElement>(
          `[${FOCUS_FALLBACK_ATTR}="${name}"]`,
        );
}

/** Пропси рядка списку, який можна видалити (див. `focusNeighborRow`). */
export const focusRowProps: Record<string, string> = { [ROW_ATTR]: "" };

/** Пропси основної кнопки рядка: саме її дістає `focusNeighborRow`. */
export const focusRowTargetProps: Record<string, string> = {
  [ROW_TARGET_ATTR]: "",
};

function isNativelyFocusable(el: HTMLElement): boolean {
  return ["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"].includes(el.tagName);
}

/**
 * Перед видаленням рядка переносить фокус на сусідній рядок (наступний,
 * інакше попередній), а коли рядків більше немає, на найближчий контейнер із
 * `data-focus-fallback` або діалог. Викликай ДО самого видалення: кнопка, на
 * якій стояв фокус, зникне разом із рядком, і браузер скине його на `<body>`.
 *
 * Фокус ставиться на `[data-focus-row-target]` усередині сусіда (основна
 * кнопка рядка), а якщо такої нема, на сам рядок.
 */
export function focusNeighborRow(from: HTMLElement | null): void {
  if (!from || typeof document === "undefined") return;
  const row = from.closest<HTMLElement>(`[${ROW_ATTR}]`);
  const scope =
    from.closest<HTMLElement>(`[${FOCUS_FALLBACK_ATTR}]`) ??
    from.closest<HTMLElement>('[role="dialog"]');
  const rows = Array.from(
    (scope ?? document).querySelectorAll<HTMLElement>(`[${ROW_ATTR}]`),
  );
  const at = row ? rows.indexOf(row) : -1;
  const neighbor = at >= 0 ? (rows[at + 1] ?? rows[at - 1]) : undefined;
  const target =
    neighbor?.querySelector<HTMLElement>(
      `[${ROW_TARGET_ATTR}]:not([disabled])`,
    ) ??
    neighbor ??
    scope;
  if (!target) return;
  if (!target.hasAttribute("tabindex") && !isNativelyFocusable(target)) {
    target.setAttribute("tabindex", "-1");
  }
  target.focus({ preventScroll: true });
}
