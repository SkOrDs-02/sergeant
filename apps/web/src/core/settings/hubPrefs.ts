import { useEffect, useState } from "react";
import { z } from "zod";
import { STORAGE_KEYS } from "@sergeant/shared";
import {
  safeReadLSValidated,
  safeReadStringLS,
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

/**
 * Імена ключів усередині мішка. Константи, а не літерали по місцях:
 * читач і писар кожного налаштування живуть у різних файлах, і розійтись
 * рядком тут — питання часу, а помилка була б тихою (значення просто
 * «не знайшлось», і людина побачила б дефолт).
 */
export const HUB_PREF_MONDAY_AUTO = "mondayAutoDigest";

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
 * Переїзд хабового налаштування зі свого ключа у спільний мішок.
 *
 * Автогенерація дайджесту щопонеділка жила у власному ключі
 * `localStorage` і НЕ їхала на акаунт — залишок знахідки PR-S13, яку для
 * тумблерів головної закрив PR #1195. Мішок `hub_prefs_v1` уже має
 * серверний канал, тож переїзд дає їй синхронізацію без нової колонки:
 * це скаляр, а мішок навмисно відкритий. Щільність дашборда мігрувала
 * тут само, доки жила стара сітка; з її зняттям (`hub-action-axis.md`
 * PR 3) міграцію прибрано, а збережене значення `density` у мішку лишається
 * нечитаним.
 *
 * AI-DANGER: викликати ЛИШЕ ПІСЛЯ гідратації, і це не стилістика.
 * Запис у мішок іде через `saveHubPref` → `pushHubPrefs`, а той зсуває
 * лічильник поколінь. Зроблений під час бутового GET-а, він змусив би
 * `hydrateHubPrefs` відкинути серверну відповідь як застарілу — рівно та
 * гонка, яку закривали в #1195. Після гідратації ж переїзд безпечний і
 * навіть потрібен: якщо на акаунті ключа немає, локальне значення
 * доллється вгору звичайним шляхом.
 *
 * Ідемпотентна: ключ, який у мішку вже є (свій чи серверний), не чіпається.
 * Старі ключі НЕ видаляються — двофазність, як для DROP у міграціях:
 * відкат клієнта не має знецінити вибір людини.
 */
export function migrateLegacyHubPrefs(): void {
  const prefs = loadHubPrefs();
  const next: HubPrefs = { ...prefs };
  let changed = false;

  if (!(HUB_PREF_MONDAY_AUTO in prefs)) {
    // Історична форма — рядок «1»/«0», причому ВІДСУТНІСТЬ означала
    // «увімкнено» (дефолт ON з 2026-08-30). Тож мігруємо лише явний
    // opt-out: інакше записали б у мішок значення, якого людина не
    // обирала, і затерли б ним дефолт на іншому пристрої.
    //
    // AI-NOTE: читаємо `safeReadStringLS`, і це не стиль. `safeWriteLS`
    // пропускає РЯДОК наскрізь, без лапок, тож у сховищі лежить один
    // символ `0`. `safeReadLS` розбирає його як JSON і повертає ЧИСЛО 0 —
    // саме через це старий предикат `... !== "0"` був істинним завжди, і
    // вимкнений тумблер не переживав перезавантаження (розбір у § PR-S13
    // аудиту). Пара «пиши рядком → читай `safeReadStringLS`» — єдина
    // правильна для таких прапорців.
    const raw = safeReadStringLS(STORAGE_KEYS.WEEKLY_DIGEST_MONDAY_AUTO);
    if (raw === "0") {
      next[HUB_PREF_MONDAY_AUTO] = false;
      changed = true;
    }
  }

  if (!changed) return;
  safeWriteLS(HUB_PREFS_KEY, next);
  notifyHubPrefsChanged();
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
