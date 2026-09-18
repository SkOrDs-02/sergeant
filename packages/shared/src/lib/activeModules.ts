/**
 * Active modules — derived from the user's onboarding "vibe picks"
 * plus a "hide inactive" UI toggle.
 *
 * The onboarding wizard step 2 ("Що тобі важливо?") writes the user's
 * selection to {@link VIBE_PICKS_KEY}. Any module not in that list is
 * considered *inactive* on the Hub dashboard:
 *  - it still renders, but in a muted/greyed-out state;
 *  - its quick-add affordance is suppressed;
 *  - a hint points the user at Hub Settings to reactivate it.
 *
 * If the persisted picks list is missing or empty (e.g. fresh install,
 * cleared storage, or the user tapped through the wizard without
 * selecting anything — see `buildFinalPicks`'s ALL_MODULES fallback),
 * we fall back to "all modules active" so existing accounts behave
 * identically to before this feature landed.
 *
 * The {@link HIDE_INACTIVE_MODULES_KEY} toggle (default: `false`)
 * lets the user collapse the inactive tiles entirely instead of
 * showing them muted.
 *
 * DOM-free: callers wire the platform-specific {@link KVStore}
 * (localStorage on web, MMKV on mobile).
 */

import { type DashboardModuleId } from "./dashboard";
import { type KVStore } from "../storage/kv";
import { ALL_MODULES, getVibePicks, saveVibePicks } from "./vibePicks";

/**
 * localStorage / MMKV key for the "hide inactive modules" boolean
 * toggle. Stored as the literal string `"1"` when on; absent or any
 * other value means off.
 */
export const HIDE_INACTIVE_MODULES_KEY = "hub_hide_inactive_modules_v1";

/**
 * Return the set of modules the user marked as active during
 * onboarding (or via Hub Settings).
 *
 * **Політика порожнього вибору: немає збереженого вибору → всі модулі.**
 *
 * Історія. До 2026-08-05 тут було три гілки: `picks > 0` → picks;
 * `isOnboardingDone` → {@link ALL_MODULES}; інакше → `[]`. Порожній масив
 * для «ще не онбордженого» — свідоме рішення S6.1: до нього візард на
 * tap-through тихо підставляв усі чотири модулі, і людина отримувала
 * заповнений хаб, якого не обирала; аудит звʼязав це з просіданням D7.
 *
 * Чому повертаємось до «всі чотири» (браузерний аудит 2026-08-05,
 * знахідка B2). Гілка `[]` спрацьовує НЕ лише для того, хто пройшов візард
 * і нічого не обрав. Вона спрацьовує щоразу, коли візарда взагалі не було:
 *
 *   1. Людина реєструється напряму через `/sign-in` — на `/welcome` її не
 *      веде, бо туди потрапляє лише неавтентифікований відвідувач. Одразу
 *      після signup вона бачить хаб з «Модулів увімкнено: 0 з 4» і всіма
 *      чотирма плитками в стані «Неактивний».
 *   2. Той самий акаунт на новому пристрої: дані з сервера підтягуються
 *      коректно, а вибір модулів — ні, бо він живе лише в локальному KV
 *      (`hub_onboarding_vibes_v1` не входить у cloud-sync). Хаб знову
 *      показує «0 з 4» людині, яка місяць користується застосунком.
 *
 * В обох випадках порожній вибір означає «ми не знаємо, що вона обрала»,
 * а не «вона обрала нічого» — і показувати мертвий хаб тут неправильно.
 * Початковий інтент S6.1 при цьому не втрачено: візард має вимкнену
 * основну CTA, поки нічого не вибрано, тож будь-хто, хто ЙОГО проходить,
 * робить реальний вибір і потрапляє в гілку `picks > 0`.
 *
 * Друга половина знахідки B2 — синхронізація вибору з акаунтом, щоб на
 * новому пристрої підтягувався справжній вибір, а не дефолт.
 */
export function getActiveModules(store: KVStore): DashboardModuleId[] {
  const picks = getVibePicks(store);
  if (picks.length > 0) return picks;
  return [...ALL_MODULES];
}

/**
 * Persist the user's active-module selection. A no-op-style empty
 * input is intentionally allowed — `getActiveModules` will then fall
 * back to "all modules" until the user picks again.
 */
export function setActiveModules(
  store: KVStore,
  ids: readonly DashboardModuleId[],
): void {
  saveVibePicks(store, ids);
}

/** True when {@link id} is in the user's active-module list. */
export function isActiveModule(
  active: readonly DashboardModuleId[],
  id: DashboardModuleId,
): boolean {
  return active.includes(id);
}

/** True when the user has opted to hide inactive modules entirely. */
export function getHideInactiveModules(store: KVStore): boolean {
  return store.getString(HIDE_INACTIVE_MODULES_KEY) === "1";
}

/**
 * Persist the "hide inactive modules" toggle. `true` writes `"1"`,
 * `false` removes the key so a future read returns the default
 * (`false`).
 */
export function setHideInactiveModules(store: KVStore, hide: boolean): void {
  if (hide) {
    store.setString(HIDE_INACTIVE_MODULES_KEY, "1");
  } else {
    store.remove(HIDE_INACTIVE_MODULES_KEY);
  }
}

/**
 * Flip the "hide inactive modules" toggle. Returns the new value so
 * callers can update local component state without a second read.
 */
export function toggleHideInactiveModules(store: KVStore): boolean {
  const next = !getHideInactiveModules(store);
  setHideInactiveModules(store, next);
  return next;
}
