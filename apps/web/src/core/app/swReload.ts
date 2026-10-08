/**
 * Координація reload-ів під оновлення сервіс-воркера (data-45 / rel-14).
 *
 * `vite-plugin-pwa` вішає слухач `controlling`, який у КОЖНІЙ вкладці, де
 * піднімали плашку оновлення, робить `location.reload()` (лише за
 * `isUpdate`). Тому прийняте в одній вкладці оновлення мовчки перезавантажувало
 * всі інші разом з їхніми незбереженими формами. Тепер `main.tsx` передає
 * власний `onNeedReload`, а рішення «чи ця вкладка ініціювала оновлення»
 * живе тут.
 *
 * Прапорець — module-level (одна вкладка = один JS-контекст), у
 * `sessionStorage` його свідомо немає: він потрібен лише на час життя
 * поточної сторінки.
 */

let localUpdateRequested = false;
let reloading = false;

/** Ця вкладка ініціювала оновлення («Оновити» або idle auto-skipWaiting). */
export function markLocalUpdateRequested(): void {
  localUpdateRequested = true;
}

export function isLocalUpdateRequested(): boolean {
  return localUpdateRequested;
}

/**
 * `location.reload()` не більше одного разу на життя сторінки. Його можуть
 * покликати і `controllerchange` з `applyUpdate`, і `onNeedReload` з
 * `vite-plugin-pwa` — подвійний reload обірвав би навігацію.
 */
export function reloadOnce(win: Window = window): void {
  if (reloading) return;
  reloading = true;
  win.location.reload();
}

/** Подія для вкладок, які оновлення НЕ ініціювали: тост замість reload. */
export const PWA_RELOAD_DEFERRED_EVENT = "pwa-reload-deferred";

/**
 * Обробник `onNeedReload` для `registerSW`: reload лише у вкладці, що
 * ініціювала оновлення; в інших — подія, яку показує `useSWUpdate` тостом.
 */
export function handleNeedReload(win: Window = window): void {
  if (isLocalUpdateRequested()) {
    reloadOnce(win);
    return;
  }
  win.dispatchEvent(new CustomEvent(PWA_RELOAD_DEFERRED_EVENT));
}

/** Лише для тестів. */
export function resetSwReloadForTests(): void {
  localUpdateRequested = false;
  reloading = false;
}
