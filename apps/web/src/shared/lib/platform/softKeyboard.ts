/**
 * Last validated: 2026-08-16
 * Status: Active
 *
 * Єдине джерело правди про те, що таке «софт-клавіатура на екрані».
 *
 * Це визначення потрібне двом хукам одночасно —
 * `useVisualKeyboardInset` (піднімає bottom sheet на висоту клавіатури)
 * і `useKeyboardAwareOverlay` (компенсує пан visual viewport під ту саму
 * клавіатуру). Розійтись їм не можна: якщо один вважає клавіатуру
 * відкритою, а інший ні, аркуш або компенсує пан там, де інсету вже
 * немає, або навпаки лишається піднятим без компенсації. До цього файлу
 * предикат `isTextEntryElement` був спільний, а поріг `56` стояв
 * літералом у двох місцях — саме та половинчаста спільність, яка
 * дозволяє тихо розійтись при першій же правці.
 */

/**
 * Мінімальний гап layout↔visual viewport, який вважаємо клавіатурою.
 * Менші дельти дає браузерний chrome (URL-бар, нижній тулбар): при
 * холодному старті з пуш-сповіщення він зʼявляється без жодної
 * клавіатури й давав рівно такий самий сигнал.
 */
export const KEYBOARD_GAP_MIN_PX = 56;

/** Клавіатури не буває без сфокусованого поля вводу. */
export function isTextEntryElement(el: Element | null): el is HTMLElement {
  const tag = el?.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    (el as HTMLElement | null)?.isContentEditable === true
  );
}

/**
 * Висота софт-клавіатури в CSS-пікселях, або `0` якщо її немає.
 *
 * Гап сам по собі — недостатня ознака (браузерний chrome дає такий
 * самий), тому потрібен ще й сфокусований text-entry елемент.
 */
export function softKeyboardGapPx(vv: VisualViewport): number {
  if (!isTextEntryElement(document.activeElement)) return 0;
  const gap = window.innerHeight - vv.height;
  return gap > KEYBOARD_GAP_MIN_PX ? Math.round(gap) : 0;
}
