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
 * Reload під оновлення SW ніколи не відбувається «мовчки» поверх
 * незбереженого вводу: і `controllerchange` з `applyUpdate`, і `onNeedReload`
 * проходять через {@link reloadUnlessBlocked}. Пізня активація (старий воркер
 * тримав lame-duck до 5 хв) прилітає тоді, коли користувач уже давно
 * працює далі, — клік «Оновити» цього reload не виправдовує.
 *
 * Прапорець — module-level (одна вкладка = один JS-контекст), у
 * `sessionStorage` його свідомо немає: він потрібен лише на час життя
 * поточної сторінки.
 */

import { isForcedReloadBlocked } from "./updateGate";

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

/** Подія «reload відкладено»: `useSWUpdate` показує тост замість reload. */
export const PWA_RELOAD_DEFERRED_EVENT = "pwa-reload-deferred";

/**
 * Чому reload відкладено: оновлення прийняли в іншій вкладці / є незбережений
 * ввід / ліниво підвантажений чанк зі старим хешем дав 404 (`chunkReload.ts`),
 * а в цій вкладці є що втрачати.
 */
export type ReloadDeferredReason =
  "other-tab" | "unsaved-input" | "stale-chunk";

export interface ReloadDeferredDetail {
  reason: ReloadDeferredReason;
}

/** Повідомити `useSWUpdate`, що reload відкладено (тост з ручною кнопкою). */
export function deferReload(win: Window, reason: ReloadDeferredReason): void {
  win.dispatchEvent(
    new CustomEvent<ReloadDeferredDetail>(PWA_RELOAD_DEFERRED_EVENT, {
      detail: { reason },
    }),
  );
}

/**
 * Reload, якщо в цій вкладці немає чого втрачати (відкрита форма, непорожнє
 * поле, стрім HubChat, мутації в польоті — {@link isForcedReloadBlocked}).
 * Інакше — подія відкладення, тост з ручним «Перезавантажити». Повертає
 * `true`, якщо reload запущено.
 */
export function reloadUnlessBlocked(
  win: Window = window,
  isMutating?: () => boolean,
): boolean {
  if (isForcedReloadBlocked(isMutating)) {
    deferReload(win, "unsaved-input");
    return false;
  }
  reloadOnce(win);
  return true;
}

/**
 * Обробник `onNeedReload` для `registerSW`: reload лише у вкладці, що
 * ініціювала оновлення; в інших — подія, яку показує `useSWUpdate` тостом.
 */
export function handleNeedReload(
  win: Window = window,
  isMutating?: () => boolean,
): void {
  if (isLocalUpdateRequested()) {
    reloadUnlessBlocked(win, isMutating);
    return;
  }
  deferReload(win, "other-tab");
}

/** Лише для тестів. */
export function resetSwReloadForTests(): void {
  localUpdateRequested = false;
  reloading = false;
}
