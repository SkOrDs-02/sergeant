/**
 * Last validated: 2026-10-22
 * Status: Active
 *
 * Тримає фокус усередині аркуша їжі при зміні кроку (аудит 2026-10-01,
 * ux-08, WCAG 2.4.3).
 *
 * Крок «Звідки страва?» ховається атрибутом `hidden`, а кнопка «назад» у
 * заголовку зникає на першому кроці. Елемент, що мав фокус (картка
 * результату пошуку, «Далі», стрілка «назад»), після переходу невидимий або
 * розмонтований, і браузер скидає фокус на `<body>`, поза діалог. Тоді
 * переносимо його на сам діалог: це ті самі `tabindex="-1"` і `focus()`, що
 * `useDialogFocusTrap` робить для діалогу без фокусованих елементів.
 *
 * Не чіпаємо відкриття аркуша (там початковий фокус належить пастці) і
 * випадок, коли фокус уже всередині діалогу.
 */
import { useEffect, useRef, type RefObject } from "react";

export function useStepFocusKeeper(
  open: boolean,
  step: string,
  anchorRef: RefObject<HTMLElement | null>,
): void {
  const prev = useRef({ open, step });
  useEffect(() => {
    const before = prev.current;
    prev.current = { open, step };
    if (!open || !before.open || before.step === step) return;
    const panel = anchorRef.current?.closest<HTMLElement>('[role="dialog"]');
    if (!panel) return;
    const active = document.activeElement;
    // Елемент у `hidden`-предку ще може бути `activeElement` до того, як
    // браузер скине фокус (фіксап стається при рендері), тож рахуємо його
    // втраченим уже зараз.
    if (
      active &&
      active !== document.body &&
      panel.contains(active) &&
      !active.closest("[hidden]")
    ) {
      return;
    }
    if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");
    panel.focus({ preventScroll: true });
  }, [open, step, anchorRef]);
}
