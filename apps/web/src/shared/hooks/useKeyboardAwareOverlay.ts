/**
 * Last validated: 2026-08-16
 * Status: Active
 *
 * Тримає `position: fixed` оверлей (bottom sheet) на місці, поки iOS
 * панує **visual viewport** під софт-клавіатуру.
 *
 * # Що ламалось
 *
 * Тестер: «якось дивно екран виглядає, коли починаєш друкувати опис —
 * підскакує вгору занадто наче». На скріні аркуш «Додати витрату»
 * піднятий приблизно на 50 px ВИЩЕ клавіатури (між його низом і
 * accessory-баром зяє смуга скриму), а заголовок заліз під системний
 * статус-бар. Зсув однаковий зверху і знизу — тобто аркуш не
 * перерахувався, а поїхав цілком.
 *
 * Причина не в наших відступах. `useBodyScrollLock` пінить `body` у
 * `position: fixed`, тож документ прокрутити нікуди — і коли фокус
 * переходить у поле, перекрите клавіатурою, WebKit замість скролу
 * документа **панує visual viewport** (`visualViewport.offsetTop > 0`).
 * `position: fixed` прив'язаний до layout viewport, а не до visual, тож
 * весь оверлей разом зі скримом їде вгору рівно на `offsetTop`. Ми
 * підняли аркуш над клавіатурою на `marginBottom`, а iOS підняв його
 * ще раз — звідси «занадто».
 *
 * # Чому не лікуємо це в `useVisualKeyboardInset`
 *
 * Там `offsetTop` свідомо НЕ віднімається від інсету, і `scroll` на
 * visualViewport свідомо не слухається (див. § H1 у шапці того файлу):
 * iOS сипле `scroll` покадрово, а зміна інсету рухає `marginBottom` +
 * `maxHeight`, тобто переверстує аркуш на кожному кадрі — саме той
 * джитер, від якого там і пішли. Тут інша природа правки: компенсація
 * — чистий `transform` на одному вузлі, повз React-стан і повз layout.
 * Вона не переверстовує нічого і не може повернути H1.
 *
 * # Другий симптом: поле, у яке друкуєш, поза екраном
 *
 * H2-фолбек у `useVisualKeyboardInset` скролить сфокусоване поле у
 * видиму зону лише на переході «клавіатури не було → з'явилась». Але
 * типовий шлях у формі — спершу сума (клавіатура вже відкрита), потім
 * тап в «Назву»: інсет не змінюється, ефект не спрацьовує, і поле
 * лишається під фолдом власного скрол-контейнера аркуша. На скріні
 * тестера видно рівно це — «Назви» на екрані немає взагалі. Тому тут
 * же слухаємо `focusin` на оверлеї і підтягуємо поле самі.
 *
 * Порядок важливий: ми скролимо СИНХРОННО у `focusin`, тобто ще до
 * того, як WebKit вирішить панувати viewport. Побачивши поле вже у
 * видимій зоні, він зазвичай не панує взагалі — компенсація вище
 * лишається страховкою, а не основним механізмом.
 */
import { useEffect, type RefObject } from "react";

/**
 * Мінімальний гап layout↔visual viewport, який вважаємо клавіатурою.
 * Те саме число, що й у `useVisualKeyboardInset` — менші дельти дає
 * браузерний chrome (URL-бар, нижній тулбар).
 */
const KEYBOARD_GAP_MIN_PX = 56;

/**
 * Поріг «сторінку не зумили пальцями». Pinch-zoom теж рухає
 * `offsetTop`, але той пан — свідома дія людини (типово: слабкий зір,
 * читає дрібний текст). Компенсувати його означало б зробити аркуш
 * непанованим. Компенсуємо лише пан під клавіатуру, на масштабі 1.
 */
const NO_ZOOM_SCALE_MAX = 1.01;

export function isTextEntryElement(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    (el as HTMLElement).isContentEditable
  );
}

/** Клавіатури не буває без сфокусованого поля — той самий предикат, що в інсеті. */
function keyboardIsOpen(vv: VisualViewport): boolean {
  if (!isTextEntryElement(document.activeElement)) return false;
  return window.innerHeight - vv.height > KEYBOARD_GAP_MIN_PX;
}

/**
 * @param active — зазвичай `open` аркуша: поки закритий, слухачі не висять.
 * @param overlayRef — вузол `position: fixed`, який покриває вьюпорт
 *   (у `Sheet` це контейнер зі скримом і панеллю разом: зсувати треба
 *   їх обох, інакше скрим розійдеться з панеллю).
 */
export function useKeyboardAwareOverlay(
  active: boolean,
  overlayRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!active) return;
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    const overlay = overlayRef.current;
    if (!vv || !overlay) return;

    // Пишемо `transform` прямо в стиль вузла, а не через React-стан:
    // pan триває ~200 ms і сипле подіями покадрово, тож рендер-цикл на
    // кожну з них — це той самий джитер, тільки з іншого боку.
    const applyAnchor = () => {
      const el = overlayRef.current;
      if (!el) return;
      const offsetTop = Math.round(vv.offsetTop);
      const anchored =
        offsetTop > 0 && vv.scale <= NO_ZOOM_SCALE_MAX && keyboardIsOpen(vv);
      el.style.transform = anchored ? `translate3d(0, ${offsetTop}px, 0)` : "";
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!isTextEntryElement(target as Element | null)) return;
      // Перехід «клавіатури не було → з'явилась» уже покритий H2-фолбеком
      // в адаптері інсету; тут нас цікавить рівно перескок фокуса між
      // полями при вже відкритій клавіатурі.
      if (!keyboardIsOpen(vv)) return;
      // `?.` — jsdom не реалізує `scrollIntoView`.
      (target as HTMLElement).scrollIntoView?.({ block: "nearest" });
    };

    vv.addEventListener("scroll", applyAnchor);
    vv.addEventListener("resize", applyAnchor);
    overlay.addEventListener("focusin", handleFocusIn);
    applyAnchor();

    return () => {
      vv.removeEventListener("scroll", applyAnchor);
      vv.removeEventListener("resize", applyAnchor);
      overlay.removeEventListener("focusin", handleFocusIn);
      overlay.style.transform = "";
    };
  }, [active, overlayRef]);
}
