// Шифрування AI-історії у спокої (знахідка AIP-20260805-B24).
//
// Що захищаємо: історію чату (`hub_chat_sessions_v1`, дзеркало, легасі
// `hub_chat_history`) і Memory Bank (`hub_user_profile_v1`). Транскрипт чату
// за побудовою містить баланси, борги, здоровʼя й харчування; відкритий
// JSON у сховищі читає будь-який XSS в origin чи шкідливе розширення.
//
// Модель загрози і межі: AES-GCM з НЕекстрактовним `CryptoKey`, який лежить
// в IndexedDB (той самий підхід, що `lockStorage.ts`: ключ не можна
// витягнути як байти, лише використати з коду цього origin). Це закриває
// «зняли дамп localStorage/SQLite/OPFS» і «прочитали сховище без виконання
// коду в origin». Код, що вже виконується в origin (XSS), може викликати
// decrypt нашим ключем, тож від нього це не панацея.
//
// Область ключа: ОДИН на профіль браузера, не на користувача. Ізоляцію
// акаунтів тримає не ключ, а наявна механіка: власник-штамп
// (`reconcileChatOwnerOnAuthChange` стирає чат при зміні особи),
// партиції SQLite і `purgeLocalData` на виході. Ключ на користувача
// додав би IDB-стан, залежний від сесії (анонім → акаунт мусить зберегти
// чернетку), і новий клас втрати даних без виграшу в безпеці.
//
// Синхронність: споживачі (`loadSessions`, `readMemoryEntries`) синхронні, а
// WebCrypto асинхронний. Тому кожен слот тримає в памʼяті відкритий текст:
// читання синхронне з кешу, запис кладе текст у кеш одразу, а шифрування і
// фізичний запис ідуть асинхронно (останній запис перемагає). Кеш
// гідратується на буті (`hydrateAtRest`, `main.tsx` до `markStorageReady`) і
// після перемикання SQLite-розділу акаунта.
//
// Формат: `{"v":1,"iv":"<b64>","ct":"<b64>"}`; AAD = імʼя слота (шифртекст
// не можна підсунути під інший ключ). Новий `v` додається без зміни старих.
//
// Відмови: немає WebCrypto/IDB → слот працює відкритим текстом і один раз
// логує (чат важливіший за шифрування). Ключ загублено (IDB очищено) →
// шифртекст нечитний, слот вважається порожнім і лог, чат не падає.

import { logger } from "@shared/lib";
import { atRestWritesReleased, getAtRestWipeEpoch } from "./aiAtRestEpoch";
import type { Envelope } from "./aiAtRestCrypto";
import {
  safeReadStringLS,
  safeReadStringLSDurable,
  safeRemoveLS,
  safeRemoveLSDurable,
  safeWriteStringLSDurable,
  webKVStore,
} from "@shared/lib/storage/storage";
type KeyState = "idle" | "ready" | "unavailable";
let keyState: KeyState = "idle";

/** Синхронна перевірка середовища: без WebCrypto/IDB шифрувати нічим. */
function envSupportsCrypto(): boolean {
  return (
    typeof crypto !== "undefined" &&
    !!crypto.subtle &&
    typeof indexedDB !== "undefined"
  );
}

type CryptoModule = typeof import("./aiAtRestCrypto");
// Кеш модуля: після першого завантаження шифрування не чекає на `import()`,
// тож вікно між прийнятим записом і фізичним — лише сам `subtle.encrypt`.
let cryptoMod: CryptoModule | null = null;

async function loadCrypto(): Promise<CryptoModule> {
  cryptoMod ??= await import("./aiAtRestCrypto");
  return cryptoMod;
}

/** Підвантажує криптоядро і ключ; `false` — шифрувати нічим. */
async function ensureKey(): Promise<boolean> {
  if (!envSupportsCrypto()) {
    keyState = "unavailable";
    return false;
  }
  try {
    const key = await (await loadCrypto()).ensureKey();
    keyState = key ? "ready" : "unavailable";
    return key !== null;
  } catch (err) {
    keyState = "unavailable";
    logger.warn("[aiAtRest] crypto chunk failed", err);
    return false;
  }
}

// ── envelope ────────────────────────────────────────────────────────────────

/** `null` — це не конверт (відкритий легасі-текст). */
function parseEnvelope(raw: string): Envelope | null {
  if (!raw.startsWith('{"v":')) return null;
  try {
    const o = JSON.parse(raw) as Partial<Envelope>;
    if (
      typeof o.v === "number" &&
      typeof o.iv === "string" &&
      typeof o.ct === "string"
    ) {
      return o as Envelope;
    }
  } catch {
    /* не JSON: нехай піде як відкритий текст */
  }
  return null;
}

