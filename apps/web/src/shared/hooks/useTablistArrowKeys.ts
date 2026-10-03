/**
 * Last validated: 2026-09-13
 * Status: Active
 *
 * Клавіатурна навігація для `role="tablist"` — стрілки, Home, End.
 *
 * **Навіщо окремий хук.** `role="tablist"` — це не оформлення, а ОБІЦЯНКА:
 * скрінрідер оголошує «вкладка 2 з 4» і тим самим каже людині, що між
 * вкладками ходять стрілками. Роль без машинерії — обіцянка, яку інтерфейс
 * не виконує; людина тисне стрілку і нічого не відбувається.
 *
 * Аудит 2026-09-13 (знахідка PR-C5) знайшов чотири такі місця при трьох
 * робочих реалізаціях того самого патерну (`Tabs`, `Segmented`,
 * `ModuleBottomNav`). Тобто логіка в репо була, просто її щоразу писали
 * заново — і чотири рази не написали. Цей хук — та сама логіка, щоб
 * наступний call-site брав її, а не переписував. Контракт «роль ↔
 * поведінка» тримає `tablistKeyboardContract.test.ts`.
 *
 * **Найгірший із чотирьох випадків варто знати.** `ModuleSwitcher` мав
 * roving tabindex (`tabIndex={isActive ? 0 : -1}`) БЕЗ стрілок — тобто
 * неактивні модулі були недосяжні з клавіатури взагалі: Tab їх пропускає,
 * стрілки не працюють. Половину патерну там навіть пінив тест, через що
 * друга половина виглядала свідомо пропущеною.
 *
 * **Вішається на КНОПКУ вкладки, не на контейнер.** Так само робить
 * `Segmented`, і не з примхи: обробник на `div[role="tablist"]` без
 * `tabIndex` — це `jsx-a11y/interactive-supports-focus`, бо на
 * нефокусований елемент клавіші взагалі не приходять (у tablist вони
 * спливають із вкладки, але лінтер цього не знає й має рацію в загальному
 * випадку). Побічний виграш: хуку не потрібен ref — сусідів він знаходить
 * через `closest('[role="tablist"]')`, тож контейнер може малювати хто
 * завгодно.
 *
 * **Активація автоматична** (`target.click()`), як у WAI-ARIA за
 * замовчуванням і як уже роблять обидва примітиви: фокус і вибір ходять
 * разом. Хук нічого не знає про моделі даних call-site-у, тож `onClick`
 * вкладки лишається єдиним місцем, де описана реакція на вибір.
 *
 * **Межа: лише горизонтальний ряд.** Усі поточні call-site-и — рядки, тож
 * `ArrowUp`/`ArrowDown` навмисно не чіпаємо: у вертикальному tablist вони
 * мали б замінити Left/Right, а не додатися до них, і це вимагає знати
 * орієнтацію. Робиш вертикальний — розширюй хук явно, не додавай стрілки
 * «про всяк випадок».
 */
import { useCallback } from "react";
import type { KeyboardEvent } from "react";

const HANDLED_KEYS = ["ArrowLeft", "ArrowRight", "Home", "End"] as const;

/**
 * @param enabled Вимикає обробку, не змінюючи порядку хуків (напр. поки
 *   ряд прихований). За замовчуванням увімкнено.
 * @returns Обробник для `onKeyDown` КОЖНОЇ кнопки з `role="tab"`.
 */
export function useTablistArrowKeys<T extends HTMLElement = HTMLButtonElement>(
  enabled = true,
): (event: KeyboardEvent<T>) => void {
  return useCallback(
    (event: KeyboardEvent<T>) => {
      if (!enabled) return;
      if (!HANDLED_KEYS.includes(event.key as (typeof HANDLED_KEYS)[number])) {
        return;
      }
      // Модифіковані стрілки належать браузеру, не нам: Alt+← це «Назад» на
      // Windows/Linux, Cmd+← — на macOS. Перехопивши їх, ми б викликали
      // preventDefault і ще й перемкнули вкладку — тобто зʼїли навігацію
      // й зробили те, чого людина не просила. Знахідка рев'ю на PR #1143.
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const tablist = event.currentTarget.closest('[role="tablist"]');
      if (!tablist) return;

      // Вимкнені вкладки пропускаємо: фокус на них нічого не дає, а
      // `ManualExpenseKindTabs` вимикає обидві на час сабміту.
      const tabs = Array.from(
        tablist.querySelectorAll<HTMLElement>('[role="tab"]'),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (tabs.length === 0) return;

      event.preventDefault();

      // Точка відліку — сама натиснута вкладка; якщо вона вимкнена й тому
      // не в списку, рушаємо від вибраної.
      const fromIndex = tabs.indexOf(event.currentTarget);
      const selectedIndex = tabs.findIndex(
        (el) => el.getAttribute("aria-selected") === "true",
      );
      const from = fromIndex >= 0 ? fromIndex : Math.max(0, selectedIndex);

      const to =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : event.key === "ArrowRight"
              ? (from + 1) % tabs.length
              : (from - 1 + tabs.length) % tabs.length;

      const target = tabs[to];
      if (!target) return;
      target.focus();
      target.click();
    },
    [enabled],
  );
}
