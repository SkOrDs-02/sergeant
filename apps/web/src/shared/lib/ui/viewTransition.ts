/**
 * Sergeant Design System — View Transitions helper (R2-V-1 / R2-V-2)
 *
 * A thin, dependency-free wrapper around the native
 * [View Transitions API](https://developer.mozilla.org/docs/Web/API/View_Transitions_API)
 * used for the hub ↔ module navigation crossfade + shared-element morph.
 *
 * Design goals:
 *  - **Progressive enhancement.** Where the API is missing (Firefox at
 *    time of writing, older Safari) or the user prefers reduced motion,
 *    we run the DOM mutation immediately with no animation — the app
 *    behaves exactly as before this feature landed.
 *  - **Synchronous commit.** The browser snapshots the "old" state when
 *    `startViewTransition` is called and the "new" state when the passed
 *    callback returns. Because our navigation mutates React state, we
 *    wrap the callback in `flushSync` so React commits the new tree
 *    *before* the browser takes the second snapshot — otherwise the
 *    morph captures a stale frame and nothing animates.
 *  - **No throwing.** A failed transition must never block navigation.
 *    Any error falls through to running the mutation directly.
 *
 * The visual choreography (crossfade + which elements morph) lives in
 * CSS via `::view-transition-*` pseudo-elements and `view-transition-name`
 * — see `styles/animations.css`. This module only orchestrates *when* a
 * transition happens.
 */
import { flushSync } from "react-dom";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Атрибут-маркер для учасників shared-element морфу.
 *
 * AI-DANGER: `view-transition-name` НЕ можна лишати на елементі постійно.
 * Раніше `ModuleHeader` і `BentoCard` тримали його інлайновим стилем весь
 * час, доки змонтовані, і це давало дві біди:
 *
 *   1. Спека вимагає, щоб ім'я було унікальним у документі. Плитка хабу і
 *      хедер модуля носять ОДНЕ ім'я (`sgt-module-<id>`), тож поки обидва
 *      живі, документ має дублікат — перехід стає невалідним.
 *   2. Іменований елемент постійно висить окремим snapshot-шаром. У WebKit
 *      такий шар лишається на екрані зі старим вмістом і не збігається з
 *      позицією самого елемента.
 *
 * Саме звідси рожеві смуги впоперек чипів і стрічки тижня в «Рутині»:
 * `ModuleHeader` модуля має рожевий градієнт (`mt.gradient`), і його
 * залишковий шар малювався поверх сусідніх рядів. Репорт власника —
 * ніч проти 17 серпня 2026 за Києвом. Діагноз підтверджено виключенням:
 * при `prefers-reduced-motion` (єдиний режим, де морф не запускається)
 * смуги зникали, а зміна `background-attachment` меша — ні.
 *
 * Тому ім'я тепер ставиться на час переходу і знімається одразу після.
 */
export const VT_NAME_ATTR = "data-vt-name";

/** Проставити імена учасникам морфу; дублікати відсікаємо (спека вимагає
 *  унікальності — інакше браузер має право скасувати весь перехід). */
function applyTransitionNames(seen: Set<string>, applied: HTMLElement[]): void {
  if (typeof document === "undefined") return;
  const nodes = document.querySelectorAll<HTMLElement>(`[${VT_NAME_ATTR}]`);
  for (const el of nodes) {
    const name = el.getAttribute(VT_NAME_ATTR);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    el.style.viewTransitionName = name;
    applied.push(el);
  }
}

/** Зняти імена. Безпечно і для вже відмонтованих вузлів. */
function clearTransitionNames(applied: HTMLElement[]): void {
  for (const el of applied) el.style.viewTransitionName = "";
  applied.length = 0;
}

/**
 * Minimal structural view of the API surface we use. Declared as an
 * intersection rather than `extends Document` so we don't clash with the
 * (broader) `startViewTransition` overloads shipped in recent lib.dom.
 */
type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
};

/** Non-hook reduced-motion read for use outside React render. */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

/** Whether the current environment can run a native view transition. */
export function supportsViewTransitions(): boolean {
  if (typeof document === "undefined") return false;
  return (
    typeof (document as DocumentWithViewTransition).startViewTransition ===
    "function"
  );
}

/**
 * Run `mutate` inside a view transition when possible, otherwise run it
 * directly. `mutate` should perform the synchronous state change that
 * swaps the view (e.g. `setActiveModule(id)` + `navigate(...)`).
 *
 * Safe to call unconditionally from navigation handlers — it degrades to
 * a plain function call when transitions aren't available or wanted.
 */
export function startViewTransition(mutate: () => void): void {
  const doc =
    typeof document === "undefined"
      ? undefined
      : (document as DocumentWithViewTransition);

  // Fallback path: no API, SSR, or reduced motion → mutate immediately.
  if (!doc?.startViewTransition || prefersReducedMotion()) {
    mutate();
    return;
  }

  const seen = new Set<string>();
  const applied: HTMLElement[] = [];

  // Стан «до»: іменуємо те, що вже на екрані (плитка хабу).
  applyTransitionNames(seen, applied);

  try {
    const transition = doc.startViewTransition(() => {
      // Force React to commit synchronously so the browser's "new"
      // snapshot reflects the post-navigation tree.
      flushSync(mutate);
      // Стан «після»: новий піддерев'я вже в DOM, але браузер ще не зняв
      // другий знімок — саме тут іменуємо хедер модуля. `seen` не дає
      // видати те саме ім'я двічі, якщо хаб лишився змонтованим.
      applyTransitionNames(seen, applied);
    });
    const cleanup = () => clearTransitionNames(applied);
    // `finished` резолвиться після завершення анімації; знімаємо імена і
    // на помилці, інакше зірваний перехід лишив би шар назавжди.
    transition.finished.then(cleanup, cleanup);
  } catch {
    // Any failure (e.g. flushSync called from an unexpected context)
    // must not swallow the navigation itself.
    clearTransitionNames(applied);
    mutate();
  }
}
