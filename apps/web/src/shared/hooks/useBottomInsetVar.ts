import { useLayoutEffect, type RefObject } from "react";

/**
 * Публікує «скільки пікселів знизу вʼюпорта займає цей елемент» у CSS-змінну
 * на `<html>`, щоб її бачили **fixed**-шари з іншої гілки дерева.
 *
 * AI-CONTEXT: навіщо взагалі ref на `<html>`, коли є `--bottom-nav-height`.
 * Та змінна ставиться утилітою `bottom-nav-height-var` на кореневий вузол
 * модуля (`ModuleShell` / `MeshBackground`), тобто **всередині** `children`
 * у `core/app/Providers.tsx`. CSS custom properties успадковуються лише
 * вниз по дереву, а `<ToastContainer>` — це СЕСТРА `children` у тому ж
 * `Providers`. Тому `var(--bottom-nav-height, 0px)` у тості завжди
 * розгортався у fallback `0px`, і тост лягав просто поверх нижньої
 * навігації (68 px + safe-area) замість того, щоб стояти над нею.
 *
 * `<html>` — єдиний спільний предок для обох гілок, тож змінну ставимо туди.
 *
 * Значення міряємо, а не рахуємо формулою: висота навігації складається з
 * треку (60/64 px), бордера і `padding-bottom: env(safe-area-inset-bottom)`,
 * і всі три вже двічі розходилися з ручним `calc()` (round-3 UI-аудит).
 * `window.innerHeight - rect.top` дає рівно зайняту смугу — і коректно
 * зводиться до ~0, коли навігація зʼїхала за екран (`translate-y-full` під
 * відкритою клавіатурою).
 *
 * @param ref елемент, чию нижню смугу треба опублікувати
 * @param varName імʼя CSS-змінної (`--sgt-*`)
 * @param active `false` → змінна знімається (елемент логічно відсутній)
 */
export function useBottomInsetVar(
  ref: RefObject<HTMLElement | null>,
  varName: string,
  active = true,
): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    // Неактивний екземпляр нічого не ставив, тож і знімати йому нічого:
    // змінна спільна на `<html>`, і зняття тут стирало значення ІНШОГО,
    // відкритого власника (закритий `Sheet`, що змонтувався поруч, скидав
    // футер відкритого аркуша, і тост лягав на його CTA). Перехід
    // active → false прибирає cleanup попереднього запуску.
    // ponytail: два одночасно активні власники однієї змінної досі
    // перетирають одне одного; лічильник власників, якщо таке зʼявиться.
    if (!active || !el) return;

    const publish = () => {
      const rect = el.getBoundingClientRect();
      // На поверненні після клавіатури translate ще завершується:
      // активний нав уже займає свою повну смугу, навіть якщо rect.top
      // на першому кадрі лишився за екраном. Вимір висоти, без 60/64px.
      const floor = varName === BOTTOM_NAV_INSET_VAR ? rect.height : 0;
      const occupied = Math.max(
        0,
        Math.round(floor),
        Math.round(window.innerHeight - rect.top),
      );
      root.style.setProperty(varName, `${occupied}px`);
    };

    publish();
    // CSS translation змінює top без ResizeObserver. Аркуш анімує
    // предка списку джерел, тому слухаємо capture також на предках.
    const settled = (event: Event) => {
      const target = event.target;
      if (
        target instanceof Element &&
        (target.contains(el) || el.contains(target))
      )
        publish();
    };
    document.addEventListener("transitionend", settled, true);
    document.addEventListener("transitioncancel", settled, true);
    document.addEventListener("animationend", settled, true);
    document.addEventListener("animationcancel", settled, true);

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(publish);
    observer?.observe(el);
    window.addEventListener("resize", publish);
    window.visualViewport?.addEventListener("resize", publish);

    return () => {
      observer?.disconnect();
      document.removeEventListener("transitionend", settled, true);
      document.removeEventListener("transitioncancel", settled, true);
      document.removeEventListener("animationend", settled, true);
      document.removeEventListener("animationcancel", settled, true);
      window.removeEventListener("resize", publish);
      window.visualViewport?.removeEventListener("resize", publish);
      root.style.removeProperty(varName);
    };
  }, [ref, varName, active]);
}

/** Нижня навігація (hub або модульна) — рівно одна на екрані одночасно. */
export const BOTTOM_NAV_INSET_VAR = "--sgt-bottom-nav-inset";

/** Плаваюча плашка «Тренування триває». */
export const WORKOUT_BANNER_INSET_VAR = "--sgt-workout-banner-inset";

/**
 * Футер відкритого `Sheet` (слот `footer` з CTA). Публікує сам аркуш, доки
 * відкритий і має футер; трей тостів через цю змінну стає НАД футером, а не
 * на ньому (рішення власника 2026-09-16, варіант A: трей лишається внизу).
 * Аркуш без футера змінну не ставить — його тіло не є CTA-смугою.
 */
export const SHEET_FOOTER_INSET_VAR = "--sgt-sheet-footer-inset";

/**
 * Докована панель активного тренування Фізрука (`SessionDock`), яка в сесії
 * стоїть замість таб-бару модуля. Публікує сама панель, доки вона на екрані;
 * трей тостів через цю змінну стає НАД нею, а не на «+ Вправа»: тост під
 * курсором ставить авто-закриття на паузу, тож дія панелі лишалась
 * недосяжною (E2E `fizruk-active-workout`, тост «готовий до роботи офлайн»).
 */
export const SESSION_DOCK_INSET_VAR = "--sgt-session-dock-inset";

/**
 * Кнопка дії в куті (`CornerAction`). Публікує сама кнопка, доки
 * видима; `page-tabbar-pad` додає різницю між нею і нижньою навігацією до
 * відступу скрол-контейнера, щоб останній рядок контенту не лягав під неї
 * (критика екранів 2026-09-23: «+ Пасив», «Нд» у тижні ккал, порожній стан
 * трендів Журналу).
 */
export const FAB_INSET_VAR = "--sgt-fab-inset";

/**
 * Ширина кутової кнопки з боковим полем і зазором: на стільки утиліта
 * `fab-clear-row` відсуває праву межу рядків.
 */
export const FAB_WIDTH_VAR = "--sgt-fab-width";

/**
 * Трей тостів, доки в ньому є хоч один тост. `page-tabbar-pad` бере його
 * так само, як кнопку в куті: тост віхи серії на Огляді Рутини лягав на
 * фільтри стрічки в кінці сторінки, і докрутити їх над тостом було нікуди
 * (інвентар v3.1, Е4).
 */
export const TOAST_INSET_VAR = "--sgt-toast-inset";

/**
 * Банер згоди на аналітику (`AnalyticsConsentBanner`). Публікує сам банер,
 * доки змонтований; `CornerAction` піднімається над ним, щоб кнопка
 * «Ні, дякую» не опинялась під кнопкою дії.
 */
export const CONSENT_BANNER_INSET_VAR = "--sgt-consent-banner-inset";