/** Шифрує відкритий текст у конверт; свіжий випадковий IV на кожен виклик. */
export async function sealAtRest(
  slot: string,
  plain: string,
): Promise<string | null> {
  if (keyState !== "ready" && !(await ensureKey())) return null;
  return (await loadCrypto()).seal(slot, plain);
}

async function openEnvelope(slot: string, env: Envelope): Promise<string> {
  if (keyState !== "ready" && !(await ensureKey())) {
    throw new Error("ключ недоступний");
  }
  return (await loadCrypto()).open(slot, env);
}

// ── слоти ───────────────────────────────────────────────────────────────────

interface Backend {
  read(): string | null;
  write(value: string): void;
  remove(): void;
}

const plainBackend = (key: string): Backend => ({
  read: () => safeReadStringLS(key),
  write: (v) => webKVStore.setString(key, v),
  remove: () => void safeRemoveLS(key),
});

const durableBackend = (key: string): Backend => ({
  read: () => safeReadStringLSDurable(key),
  write: (v) => void safeWriteStringLSDurable(key, v),
  remove: () => void safeRemoveLSDurable(key),
});

export interface AtRestSlot {
  /** Синхронне читання відкритого тексту; `null` — порожньо або нечитно. */
  read(): string | null;
  /**
   * Синхронно оновлює кеш, шифрує і пише асинхронно (останній виграє).
   * Проміс резолвиться, коли запис ліг у сховище або його перекрив новіший
   * запис чи стирання; ніколи не відхиляється.
   */
  write(plain: string): Promise<void>;
  /** `true`, поки якийсь запис цього слота ще не дійшов до сховища. */
  hasPendingWrite(): boolean;
  /** Синхронне стирання (приватність: purge не чекає на WebCrypto). */
  remove(): void;
  /** Підписка на зміну кешу ззовні (інша вкладка, перемикання розділу). */
  onExternalChange(fn: () => void): () => void;
  hydrate(): Promise<void>;
  /** Резолвиться, коли всі записи, що летять, завершились. */
  flush(): Promise<void>;
}

const slots: AtRestSlot[] = [];

