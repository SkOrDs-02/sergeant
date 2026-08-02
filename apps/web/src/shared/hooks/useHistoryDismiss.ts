/**
 * Last validated: 2026-08-01
 * Status: Active
 *
 * Makes the browser Back button close an open dialog instead of leaving
 * the route.
 *
 * On Android and in an installed PWA, Back is the primary dismiss gesture.
 * Without this, opening a sheet and pressing Back navigates the user out of
 * the module entirely and loses the half-filled form.
 *
 * Contract: while `open`, one history entry belongs to this dialog.
 *   - `popstate` (Back pressed)      → `onClose()`, entry already consumed
 *   - closed any other way           → we pop our own entry via `history.back()`
 *
 * Multi-step sheets are one level by design (see the beta-input-boundaries
 * spec): Back closes the whole sheet, it does not step back inside it.
 */
import { useEffect, useRef } from "react";

const MARKER = "sergeantDialog";

/**
 * Лічильник екземплярів: кожен діалог позначає свій запис історії власним id
 * і на закритті відкочує його ЛИШЕ якщо той і досі верхній.
 */
let instanceCounter = 0;

export function useHistoryDismiss(open: boolean, onClose: () => void): void {
  // Keep the latest callback without re-running the effect — a caller
  // passing an inline arrow would otherwise push a new entry every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined" || !window.history) return;

    let ownsEntry = true;
    instanceCounter += 1;
    const entryId = instanceCounter;
    window.history.pushState({ [MARKER]: entryId }, "");

    const handlePopState = () => {
      // The entry is already gone — don't try to pop it on cleanup.
      ownsEntry = false;
      onCloseRef.current();
    };
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      // Closed via the close button / overlay / Escape — our entry is
      // still on the stack and would make Back a no-op for the user.
      //
      // AI-DANGER: відкат МАЄ бути і відкладеним, і перевіреним на власність.
      // Раніше він робився синхронно й наосліп, і це ламало реальну
      // поверхню: діалог, що відкриває інший діалог у тому ж такті
      // (детальний аркуш звички → «Редагувати»). Аркуш закривався, його
      // `back()` з'їдав щойно запушений запис НОВОГО діалога, і той
      // закривався сам собою — користувач бачив порожню сторінку замість
      // форми редагування. Ловилось `deep-module-crud.spec.ts`, полагоджено
      // й перевірено локальним прогоном smoke-стека 2026-08-02.
      //
      // Відкладання окремо важливе через React Router 7: він навігує через
      // `startTransition`, тож синхронне втручання в історію може перервати
      // транзицію ще до коміту маршруту (те саме явище описане в
      // `useBrowserLocation`).
      if (!ownsEntry) return;
      setTimeout(() => {
        const state = window.history.state as Record<string, unknown> | null;
        if (state && state[MARKER] === entryId) window.history.back();
      }, 0);
    };
  }, [open]);
}
