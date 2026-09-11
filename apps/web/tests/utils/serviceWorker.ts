import type { Page } from "@playwright/test";

/**
 * Барʼєр перед `page.reload()` в E2E: дочекатися, поки сервіс-воркер не
 * просто стане `activated`, а ЗАБЕРЕ КОНТРОЛЬ над сторінкою.
 *
 * AI-DANGER: без якогось барʼєра рестарт сторінки — це гонка, а не крок
 * сценарію, і саме вона тричі ламала `pantry-storage-places`
 * (`d185347` → `abd0435` → `3a69108`, щоразу підкручуванням таймінгу).
 *
 * Механіка. `precacheAndRoute` кладе весь прекеш (400 записів, 6.6 МБ)
 * у `event.waitUntil` події `install`, тож воркер не може стати
 * `activated`, поки прекеш не завершився. Заміри на цьому репо: install
 * добігає приблизно на 3.7 с після завантаження сторінки, а тест
 * доходить до рестарту приблизно на 4-5 с. Тобто `reload` стріляє
 * близько до межі переходу:
 *
 *   • воркер ще `installing` — навігація йде повз нього, у мережу;
 *   • воркер уже контролює сторінку — навігація йде через `NavigationRoute`;
 *   • перехід стається ПОСЕРЕД навігації — вона абортиться
 *     (`net::ERR_ABORTED; maybe frame was detached?`).
 *
 * **Чому умову підсилено 2026-09-11 — і чого цим НЕ доведено.**
 * `Mobile UI audit` упав у CI саме цим `ERR_ABORTED`, уже маючи барʼєр
 * перед рестартом. Перша версія чекала на `active.state === "activated"
 * && !installing`, і напрошувалось пояснення: `activated` настає ДО
 * того, як `self.clients.claim()` у `waitUntil` обробника `activate`
 * добігає (`sw.ts` кличе його після `listStaleCaches()`), тож барʼєр
 * нібито пропускав рестарт у цю щілину.
 *
 * **Замір це пояснення не підтвердив.** Пряме опитування обох умов з
 * кроком 5 мс дало `controller` на 3721 мс і стару умову на 3728 мс —
 * тобто контроль приходить РАНІШЕ, а різниця в 7 мс лежить у похибці
 * самого опитування. Спроба відтворити падіння локально теж не вдалась:
 * шість прогонів, зокрема три ЗОВСІМ без барʼєра під 8× CPU-throttling,
 * усі зелені.
 *
 * Тому умова тут підсилена не як «знайдена причина», а як precondition,
 * що збігається з тим, від чого рестарт справді залежить: навігація йде
 * через воркер лише коли той КОНТРОЛЮЄ сторінку
 * (`navigator.serviceWorker.controller`), а воркер у стані `waiting`
 * забере контроль саме на наступній навігації — тобто на нашому
 * рестарті. Обидва стани коштують нічого і на заміряному таймінгу вже
 * виконані. **Причина CI-падіння лишається невстановленою**; якщо воно
 * повториться, дивись на значення, яке повертає ця функція, — тепер
 * `timeout` відрізняється від `no-service-worker`, і виклик у
 * `pantry-storage-places.spec.ts` на нього спирається.
 *
 * Якщо воркера немає взагалі (його вимкнули або сторінка поза scope),
 * функція мовчки виходить: барʼєр не має ставати новою причиною падінь.
 */
export type ServiceWorkerBarrierResult =
  "controlling" | "no-service-worker" | "timeout";

export async function waitForServiceWorkerActivated(
  page: Page,
  timeout = 30_000,
): Promise<ServiceWorkerBarrierResult> {
  return page.evaluate(async (limit) => {
    if (!("serviceWorker" in navigator)) return "no-service-worker" as const;
    const deadline = Date.now() + limit;
    let sawRegistration = false;
    for (;;) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) sawRegistration = true;
      // Контроль, а не стан: `activated` настає ДО того, як
      // `clients.claim()` у `waitUntil` добігає (див. докстрінг).
      if (
        reg?.active?.state === "activated" &&
        !reg.installing &&
        !reg.waiting &&
        navigator.serviceWorker.controller
      ) {
        return "controlling" as const;
      }
      if (Date.now() > deadline) {
        return sawRegistration
          ? ("timeout" as const)
          : ("no-service-worker" as const);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }, timeout);
}
