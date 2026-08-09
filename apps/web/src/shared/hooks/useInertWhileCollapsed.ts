/**
 * Last validated: 2026-08-09
 * Status: Active
 */
import { useLayoutEffect, useRef } from "react";

/**
 * Прибирає згорнутий вміст дисклоужера з tab-порядку і дерева доступності.
 *
 * L-7 (аудит Профілю і Налаштувань, 2026-08-08). Обидва дисклоужери репо —
 * `SettingsGroup` (`core/settings/SettingsPrimitives.tsx`) і
 * `CollapsibleSection` (`shared/components/ui/CollapsibleSection.tsx`) —
 * ховають вміст ВІЗУАЛЬНО (`grid-rows-[0fr] overflow-hidden`), але
 * лишають піддерево змонтованим. Без цього хука Tab від заголовка
 * провалювався у приховані поля пароля, список сесій і кнопку «Видалити
 * акаунт», де Enter наосліп відкривав діалог видалення.
 *
 * **Чому `inert`, а не `hidden`.** `hidden` — це `display: none`, і він
 * ламає анімацію `grid-template-rows`: не можна анімувати висоту
 * елемента, якого немає в layout-і. `inert` лишає вміст видимим і
 * анімованим, але прибирає піддерево з фокусу й a11y-дерева — саме туди,
 * куди й треба.
 *
 * **Чому `aria-hidden` ПОРУЧ із `inert`.** Той самий канонічний парний
 * патерн, що в `useDialogFocusTrap.ts` (background-inert manager): рушії
 * старіші за Safari 15.5 / Firefox 112 не знають `inert` узагалі, і без
 * `aria-hidden` скрінрідер на них і далі озвучував би згорнутий вміст.
 *
 * **Чому `useLayoutEffect`, а не `useEffect` чи `transitionend`.** Атрибут
 * має зникнути СИНХРОННО з рендером, що вмикає розкриття, до першого
 * пейнту. Інакше анімація вже стартувала видимо, а перше натискання Tab
 * одразу після кліку ще провалюється у ще-inert піддерево — кадр із
 * видимим, але не focus-able вмістом.
 *
 * **Чому спільний хук, а не копія в кожному файлі.** До 2026-08-09 ця
 * логіка жила двічі — приватним хуком у `SettingsPrimitives.tsx` і тим
 * самим `useLayoutEffect` інлайном у `CollapsibleSection.tsx`. Розходження
 * між копіями не впало б жодним тестом і не було б видно на екрані: одна
 * з двох поверхонь просто тихо втратила б гарантію tab-порядку. §6 боргу
 * того ж аудиту («два collapsible-примітиви») бив саме сюди — не в те, що
 * компонентів два, а в те, що інваріант доступності в них окремий.
 *
 * Повертає ref, який треба повісити на контейнер ВМІСТУ (той самий вузол,
 * що несе `grid-rows-[0fr|1fr]`), а не на секцію цілком — інакше з
 * tab-порядку зникне й сам заголовок-тригер.
 */
export function useInertWhileCollapsed(open: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open) {
      el.removeAttribute("inert");
      el.removeAttribute("aria-hidden");
    } else {
      el.setAttribute("inert", "");
      el.setAttribute("aria-hidden", "true");
    }
  }, [open]);

  return ref;
}
