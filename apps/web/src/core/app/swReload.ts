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
let explicitUpdateAt: number | null = null;
let reloading = false;

/**
 * Вікно після кліку «Оновити», у якому активація вважається своєчасною.
 * Нормальна активація займає 1.3-1.6 с; пізніша означає lame-duck старого
 * воркера (rel-14), і тоді reload гейтиться повністю.
 */
export const EXPLICIT_UPDATE_WINDOW_MS = 3_000;

/** Ця вкладка ініціювала оновлення («Оновити» або idle auto-skipWaiting). */
export function markLocalUpdateRequested(): void {
  localUpdateRequested = true;
}

/** Людина щойно натиснула «Оновити»: те саме, плюс мітка часу кліку. */
export function markExplicitUpdateRequested(): void {
  localUpdateRequested = true;
  explicitUpdateAt = Date.now();
}

function isTimelyExplicitUpdate(): boolean {
  return (
    explicitUpdateAt !== null &&
    Date.now() - explicitUpdateAt < EXPLICIT_UPDATE_WINDOW_MS
  );
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
 *
 * Своєчасна активація після кліку «Оновити» не зважає на трекер інлайн-полів:
 * клік і є згодою, а трекер рахує і вже збережені поля, тож клік «нічого не
 * робив». Пізня активація гейтиться повністю, як і раніше.
 */
export function reloadUnlessBlocked(
  win: Window = window,
  isMutating?: () => boolean,
): boolean {
  if (
    isForcedReloadBlocked(isMutating, {
      ignoreTypedInput: isTimelyExplicitUpdate(),
    })
  ) {
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
  explicitUpdateAt = null;
  reloading = false;
}
