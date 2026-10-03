/**
 * Last validated: 2026-09-03
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

/**
 * Заплановані, але ще не виконані відкати.
 *
 * AI-DANGER: перевірки «мій запис і досі верхній» самої по собі НЕ досить —
 * вона залежить від того, хто встиг перший. Коли аркуш закривається й тут же
 * відкривається діалог, можливі два порядки: діалог пушить свій запис до того,
 * як спрацює наш таймер (тоді перевірка рятує), або після (тоді перевірка
 * бачить наш власний запис, робить `back()` і збиває щойно відкритий діалог).
 * Локально випадав перший порядок, у CI — другий, і тест падав уже на кроці
 * збереження. Тому будь-який НОВИЙ екземпляр гасить усі заплановані відкати:
 * якщо зверху ліг чужий діалог, наш запис уже не наша справа.
 */
const pendingRollbacks = new Set<ReturnType<typeof setTimeout>>();

/**
 * Затримка перед відкатом.
 *
 * ⚠️ Інженерний дефолт. Це не косметика й не «на всяк випадок»: React Router 7
 * комітить навігацію через `startTransition`, і на найближчих тактах вона ще
 * НЕ застосована. На 0 мс відкат стабільно випереджав коміт і скасовував
 * перехід («Перейти на Premium» лишав користувача на `/insights`); на 32 мс тест
 * ставав flaky — проходив лише з ретраю. 150 мс дає транзиції завершитись із
 * запасом і лишається невідчутним: натиснути Back швидше людина не встигає.
 */
const ROLLBACK_DEFER_MS = 150;

function cancelPendingRollbacks(): void {
  for (const timer of pendingRollbacks) clearTimeout(timer);
  pendingRollbacks.clear();
}

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

    // Новий діалог перебирає верхній запис на себе — усе, що хтось запланував
    // відкотити, більше не актуальне.
    cancelPendingRollbacks();

    let ownsEntry = true;
    instanceCounter += 1;
    const entryId = instanceCounter;
    // Адреса на момент push-у: якщо до відкату вона змінилась, застосунок
    // кудись перейшов, і чіпати історію вже не можна.
    const hrefAtPush = window.location.href;
    window.history.pushState({ [MARKER]: entryId }, "");

    const handlePopState = (event: PopStateEvent) => {
      // Стос діалогів: `popstate` летить УСІМ відкритим. Коли вкладений аркуш
      // (пікер заняття над формою запису) закривається і відкочує свій
      // запис, верхнім стає запис зовнішнього — і той не повинен закритись
      // разом із вкладеним. Свій запис ще зверху = це не наш Back. Читаємо
      // `event.state`, а не `history.state`: тести диспатчать подію вручну.
      const state = event.state as Record<string, unknown> | null;
      if (state && state[MARKER] === entryId) return;
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
      // `back()` зʼїдав щойно запушений запис НОВОГО діалога, і той
      // закривався сам собою — користувач бачив порожню сторінку замість
      // форми редагування. Ловилось `deep-module-crud.spec.ts`, полагоджено
      // й перевірено локальним прогоном smoke-стека 2026-08-02.
      //
      // Відкладання окремо важливе через React Router 7: він навігує через
      // `startTransition`, тож синхронне втручання в історію може перервати
      // транзицію ще до коміту маршруту (те саме явище описане в
      // `useBrowserLocation`).
      if (!ownsEntry) return;
      // Межа кадру, а не `setTimeout(0)`: React Router 7 комітить навігацію
      // через `startTransition`, і на наступному ж такті вона ЩЕ не
      // застосована — `setTimeout(0)` встигав відкотити її до коміту, і
      // «Перейти на Premium» лишав користувача на тій самій сторінці
      // (`paywall-locale-journeys.spec.ts`). Кадр дає транзиції завершитись.
      const timer = setTimeout(() => {
        pendingRollbacks.delete(timer);
        // Vitest/jsdom: таймер останнього закриття у тест-файлі може
        // спрацювати вже після teardown середовища, коли глобального
        // `window` не існує — тоді відкат безглуздий (у браузері window
        // є завжди, прод-поведінка не змінюється).
        if (typeof window === "undefined") return;
        // Адреса змінилась — діалог закрився ЧЕРЕЗ навігацію, і його запис
        // уже не верхній у жодному корисному сенсі.
        if (window.location.href !== hrefAtPush) return;
        const state = window.history.state as Record<string, unknown> | null;
        if (state && state[MARKER] === entryId) window.history.back();
      }, ROLLBACK_DEFER_MS);
      pendingRollbacks.add(timer);
    };
  }, [open]);
}
