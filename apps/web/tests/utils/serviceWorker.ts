import type { Page } from "@playwright/test";

/**
 * Барʼєр перед `page.reload()` в E2E: дочекатися, поки сервіс-воркер
 * добʼє `install`.
 *
 * AI-DANGER: без цього барʼєра рестарт сторінки — це гонка, а не крок
 * сценарію, і саме вона тричі ламала `pantry-storage-places`
 * (`d185347` → `abd0435` → `3a69108`, щоразу підкручуванням таймінгу).
 *
 * Механіка. `precacheAndRoute` кладе весь прекеш (400 записів, 6.6 МБ)
 * у `event.waitUntil` події `install`, тож воркер не може стати
 * `activated`, поки прекеш не завершився. Заміри на цьому репо: install
 * добігає приблизно на 4.0 с після завантаження сторінки, а тест
 * доходить до рестарту приблизно на 4-5 с. Тобто `reload` стріляє
 * РІВНО на межі переходу install → activate, і хто з них перший —
 * вирішує швидкість машини:
 *
 *   • воркер ще `installing` — навігація йде повз нього, у мережу;
 *   • воркер уже `activated` — навігація йде через `NavigationRoute`;
 *   • перехід стається ПОСЕРЕД навігації — вона абортиться
 *     (`net::ERR_ABORTED; maybe frame was detached?` — рівно те, що CI
 *     показав на версії без барʼєра dual-write).
 *
 * Заміряно в цьому ж репо: у прогонах того самого тесту стан перед
 * рестартом стрибав між `{installing:true, active:null}` і
 * `{installing:false, active:"activated"}` без жодної зміни коду —
 * різниця лише в тому, встиг прекеш чи ні.
 *
 * Барʼєр прибирає саме цю невизначеність: після нього рестарт завжди
 * відбувається в ОДНОМУ стані — прекеш завершено, воркер активний.
 * Це не «почекати трохи», а зняття третього варіанта.
 *
 * Якщо воркера немає взагалі (його вимкнули або сторінка поза scope),
 * функція мовчки виходить після `timeout`: барʼєр не має ставати новою
 * причиною падінь.
 */
export async function waitForServiceWorkerActivated(
  page: Page,
  timeout = 30_000,
): Promise<"activated" | "no-service-worker"> {
  return page.evaluate(async (limit) => {
    if (!("serviceWorker" in navigator)) return "no-service-worker" as const;
    const deadline = Date.now() + limit;
    for (;;) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.active?.state === "activated" && !reg.installing) {
        return "activated" as const;
      }
      if (Date.now() > deadline) return "no-service-worker" as const;
      await new Promise((r) => setTimeout(r, 50));
    }
  }, timeout);
}
