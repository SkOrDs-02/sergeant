/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * Синхронізація налаштувань вигляду хаба з акаунтом.
 *
 * Продуктовий огляд 2026-09-13, знахідка PR-S13; рішення founder-а
 * 2026-09-14 — «завести серверний канал». До міграції 137 пʼять тумблерів
 * головної (`calmMode`, `adaptiveBento`, `showTodayFocus`, `showInsights`,
 * `showMotivational`) жили ЛИШЕ в `hub_prefs_v1` у localStorage, хоча
 * `PlanSection` продає cloud-sync між пристроями, а сусідні шість ключів
 * налаштувань уже їздять на акаунт. Людина, яка вимкнула «Мотиваційний
 * підпис» на телефоні, бачила його знову на ноутбуці.
 *
 * Це НЕ oplog-sync сутність (`sync_op_log` + нормалізовані таблиці):
 * жменя скалярних прапорців без крос-модульних запитів, тож вона їде
 * через уже наявний write-through `/api/me/preferences` — точно як
 * `activeModules` (`core/hub/activeModulesSync.ts`), за зразком якого цей
 * модуль і зроблений.
 *
 * Три стани `hubPrefs` у відповіді сервера, і всі три різні:
 *  - `null` — серверних налаштувань ще немає (nullable-колонка без DEFAULT);
 *  - `{}` — налаштування є, і всі дефолтні;
 *  - непорожній обʼєкт — власне налаштування.
 *
 * **Розвʼязання конфлікту — LWW по всьому мішку, не по ключах.** Пʼять
 * тумблерів живуть на одному екрані (`DashboardSection`) і перемикаються
 * там же, тож пер-ключові мітки часу були б над-інженерією: вони рятують
 * від «на телефоні змінив A, на ноуті B, обидва мають вижити», а цей
 * сценарій тут вимагає редагувати ту саму сторінку налаштувань на двох
 * пристроях одночасно.
 */

import { meApi } from "@shared/api";
import { logger } from "@shared/lib";

/**
 * Лічильник локальних змін. Читає `hydrateHubPrefs`, щоб не затерти
 * щойно перемкнутий тумблер відповіддю, яку сервер сформував ДО нього.
 *
 * Лічильник, а не мітка часу, і причина та сама, що в
 * `activeModulesSync`: `Date.now()` має роздільність у мілісекунду, і два
 * сусідні виклики цілком можуть дати одне число — тобто порівняння стало
 * б неоднозначним рівно там, де гонка й живе.
 */
let prefsGeneration = 0;

/**
 * Чи є взагалі кому синхронізувати. Ставить `useHubPrefsSync` на вході в
 * акаунт і знімає на виході.
 *
 * Без цього прапорця КОЖЕН перемкнутий тумблер у гостя слав би PATCH,
 * приречений на 401, і писав би `[hubPrefs] push failed` у лог — тобто
 * шум на рівному місці для найчастішого стану демо-режиму.
 *
 * Є і друга причина, менш очевидна й важливіша: без гарду локальні
 * налаштування, накручені ДО входу, поїхали б на акаунт першим же
 * перемиканням після логіну — ще до того, як гідратація встигне
 * запитати, що на цьому акаунті вже є. Гість на чужому ноутбуці міг би
 * так перезаписати налаштування власника.
 */
let syncEnabled = false;

/** Вмикає/вимикає вихідний канал. Кличе лише boot-хук. */
export function setHubPrefsSyncEnabled(enabled: boolean): void {
  syncEnabled = enabled;
}

/** Значення, які мішок може нести. Дзеркалить Zod-межу на сервері. */
export type HubPrefsBag = Record<string, string | number | boolean>;

/**
 * Записати локальні налаштування на акаунт. Fire-and-forget: локальний KV
 * уже оновлено викликачем, тож мережева помилка не має ні падати в UI, ні
 * відкочувати тумблер — наступний бут усе одно доллє (`hydrateHubPrefs`
 * піднімає локальні, коли на сервері ще `null`).
 */
export function pushHubPrefs(bag: HubPrefsBag): void {
  prefsGeneration += 1;
  if (!syncEnabled) return;
  void meApi
    .updatePreferences({ hubPrefs: { ...bag } })
    .catch((err: unknown) => {
      logger.warn("[hubPrefs] push failed", err);
    });
}

/** Скидання module-scoped стану між тестами. */
export function __resetHubPrefsSyncForTests(): void {
  prefsGeneration = 0;
  syncEnabled = true;
}

/**
 * Звести серверні й локальні налаштування на старті сесії.
 *
 * Правило асиметричне, дзеркально до `hydrateActiveModules`:
 *  - сервер знає (`!== null`) → він і виграє. Це і є полагоджений сценарій
 *    «новий пристрій»: локально там дефолти, і без цієї гілки людина
 *    побачила б не свої налаштування;
 *  - сервер не знає (`null`), а локально щось є → доливаємо локальне
 *    вгору. Так усі, хто налаштовував хаб ДО 137, безшовно отримують свої
 *    налаштування на акаунті без жодної дії з їхнього боку;
 *  - обидва порожні → нічого не робимо. Писати `{}` означало б «людина
 *    свідомо лишила все дефолтним», а вона просто ще не чіпала.
 *
 * AI-DANGER: серверна гілка НЕ виконується, якщо людина перемкнула тумблер,
 * поки цей запит був у польоті. `pushHubPrefs` — fire-and-forget PATCH, а
 * гідратація — окремий GET на буті; порядок між ними не гарантований
 * нічим. Без перевірки послідовність «бут почався → людина перемкнула
 * тумблер → приїхала відповідь бута зі СТАРИМ станом» закінчилась би тим,
 * що застосування серверного стану відкотило б свіжий перемикач на очах.
 * Свіже значення при цьому вже їде на сервер своїм PATCH-ом, тобто скіп
 * нічого не втрачає — це LWW за наміром. Той самий баг уже ловили на
 * `activeModules` (browser-QA 2026-09-02), тож тут він закритий одразу.
 */
export async function hydrateHubPrefs(
  readLocal: () => HubPrefsBag,
  writeLocal: (bag: HubPrefsBag) => void,
): Promise<void> {
  const generationAtStart = prefsGeneration;
  const prefs = await meApi.getPreferences();
  if (prefsGeneration !== generationAtStart) return;

  const local = readLocal();

  if (prefs.hubPrefs !== null && prefs.hubPrefs !== undefined) {
    const remote = prefs.hubPrefs;
    if (!sameBag(remote, local)) writeLocal({ ...remote });
    return;
  }

  if (Object.keys(local).length > 0) pushHubPrefs(local);
}

/**
 * Порівняння по вмісту, не по посиланню. Порядок ключів тут НЕ частина
 * значення (на відміну від `activeModules`, де порядок — сам вибір), тож
 * ключі сортуються перед звіркою.
 */
function sameBag(a: HubPrefsBag, b: HubPrefsBag): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length) return false;
  return ka.every((key, i) => kb[i] === key && a[key] === b[key]);
}
