/**
 * Last validated: 2026-10-01
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
 * `position: fixed` привʼязаний до layout viewport, а не до visual, тож
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
 * видиму зону лише на переході «клавіатури не було → зʼявилась». Але
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
 *
 * # Третій симптом: перший скрол їде по СТАРІЙ геометрії
 *
 * Бета-фідбек №4 (2026-08-18, довга bulk-review таблиця): тап у поле
 * опису, клавіатура відкривається, «на екрані видимі мої витрати, які
 * були вище» — поле під фолдом. Причина: і H2-фолбек, і `focusin`-скрол
 * відпрацьовують ДО того, як панель аркуша стиснеться під клавіатуру
 * (transition ~200 ms), тож поле, щойно поставлене у видиму зону,
 * зʼїжджає під неї разом зі стисканням. Два лікування разом:
 * `block: "center"` замість `"nearest"` (запас з обох боків) і
 * одноразовий ДОСКРОЛ активного поля після того, як `resize`-и
 * клавіатурного transition-у вщухли — по фінальній геометрії. Це не
 * покадровий слухач (таймер згорає раз на відкриття), H1-джитер не
 * повертається.
 *
 * # Четвертий симптом: нижні поля списку лишались під клавіатурою
 *
 * Бета-фідбек №5 (2026-08-18): «верхні та посередині наче норм, а внизу
 * екрану не видно». Асиметрія вказує на природу дефекту: `scrollIntoView`
 * уміє рівно стільки, скільки дозволяє `scrollHeight` контейнера. Для
 * поля в кінці списку контенту під ним майже нема, скрол упирається в
 * межу — і центрування, яке рятує середину, для останніх рядків просто
 * недосяжне. Далі поле лишається там, де було, тобто під клавіатурою.
 *
 * Тому дві половини:
 *   1. `Sheet` тримає у скрол-контейнері запас унизу на висоту
 *      клавіатури, поки вона відкрита — щоб останній рядок ФІЗИЧНО мав
 *      куди піднятись (без цього пункт 2 нікуди не доскролить);
 *   2. після скролу звіряємо ФАКТ по `visualViewport` — чи поле справді
 *      у видимій зоні — і дотягуємо рівно на дефіцит. Контейнерний
 *      `scrollIntoView` цього не гарантує: він оперує геометрією свого
 *      скрол-предка, а не тим, що реально видно на екрані.
 *
 * Перевірка факту — один вимір на подію фокуса чи на осідання
 * клавіатури, не покадрово; H1-джитер тут так само неможливий.
 *
 * # Пʼятий симптом: аркуш дрижить
 *
 * Бета-фідбек №5 (2026-08-18, відео тестерки): категорія тепер
 * доступна, але «дрижить екран на одному моменті». Покадровий розбір
 * запису (30 fps, вікно 4.2–4.6 s): клавіатура на місці — жоден її
 * піксель не рухається, — а весь аркуш разом зі скримом їздить
 * ЖОРСТКО, тобто однаково у верхній, середній і нижній смузі:
 * +7, +3, −11, +15, 0, −9, +12, +1, −7, +12 px кадр у кадр, ~15 Гц,
 * із сумарним дрейфом ~35 px угору. Ані скрол-контейнер, ані верстка
 * при цьому не змінюються (похибка збігу профілів ≈ 0 — чиста
 * трансляція).
 *
 * Це підпис зворотного звʼязку, а не одноразового промаху. WebKit
 * бачить сфокусоване поле впритул до accessory-бару, панує viewport
 * на кілька пікселів, щоб дати йому просвіт; ми той пан скасовуємо
 * трансформом — на кадр пізніше й рівно на ту саму величину, тож на
 * екрані просвіт не зʼявляється; WebKit панує ще раз. Петля крутиться,
 * поки він не здасться, і кожен її оберт видно як тремтіння.
 *
 * Лікування — не воювати з причиною пану, а знімати її. Пан для нас
 * тепер СИГНАЛ «поле затиснуте»: перший пан серії ми, як і раніше,
 * компенсуємо, але одразу ж даємо полю просвіт власним скролом
 * (`revealField` — центрування плюс дотяг на дефіцит по факту), тобто
 * те, що WebKit приймає. Просвіт зʼявляється, `offsetTop` повертається
 * в нуль, петля обривається на першому оберті. Реванш рівно один на
 * серію (пере-озброюється лише коли пан упав до нуля), тож замінити
 * тремтіння на скрол-шторм він не може.
 *
 * Виняток — поле, яке користувач сам відкрутив геть із видимої зони:
 * тягнути його назад означало б повернути перший симптом («не можу
 * проскролити нижче, щоб обрати категорію»). Тому в цьому випадку
 * навпаки — клавіатура відступає: на скрол ПАЛЬЦЕМ, після якого від
 * поля не лишилось нічого видимого, ми його розфокусовуємо. WebKit
 * втрачає що відкривати, пан зникає разом із причиною, а тестерка
 * отримує аркуш цілком — рівно те, чого й хотіла, коли крутила його
 * вниз.
 */