function createSlot(name: string, backend: Backend): AtRestSlot {
  // `undefined` — кеш ще не знає значення.
  let plain: string | null | undefined;
  // Сире значення сховища, якому відповідає `plain`.
  let rawSeen: string | null | undefined;
  // Лічильник версій кешу: кожен запис, стирання і зміна епохи його бʼють.
  // Асинхронна робота (шифрування, розшифровка, міграція) фіксує `seq` і
  // епоху ДО першого await і застосовує результат, лише якщо обидва не
  // змінились: інакше старий результат перезаписав би новіший стан.
  let seq = 0;
  let epochSeen = getAtRestWipeEpoch();
  const inflight = new Set<Promise<void>>();
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const fn of Array.from(listeners)) {
      try {
        fn();
      } catch {
        /* підписник не ламає решту */
      }
    }
  };

  const stillCurrent = (mySeq: number, myEpoch: number) =>
    mySeq === seq && myEpoch === getAtRestWipeEpoch();

  /** Масове стирання сирих ключів поза слотом скидає кеш і запис, що летить. */
  const checkEpoch = () => {
    const e = getAtRestWipeEpoch();
    if (e === epochSeen) return;
    epochSeen = e;
    plain = undefined;
    rawSeen = undefined;
    seq += 1;
  };

  /** Шифрує й пише; відкритий текст лише якщо шифрування недоступне взагалі. */
  const persist = (text: string, mySeq: number): Promise<void> => {
    const myEpoch = getAtRestWipeEpoch();
    const p = sealAtRest(name, text)
      .then(async (env) => {
        // Поки активна SQLite-партиція тимчасово чужа, фізичний запис чекає.
        await atRestWritesReleased();
        if (!stillCurrent(mySeq, myEpoch)) return;
        const out = env ?? text;
        backend.write(out);
        rawSeen = out;
      })
      .catch((err: unknown) => {
        logger.warn(`[aiAtRest] write failed: ${name}`, err);
      })
      .finally(() => {
        inflight.delete(p);
      });
    inflight.add(p);
    return p;
  };

  /**
   * Розбирає сире значення в кеш. `false`, якщо результат застарів (поки
   * чекали, кеш змінив запис або стирання) і не застосований.
   */
  const absorb = async (raw: string | null): Promise<boolean> => {
    const mySeq = seq;
    const myEpoch = getAtRestWipeEpoch();
    if (raw === null) {
      plain = null;
      rawSeen = null;
      return true;
    }
    const env = parseEnvelope(raw);
    if (!env) {
      // Легасі відкритий текст: читаємо як є й перезаписуємо зашифрованим.
      plain = raw;
      rawSeen = raw;
      if (!(await ensureKey())) return true;
      // Запис, що встиг між цим і await-ом, новіший за легасі: не чіпаємо.
      if (!stillCurrent(mySeq, myEpoch) || backend.read() !== raw) return true;
      // Не чекаємо: persist може стояти на барʼєрі запису, а гідратацію
      // кличе саме перемикання партиції, яке барʼєр і тримає.
      void persist(raw, mySeq);
      return true;
    }
    let next: string | null;
    try {
      next = await openEnvelope(name, env);
    } catch (err) {
      logger.warn(`[aiAtRest] undecryptable, treated as empty: ${name}`, err);
      next = null;
    }
    if (!stillCurrent(mySeq, myEpoch)) return false;
    plain = next;
    rawSeen = raw;
    return true;
  };

  const slot: AtRestSlot = {
    read() {
      checkEpoch();
      if (inflight.size > 0 && plain !== undefined) return plain;
      const raw = backend.read();
      if (raw === null) {
        plain = null;
        rawSeen = null;
        return null;
      }
      if (plain !== undefined && raw === rawSeen) return plain;
      const env = parseEnvelope(raw);
      if (!env) {
        // Легасі відкритий текст (або режим без шифрування).
        plain = raw;
        rawSeen = raw;
        if (keyState === "ready") void persist(raw, seq);
        return raw;
      }
      // Конверт, якого кеш не бачив (інша вкладка / розділ): розшифруємо
      // асинхронно, а зараз віддаємо попереднє значення, а не «порожньо»,
      // щоб споживач не затер історію порожнім записом.
      void absorb(raw).then((applied) => {
        if (applied) emit();
      });
      return plain ?? null;
    },
    write(text) {
      checkEpoch();
      plain = text;
      seq += 1;
      if (keyState === "unavailable" || !envSupportsCrypto()) {
        // Синхронний відкритий запис: нема чим шифрувати (див. шапку).
        backend.write(text);
        rawSeen = text;
        return Promise.resolve();
      }
      return persist(text, seq);
    },
    hasPendingWrite() {
      return inflight.size > 0;
    },
    remove() {
      seq += 1;
      plain = null;
      rawSeen = null;
      backend.remove();
    },
    onExternalChange(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    async hydrate() {
      // Епоху звіряємо ДО читання сховища: інакше перший `read()` після
      // гідратації скинув би щойно розшифрований кеш як «застарілий».
      checkEpoch();
      if (inflight.size > 0) return;
      const before = plain;
      const applied = await absorb(backend.read());
      if (applied && plain !== before) emit();
    },
    async flush() {
      while (inflight.size > 0) {
        await Promise.all(Array.from(inflight));
      }
    },
  };
  slots.push(slot);
  return slot;
}

/**
 * Усі слоти оголошено тут, а не в споживачах: чат підвантажується лениво, і
 * слот, якого `hydrateAtRest` не знає, лишився б негідратованим (шифртекст
 * читався б як «порожньо»).
 */
export const chatSessionsSlot = createSlot(
  "hub_chat_sessions_v1",
  plainBackend("hub_chat_sessions_v1"),
);
export const chatSessionsMirrorSlot = createSlot(
  "hub_chat_sessions_mirror_v1",
  durableBackend("hub_chat_sessions_mirror_v1"),
);
export const chatLegacyHistorySlot = createSlot(
  "hub_chat_history",
  plainBackend("hub_chat_history"),
);
export const memoryBankSlot = createSlot(
  "hub_user_profile_v1",
  durableBackend("hub_user_profile_v1"),
);

/**
 * Гідратує кеші всіх слотів зі сховища (розшифровка + міграція відкритого
 * легасі). Ніколи не кидає. Кличеться на буті і після перемикання розділу.
 */
export async function hydrateAtRest(): Promise<void> {
  await ensureKey();
  await Promise.all(
    slots.map((s) =>
      s.hydrate().catch((err: unknown) => {
        logger.warn("[aiAtRest] hydrate failed", err);
      }),
    ),
  );
}

/** Чекає, доки всі слоти допишуть те, що летить. Ніколи не кидає. */
export async function flushAtRest(): Promise<void> {
  await Promise.all(slots.map((s) => s.flush()));
}

/** Лише для тестів: скидає ключ і стан, щоб підняти «свіжий профіль». */
export async function __resetAtRestKeyForTests(): Promise<void> {
  keyState = "idle";
  (await import("./aiAtRestCrypto")).resetKey();
}
