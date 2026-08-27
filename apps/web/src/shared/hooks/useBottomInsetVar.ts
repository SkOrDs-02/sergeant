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
    if (!active || !el) {
      root.style.removeProperty(varName);
      return;
    }

    const publish = () => {
      const rect = el.getBoundingClientRect();
      const occupied = Math.max(0, Math.round(window.innerHeight - rect.top));
      root.style.setProperty(varName, `${occupied}px`);
    };

    publish();

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(publish);
    observer?.observe(el);
    window.addEventListener("resize", publish);
    window.visualViewport?.addEventListener("resize", publish);

    return () => {
      observer?.disconnect();
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