import { useEffect, type RefObject } from "react";

import {
  isTextEntryElement,
  softKeyboardGapPx,
} from "@shared/lib/platform/softKeyboard";

/**
 * Поріг «сторінку не зумили пальцями». Pinch-zoom теж рухає
 * `offsetTop`, але той пан — свідома дія людини (типово: слабкий зір,
 * читає дрібний текст). Компенсувати його означало б зробити аркуш
 * непанованим. Рухаємось лише під клавіатуру, на масштабі 1.
 */
const NO_ZOOM_SCALE_MAX = 1.01;

/** Пауза після останнього `resize` клавіатурного transition-у перед
 * доскролом: iOS сипле кілька `resize`-ів за ~200 ms відкриття, чекаємо
 * тиші, щоб скролити рівно один раз і по фінальній геометрії. */
const SETTLE_SCROLL_DELAY_MS = 150;

/**
 * Спільний гейт для обох втручань хука. Зумленого користувача не
 * чіпаємо взагалі: `softKeyboardGapPx` дивиться лише на гап висот, а
 * pinch-zoom дає такий самий гап — тобто під зумом предикат каже
 * «клавіатура» навіть тоді, коли viewport стиснув палець, а не вона.
 * Зсувати під таким користувачем скрол-контейнер (`scrollIntoView`)
 * так само шкідливо, як і компенсувати його власний пан: він читає
 * конкретне місце сторінки, і воно поїде.
 */
function shouldHandleKeyboard(vv: VisualViewport): boolean {
  return vv.scale <= NO_ZOOM_SCALE_MAX && softKeyboardGapPx(vv) > 0;
}

/** Мінімальний просвіт між низом поля і верхом клавіатури. Нуль тут
 * означав би «впритул», а впритул на iOS зʼїдає рамка фокуса. */
const REVEAL_GAP_PX = 16;

/**
 * Скільки пікселів поля має лишитись у видимій зоні, щоб воно ще
 * вважалось «на екрані». Нижче цього — користувач відкрутив його геть,
 * і жодна наша спроба підтягнути поле назад не буде тим, чого він
 * хотів (§ пʼятий симптом у шапці).
 */
const FIELD_VISIBLE_MIN_PX = 8;

/**
 * Вікно, протягом якого скрол-подія вважається НЕ жестом користувача:
 * це або наш власний скрол (`revealField`), або клац верстки під час
 * клавіатурного transition-у. Розфокусовувати поле в ці моменти не
 * можна — інакше клавіатура закривалась би одразу після відкриття.
 */
const NON_GESTURE_SCROLL_MS = 350;

/**
 * Скільки після останнього дотику скрол ще вважаємо жестом: iOS домотує
 * інерцію вже без пальця на склі, і саме на цьому хвості поле зазвичай
 * і залишає екран.
 */
const TOUCH_MOMENTUM_MS = 1500;

