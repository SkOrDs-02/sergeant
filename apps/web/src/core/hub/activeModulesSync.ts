/**
 * Синхронізація вибору модулів («Що тобі важливо?») з акаунтом.
 *
 * Браузерний профільний аудит 2026-08-05, знахідка B2 (частина 2). До
 * міграції 116 вибір жив ЛИШЕ в локальному KV (`hub_onboarding_vibes_v1`
 * на web, MMKV на mobile) і не входив у cloud-sync. Наслідок, який видно
 * на профілі «returning user, новий пристрій»: доменні дані підтягуються
 * коректно, а вибір модулів — ні, і хаб рендериться з фолбеком «усі
 * чотири» людині, яка місяць тому лишила два.
 *
 * Це НЕ oplog-sync сутність (`sync_op_log` + нормалізовані таблиці):
 * вибір — крихітний LWW-масив без крос-модульних запитів, тож він їде
 * через уже наявний write-through `/api/me/preferences`, як
 * `analytics` / `ai_memory` / `push_notifications`.
 *
 * Три стани `activeModules` у відповіді сервера, і всі три різні:
 *  - `null` — серверного вибору ще немає (nullable-колонка без DEFAULT);
 *  - `[]` — вибір є, і він порожній;
 *  - непорожній масив — власне вибір, у порядку, який зробила людина.
 */

import {
  getVibePicks,
  sanitizePicks,
  saveVibePicks,
  type DashboardModuleId,
} from "@sergeant/shared";
import { meApi } from "@shared/api";
import { logger } from "@shared/lib";
import { webKVStore } from "@shared/lib/storage/storage";

/**
 * Записати локальний вибір на акаунт. Fire-and-forget: локальний KV уже
 * оновлено викликачем, тож мережева помилка не має ні падати в UI, ні
 * відкочувати вибір — наступний boot усе одно доллє (`hydrate` нижче
 * піднімає локальний вибір, коли на сервері ще `null`).
 */
export function pushActiveModules(ids: readonly DashboardModuleId[]): void {
  void meApi
    .updatePreferences({ activeModules: [...ids] })
    .catch((err: unknown) => {
      logger.warn("[activeModules] push failed", err);
    });
}

/**
 * Звести серверний і локальний вибір на старті сесії.
 *
 * Правило навмисно асиметричне:
 *  - сервер знає вибір (`!== null`) → він і виграє. Це і є полагоджений
 *    сценарій «новий пристрій»: локально там порожньо, і без цієї гілки
 *    людина побачила б дефолт.
 *  - сервер не знає (`null`), а локально вибір є → доливаємо локальний
 *    угору. Так усі, хто проходив візард ДО 116, безшовно отримують
 *    свій вибір на акаунті без жодної дії з їхнього боку.
 *  - обидва порожні → нічого не робимо: писати `[]` означало б «людина
 *    свідомо вимкнула все», а вона просто ще не обирала.
 */
export async function hydrateActiveModules(): Promise<void> {
  const prefs = await meApi.getPreferences();
  const local = getVibePicks(webKVStore);

  if (prefs.activeModules !== null) {
    // `sanitizePicks` тут не косметика: сервер міг віддати id, якого в
    // цій версії клієнта вже немає (rolling deploy у зворотний бік).
    const remote = sanitizePicks(prefs.activeModules);
    if (!sameSelection(remote, local)) saveVibePicks(webKVStore, remote);
    return;
  }

  if (local.length > 0) pushActiveModules(local);
}

/** Порядок — частина вибору, тож порівнюємо позиційно, не як множини. */
function sameSelection(
  a: readonly DashboardModuleId[],
  b: readonly DashboardModuleId[],
): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
