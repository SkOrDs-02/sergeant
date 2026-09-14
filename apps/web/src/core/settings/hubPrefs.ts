import { useEffect, useState } from "react";
import { z } from "zod";
import { STORAGE_KEYS } from "@sergeant/shared";
import {
  safeReadLSValidated,
  safeWriteLS,
  webKVStore,
} from "@shared/lib/storage/storage";
import { HubPrefsSchema, type HubPrefs } from "./hubPrefs.schema";
import {
  pushHubPrefs,
  __setHubPrefsUnsyncedAdapter,
  type HubPrefsBag,
} from "./hubPrefsSync";

const HUB_PREFS_KEY = STORAGE_KEYS.HUB_PREFS;

function loadHubPrefs(): HubPrefs {
  return safeReadLSValidated(HUB_PREFS_KEY, HubPrefsSchema, {});
}

/**
 * Локальний мішок → форма, яку приймає сервер (PR-S13, міграція 137).
 *
 * Фільтр не косметичний. Локальна схема навмисно відкрита
 * (`z.record(z.string(), z.unknown())`), а серверна межа — скаляри:
 * `boolean`, рядок до 256, скінченне число. Без цього відсіювання
 * будь-який прапорець-обʼєкт, покладений сюди в майбутньому, валив би
 * КОЖЕН PATCH налаштувань із 400, і виглядало б це як «налаштування
 * перестали зберігатись», а не як «один прапорець не тієї форми».
 *
 * Локально такий прапорець при цьому продовжує працювати — він просто не
 * їде на акаунт. Це свідомий компроміс на користь того, щоб одна нова
 * фіча не ламала синхронізацію решти.
 */
export function toServerBag(prefs: HubPrefs): HubPrefsBag {
  const out: HubPrefsBag = {};
  for (const [key, value] of Object.entries(prefs)) {
    if (key.length === 0 || key.length > 64) continue;
    if (typeof value === "boolean") out[key] = value;
    else if (typeof value === "string" && value.length <= 256) out[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Мітка «локальні налаштування мають зміну, якої сервер ще не підтвердив».
 *
 * Черга відправки живе в памʼяті модуля й не переживає перезавантаження,
 * тож без цієї мітки зміна, чий PATCH упав, зникала б: на наступному буті
 * гідратація побачила б не-`null` СТАРИЙ серверний мішок і перезаписала
 * ним свіжіше локальне значення (знахідка рев'ю на #1195).
 */
export function setHubPrefsUnsynced(unsynced: boolean): void {
  if (unsynced) {
    safeWriteLS(STORAGE_KEYS.HUB_PREFS_UNSYNCED, true);
  } else {
    webKVStore.remove(STORAGE_KEYS.HUB_PREFS_UNSYNCED);
  }
}

/** Чи лишилась незбережена локальна зміна з попередньої сесії. */
export function hasHubPrefsUnsynced(): boolean {
  return safeReadLSValidated(
    STORAGE_KEYS.HUB_PREFS_UNSYNCED,
    z.boolean(),
    false,
  );
}

// Персистентність мітки підключається сюди, а не імпортується всередині
// `hubPrefsSync.ts`: той модуль уже імпортується звідси, і прямий імпорт
// назад замкнув би кільце.
__setHubPrefsUnsyncedAdapter({
  mark: setHubPrefsUnsynced,
  has: hasHubPrefsUnsynced,
});

/** Читання локального мішка у серверній формі — для гідратації. */
export function readHubPrefsBag(): HubPrefsBag {
  return toServerBag(loadHubPrefs());
}

/**
 * Сповістити слухачів у ЦІЙ вкладці, що мішок змінився.
 *
 * Браузер сам шле `storage` лише в ІНШІ вкладки, тож без цього виклику
 * `useHubPref` у тій самій вкладці не перемалювався б після власного
 * запису.
 *
 * **Другий аргумент тут несучий, попри те, що CodeQL позначає його як
 * «superfluous trailing argument» (алерт 458, правило
 * `js/superfluous-trailing-arguments`).** Це хибний спрацьовок: підпис
 * `StorageEvent(type, eventInitDict?)` — стандартний DOM API, і саме
 * `key` вирішує, чи слухач відреагує: предикат нижче — `e.key ===
 * HUB_PREFS_KEY || e.key === null`. Подія без `key` дала б `undefined`,
 * не пройшла б жодну з двох гілок, і зміна тумблера мовчки не доїхала б
 * до сусіднього компонента в тій самій вкладці. Прибирати аргумент, щоб
 * задовольнити сканер, означало б зламати робочий код заради зеленого
 * значка.
 */
function notifyHubPrefsChanged(): void {
  window.dispatchEvent(new StorageEvent("storage", { key: HUB_PREFS_KEY }));
}

/** Запис серверного мішка в локальне сховище — для гідратації. */
export function writeHubPrefsBag(bag: HubPrefsBag): void {
  safeWriteLS(HUB_PREFS_KEY, { ...bag });
  notifyHubPrefsChanged();
}

function saveHubPref(key: string, value: unknown): void {
  const prefs = loadHubPrefs();
  const next = { ...prefs, [key]: value };
  safeWriteLS(HUB_PREFS_KEY, next);
  notifyHubPrefsChanged();
  // PR-S13: мішок їде на акаунт ЦІЛКОМ, а не по одному ключу — саме тому
  // LWW тут по всьому мішку (розбір у `hubPrefsSync.ts`). Fire-and-forget:
  // локальний запис уже стався, і мережа не має відкочувати тумблер.
  pushHubPrefs(toServerBag(next));
}

/**
 * Reactive single-pref hook that stays in sync with cross-tab `storage`
 * events and the same-tab StorageEvent dispatched by `saveHubPref`.
 */
export function useHubPref<T>(
  key: string,
  defaultValue: T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const prefs = loadHubPrefs();
    return key in prefs ? (prefs[key] as T) : defaultValue;
  });

  useEffect(() => {
    const read = (): T => {
      const prefs = loadHubPrefs();
      return key in prefs ? (prefs[key] as T) : defaultValue;
    };
    const handler = (e: StorageEvent) => {
      if (e.key === HUB_PREFS_KEY || e.key === null) setValue(read());
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [key, defaultValue]);

  const update = (next: T) => {
    setValue(next);
    saveHubPref(key, next);
  };

  return [value, update];
}