/**
 * Скільки пікселів поля видно зараз, або `NaN`, якщо геометрії немає
 * (jsdom, `display: none`) — тоді жодних висновків не робимо.
 *
 * Міряємо в тих самих координатах, що й `revealField`: `rect` — від
 * layout viewport, видима зона — `[offsetTop, offsetTop + height]`.
 * `getBoundingClientRect` уже враховує наш компенсуючий трансформ, а
 * `vv.height` на iOS не включає клавіатуру, тож нижня межа смуги — це
 * рівно її верхній край.
 */
function visibleFieldPx(el: HTMLElement, vv: VisualViewport): number {
  const rect = el.getBoundingClientRect?.();
  if (!rect || rect.height === 0) return Number.NaN;
  const visibleTop = vv.offsetTop;
  const visibleBottom = vv.offsetTop + vv.height;
  return Math.min(rect.bottom, visibleBottom) - Math.max(rect.top, visibleTop);
}

/**
 * Найближчий предок, який реально може прокрутитись по вертикалі. Саме
 * «реально»: `overflow-y: auto` без переповнення нікуди не скролить, і
 * зупинятись на такому вузлі означало б мовчки не зробити нічого.
 */
function nearestScrollableAncestor(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (
      (overflowY === "auto" ||
        overflowY === "scroll" ||
        overflowY === "overlay") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Ставить поле у видиму зону і ПЕРЕВІРЯЄ, що воно там опинилось.
 *
 * `getBoundingClientRect` рахується від layout viewport, `vv.offsetTop`
 * — це зсув visual viewport усередині нього, тож видима зона в тих
 * самих координатах це `[offsetTop, offsetTop + height]`. Компенсуючий
 * трансформ оверлея вже враховано: він рухає сам вузол, а отже і його
 * rect. Усе, що нижче за `offsetTop + height`, — під клавіатурою.
 */
function revealField(el: HTMLElement, vv: VisualViewport): void {
  // `?.` — jsdom не реалізує `scrollIntoView`.
  el.scrollIntoView?.({ block: "center" });

  const rect = el.getBoundingClientRect?.();
  if (!rect) return;
  const hiddenBy = rect.bottom + REVEAL_GAP_PX - (vv.offsetTop + vv.height);
  if (hiddenBy <= 0) return;

  // Дотягуємо рівно на дефіцит: скрол на більше підняв би поле вище, ніж
  // потрібно, і забрав би з очей рядки, повз які людина щойно йшла.
  const scroller = nearestScrollableAncestor(el);
  if (scroller) scroller.scrollTop += hiddenBy;
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

    // Мітка часу, до якої скрол усередині оверлея — не жест людини, а
    // наш власний `revealField` або клац верстки під клавіатурний
    // transition. Спільна для обох джерел: наслідок один і той самий.
    let nonGestureScrollUntil = 0;
    let lastTouchAt = 0;

    /** Єдина точка, з якої хук сам рухає скрол-контейнер. */
    const revealAndMark = (el: HTMLElement) => {
      nonGestureScrollUntil = Date.now() + NON_GESTURE_SCROLL_MS;
      revealField(el, vv);
    };

    /** Сфокусоване поле всередині цього оверлея, якщо воно там є. */
    const focusedFieldInOverlay = (): HTMLElement | null => {
      const el = overlayRef.current;
      const focused = document.activeElement;
      if (!el || !isTextEntryElement(focused)) return null;
      return el.contains(focused) ? focused : null;
    };

    // Реванш на пан: рівно один на серію. Пере-озброюється лише коли
    // пан упав до нуля, тобто коли петля справді обірвалась.
    let panRevealArmed = true;

    // Пишемо `transform` прямо в стиль вузла, а не через React-стан:
    // pan триває ~200 ms і сипле подіями покадрово, тож рендер-цикл на
    // кожну з них — це той самий джитер, тільки з іншого боку.
    const applyAnchor = () => {
      const el = overlayRef.current;
      if (!el) return;
      const offsetTop = Math.round(vv.offsetTop);
      const anchored = offsetTop > 0 && shouldHandleKeyboard(vv);
      el.style.transform = anchored ? `translate3d(0, ${offsetTop}px, 0)` : "";
      if (!anchored) {
        panRevealArmed = true;
        return;
      }
      if (!panRevealArmed) return;
      // Пан = WebKit просить просвіт для затиснутого поля. Даємо цей
      // просвіт власним скролом, інакше він проситиме його знову і
      // знову — по разу на кадр (§ пʼятий симптом у шапці). Міряти
      // видимість треба ПІСЛЯ запису трансформу: rect враховує його.
      const focused = focusedFieldInOverlay();
      if (!focused) return;
      const visiblePx = visibleFieldPx(focused, vv);
      // Поля не видно взагалі — його відкрутив користувач, і тягнути
      // назад не можна. Цим займається `handleOverlayScroll`.
      if (Number.isNaN(visiblePx) || visiblePx <= FIELD_VISIBLE_MIN_PX) return;
      panRevealArmed = false;
      revealAndMark(focused);
    };

    // Скрол пальцем, після якого від поля не лишилось нічого видимого:
    // клавіатура відступає замість того, щоб тягнути людину назад.
    const handleOverlayScroll = () => {
      const now = Date.now();
      if (now < nonGestureScrollUntil) return;
      if (now - lastTouchAt > TOUCH_MOMENTUM_MS) return;
      if (!shouldHandleKeyboard(vv)) return;
      const focused = focusedFieldInOverlay();
      if (!focused) return;
      const visiblePx = visibleFieldPx(focused, vv);
      if (Number.isNaN(visiblePx) || visiblePx > FIELD_VISIBLE_MIN_PX) return;
      focused.blur();
    };

    const handleTouchMove = () => {
      lastTouchAt = Date.now();
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!isTextEntryElement(target as Element | null)) return;
      // Перехід «клавіатури не було → зʼявилась» уже покритий H2-фолбеком
      // в адаптері інсету; тут нас цікавить рівно перескок фокуса між
      // полями при вже відкритій клавіатурі. `center`, не `nearest`:
      // «мінімально необхідний» скрол ставить поле впритул до краю
      // видимої зони, і будь-який подальший зсув геометрії ховає його
      // знову (§ третій симптом у шапці).
      if (!shouldHandleKeyboard(vv)) return;
      revealAndMark(target as HTMLElement);
    };

    // Доскрол по фінальній геометрії (§ третій симптом): коли `resize`-и
    // клавіатурного transition-у вщухли, ще раз підтягуємо АКТИВНЕ поле
    // всередині оверлея. Один таймер на відкриття, не покадрово.
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleSettleScroll = () => {
      if (settleTimer !== undefined) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        settleTimer = undefined;
        if (!shouldHandleKeyboard(vv)) return;
        const focused = focusedFieldInOverlay();
        if (!focused) return;
        revealAndMark(focused);
      }, SETTLE_SCROLL_DELAY_MS);
    };
    const handleResize = () => {
      // Клавіатурний transition сам совгає скрол-контейнер; поки він
      // триває, скрол-події — не жест, і розфокусовувати поле по них
      // не можна.
      nonGestureScrollUntil = Date.now() + NON_GESTURE_SCROLL_MS;
      applyAnchor();
      scheduleSettleScroll();
    };

    vv.addEventListener("scroll", applyAnchor);
    vv.addEventListener("resize", handleResize);
    overlay.addEventListener("focusin", handleFocusIn);
    overlay.addEventListener("touchmove", handleTouchMove, { passive: true });
    // `scroll` не спливає — ловимо на фазі занурення, інакше скрол тіла
    // аркуша до нас не дійде.
    overlay.addEventListener("scroll", handleOverlayScroll, true);
    applyAnchor();

    return () => {
      if (settleTimer !== undefined) clearTimeout(settleTimer);
      vv.removeEventListener("scroll", applyAnchor);
      vv.removeEventListener("resize", handleResize);
      overlay.removeEventListener("focusin", handleFocusIn);
      overlay.removeEventListener("touchmove", handleTouchMove);
      overlay.removeEventListener("scroll", handleOverlayScroll, true);
      overlay.style.transform = "";
    };
  }, [active, overlayRef]);
}
