/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Скидання id пристрою (`X-Origin-Device-Id`) після стирання локальних даних.
 *
 * **Навіщо.** Сервер на pull відсіює оп-и, чий `origin_device_id` дорівнює
 * нашому: вважає, що пристрій їх і так має. Після виходу з акаунта локальна
 * копія стерта, тож пристрій мусить стати «новим», інакше власні записи після
 * входу не повертаються (виміряно 2026-08-06). Відтоді вихід викликав
 * `webKVStore.remove(...)`, але з 2026-09-15 KV розділений по файлах
 * розділів: id мінтиться й лежить в АНОНІМНОМУ розділі (рушій синку стартує
 * до входу, на ньому), а `remove` на виході влучав лише в розділ акаунта.
 * Наступний старт читав із анонімного розділу той самий id (відтворено тестом
 * 2026-11-19). Розділ на момент виходу вже закритий, а відкривати його заради
 * одного ключа посеред виходу (перед повним перезавантаженням сторінки, яке
 * обірвало б асинхронний запис) ненадійно.
 *
 * **Як.** Стирання локальних даних (`purgeAppOwnedLocalData`: вихід і
 * identity-wipe) ставить у СИРИЙ `localStorage` позначку
 * {@link ORIGIN_DEVICE_RESET_MARKER}; сирий LS переживає перезавантаження й
 * не залежить від розділу. На наступному старті рушій синку, ще до першого
 * push/pull, бачить позначку, мінтить новий id, перезаписує ним старий у
 * активному KV (анонімний розділ) і знімає позначку. Позначка знімається
 * ПІСЛЯ запису id: обрив між ними лише дасть ще одне скидання наступного разу.
 *
 * Для даних це вже не критично: копія без позначки відновлення сама тягне
 * журнал разом із власними оп-ами (`replicaBootstrap.ts`). Новий id лишає
 * коректним фільтр власного ехо на звичайних pull-ах.
 */
import type { KVStore } from "@sergeant/shared";
import { resolveOriginDeviceId } from "@sergeant/shared";
import { resolveLsStore } from "@shared/lib/storage/storage";

/**
 * Ключ позначки в сирому `localStorage`. Префікс `sergeant.` — app-owned, тож
 * `purgeLocalData.ts` тримає його у списку тих, що переживають чистку.
 */
export const ORIGIN_DEVICE_RESET_MARKER = "sergeant.sync.originDeviceReset.v1";

type MarkerStore = Pick<KVStore, "getString" | "setString" | "remove">;

/** Попросити новий id пристрою на наступному старті. Не кидає. */
export function requestOriginDeviceReset(
  ls: MarkerStore | null = resolveLsStore(),
): void {
  try {
    ls?.setString(ORIGIN_DEVICE_RESET_MARKER, "1");
  } catch {
    // Без сирого LS скидання не попросити; дані все одно відновить
    // `replicaBootstrap.ts`.
  }
}

/**
 * Id пристрою на старті рушія синку: новий, якщо стирання попросило про це,
 * інакше збережений (або щойно змінтований, як раніше).
 */
export function resolveBootOriginDeviceId(
  store: Pick<KVStore, "getString" | "setString">,
  options: { ls?: MarkerStore | null; randomUUID?: () => string } = {},
): string {
  const ls = options.ls === undefined ? resolveLsStore() : options.ls;
  const randomUUID = options.randomUUID;
  let resetRequested = false;
  try {
    resetRequested = ls?.getString(ORIGIN_DEVICE_RESET_MARKER) != null;
  } catch {
    resetRequested = false;
  }
  if (!resetRequested) {
    return resolveOriginDeviceId(
      randomUUID ? { store, randomUUID } : { store },
    );
  }
  // Той самий мінтинг, що й у `resolveOriginDeviceId`, але старе значення
  // ігнорується, а нове перезаписує його в активному KV.
  const blank = {
    getString: () => null,
    setString: (key: string, value: string) => store.setString(key, value),
  };
  const fresh = resolveOriginDeviceId(
    randomUUID ? { store: blank, randomUUID } : { store: blank },
  );
  try {
    ls?.remove(ORIGIN_DEVICE_RESET_MARKER);
  } catch {
    // Позначка лишилась: наступний старт скине id ще раз, і все.
  }
  return fresh;
}
