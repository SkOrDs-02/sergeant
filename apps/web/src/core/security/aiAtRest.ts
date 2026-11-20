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
import {
  atRestWritesHeld,
  atRestWritesReleased,
  getAtRestWipeEpoch,
} from "./aiAtRestEpoch";
import type { Envelope } from "./aiAtRestCrypto";
import {
  safeReadStringLS,
  safeReadStringLSDurable,
  safeRemoveLS,
  safeRemoveLSDurable,
  safeWriteStringLSDurable,
  webKVStore,
} from "@shared/lib/storage/storage";
// `unavailable` — середовище без WebCrypto/IDB (постійно, пишемо відкритий
// текст); `failed` — ключ не завантажився зараз (тимчасово: шифртекст
// замикаємо, відкритого тексту не пишемо, наступний виклик пробує знову).
type KeyState = "idle" | "ready" | "unavailable" | "failed";
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
    keyState = key ? "ready" : "failed";
    return key !== null;
  } catch (err) {
    keyState = "failed";
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

/** Ключа немає ЗАРАЗ: шифртекст цілий, просто нічим відкрити. */
class KeyUnavailableError extends Error {}

async function openEnvelope(slot: string, env: Envelope): Promise<string> {
  if (keyState !== "ready" && !(await ensureKey())) {
    throw new KeyUnavailableError("ключ недоступний");
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
  /**
   * Синхронне читання відкритого тексту: запис, що летить, інакше останнє
   * розібране значення сховища; `null` — порожньо. Поки слот не готовий
   * ({@link isReady}), це може бути застаріле значення або `null`, і
   * читання-зміна-запис на ньому будувати не можна.
   */
  read(): string | null;
  /**
   * Приймає запис і шифрує його асинхронно (останній виграє). Проміс
   * резолвиться `true`, коли запис ліг у сховище або його перекрив новіший
   * запис чи стирання, і `false`, коли запис не ліг: слот не готовий
   * (шифртекст у сховищі ще не розібрано або ключа немає), шифрування чи
   * сховище відмовили. Після `false` читання знову показує сховище.
   * Ніколи не відхиляється.
   */
  write(plain: string): Promise<boolean>;
  /**
   * Готовність у поточній епосі: у сховищі порожньо, відкритий текст або
   * шифртекст, який цей слот уже розібрав. Лише на готовому слоті записи
   * доходять до сховища і читання відображає сховище.
   */
  isReady(): boolean;
  /**
   * Чекає готовності (розшифровує те, що в сховищі). `false` — слот
   * замкнений: шифртекст є, а ключа зараз немає.
   */
  whenReady(): Promise<boolean>;
  /** Шифртекст у сховищі, а ключа зараз немає (див. `whenReady`). */
  isLocked(): boolean;
  /** `true`, поки якийсь запис цього слота ще не дійшов до сховища. */
  hasPendingWrite(): boolean;
  /** Синхронне стирання (приватність: purge не чекає на WebCrypto). */
  remove(): void;
  /** Підписка на зміну значення ззовні (розшифровка, інша вкладка, розділ). */
  onExternalChange(fn: () => void): () => void;
  /** Розбирає сховище знову, навіть замкнене (повтор після збою ключа). */
  hydrate(): Promise<void>;
  /** Резолвиться, коли всі записи, що летять, завершились. */
  flush(): Promise<void>;
}

const slots: AtRestSlot[] = [];

// ІНВАРІАНТ (B24): жоден запис слота (шифрований чи відкритий фолбек) не
// замінює в сховищі шифртекст, який цей слот не розібрав у поточній епосі.
// Замінювати можна лише: порожнє сховище, відкритий (легасі) текст, власний
// записаний конверт, конверт, який слот розшифрував, і конверт, що не
// відкрився справним ключем (пошкоджений або під втраченим ключем: його вже
// ніщо не відкриє). Перевірка стоїть в ОДНІЙ точці — `commit()`, безпосередньо
// перед `backend.write`, без await між ними. Стирання (`remove`, purge,
// зміна власника) — свідоме знищення, а не заміна, і під правило не підпадає.

function createSlot(name: string, backend: Backend): AtRestSlot {
  // Що слот знає про сховище в поточній епосі: `rawSeen` — сирий рядок,
  // який він розібрав (null = порожньо), `stored` — його відкритий текст.
  // `undefined` — не знає.
  let rawSeen: string | null | undefined;
  let stored: string | null | undefined;
  // Прийнятий запис, що ще летить; читання показує його.
  let pending: string | undefined;
  // Шифртекст, який не відкрився через відсутній ключ.
  let lockedRaw: string | undefined;
  // Легасі відкритий текст, міграцію якого вже запущено.
  let migratingRaw: string | undefined;
  // Лічильник прийнятих записів і стирань: старий запис не перекриває новий.
  let seq = 0;
  let epochSeen = getAtRestWipeEpoch();
  let absorbing: { raw: string; p: Promise<boolean> } | null = null;
  const inflight = new Set<Promise<boolean>>();
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

  /** Масове стирання сирих ключів поза слотом: усе знане втрачає силу. */
  const checkEpoch = () => {
    const e = getAtRestWipeEpoch();
    if (e === epochSeen) return;
    epochSeen = e;
    rawSeen = undefined;
    stored = undefined;
    pending = undefined;
    lockedRaw = undefined;
    absorbing = null;
    seq += 1;
  };

  /** Чи можна замінити це сире значення сховища (інваріант). */
  const replaceable = (raw: string | null): boolean =>
    raw === null || raw === rawSeen || parseEnvelope(raw) === null;

  /** Сховище порожнє або тримає відкритий текст: розібрати синхронно. */
  const adoptPlain = (raw: string | null) => {
    rawSeen = raw;
    stored = raw;
    lockedRaw = undefined;
  };

  const track = (p: Promise<boolean>): Promise<boolean> => {
    const tracked = p.finally(() => {
      inflight.delete(tracked);
    });
    inflight.add(tracked);
    return tracked;
  };

  /**
   * Єдина точка фізичного запису. Чекає барʼєр (тимчасово чужа партиція),
   * далі БЕЗ await: перевіряє актуальність і інваріант, пише.
   */
  const commit = async (
    out: string,
    text: string,
    mySeq: number,
    myEpoch: number,
  ): Promise<boolean> => {
    while (atRestWritesHeld()) await atRestWritesReleased();
    if (myEpoch !== getAtRestWipeEpoch() || mySeq !== seq) return true;
    const cur = backend.read();
    if (!replaceable(cur)) {
      pending = undefined;
      logger.warn(
        `[aiAtRest] unread ciphertext in storage, edit discarded: ${name}`,
      );
      if (cur !== null && cur !== lockedRaw) void startAbsorb(cur);
      return false;
    }
    backend.write(out);
    rawSeen = out;
    stored = text;
    pending = undefined;
    lockedRaw = undefined;
    return true;
  };

  const fail = (mySeq: number): false => {
    if (mySeq === seq) pending = undefined;
    return false;
  };

  /** Шифрує й пише. Без ключа нічого не пише: відкритого тексту не буде. */
  const persist = (text: string, mySeq: number): Promise<boolean> => {
    const myEpoch = getAtRestWipeEpoch();
    return track(
      sealAtRest(name, text)
        .then((env) => {
          if (env === null) {
            logger.warn(`[aiAtRest] key unavailable, edit not stored: ${name}`);
            return fail(mySeq);
          }
          return commit(env, text, mySeq, myEpoch).then((ok) =>
            ok ? true : fail(mySeq),
          );
        })
        .catch((err: unknown) => {
          logger.warn(`[aiAtRest] write failed: ${name}`, err);
          return fail(mySeq);
        }),
    );
  };

  /**
   * Розбирає шифртекст `raw`. `true`, якщо результат застосовано; `false`,
   * якщо поки чекали, змінилась епоха чи сховище (тоді розбере наступний).
   */
  const absorb = async (raw: string): Promise<boolean> => {
    const myEpoch = getAtRestWipeEpoch();
    const env = parseEnvelope(raw);
    if (!env) {
      adoptPlain(raw);
      return true;
    }
    let next: string | null = null;
    let lock = false;
    try {
      next = await openEnvelope(name, env);
    } catch (err) {
      if (err instanceof KeyUnavailableError) {
        lock = true;
        logger.warn(`[aiAtRest] key unavailable, slot locked: ${name}`, err);
      } else {
        logger.warn(`[aiAtRest] undecryptable, treated as empty: ${name}`, err);
      }
    }
    if (myEpoch !== getAtRestWipeEpoch() || backend.read() !== raw) {
      return false;
    }
    if (lock) {
      lockedRaw = raw;
      return true;
    }
    rawSeen = raw;
    stored = next;
    lockedRaw = undefined;
    return true;
  };

  /** Один розбір на одне сире значення, скільки б разів його не просили. */
  const startAbsorb = (raw: string): Promise<boolean> => {
    if (absorbing && absorbing.raw === raw) return absorbing.p;
    const p: Promise<boolean> = absorb(raw)
      .then((applied) => {
        if (applied) emit();
        return applied;
      })
      .finally(() => {
        if (absorbing?.p === p) absorbing = null;
      });
    absorbing = { raw, p };
    return p;
  };

  const isReady = (): boolean => {
    checkEpoch();
    const raw = backend.read();
    return raw === null || parseEnvelope(raw) === null || raw === rawSeen;
  };

  const slot: AtRestSlot = {
    read() {
      checkEpoch();
      if (pending !== undefined) return pending;
      const raw = backend.read();
      if (raw === null || parseEnvelope(raw) === null) {
        if (raw !== rawSeen) adoptPlain(raw);
        // Легасі відкритий текст перезаписуємо конвертом, щойно є ключ.
        if (raw !== null && keyState === "ready" && raw !== migratingRaw) {
          migratingRaw = raw;
          void persist(raw, seq);
        }
        return raw;
      }
      if (raw === rawSeen && stored !== undefined) return stored;
      // Нерозібраний шифртекст (холодний бут, інша вкладка, інший розділ):
      // розбираємо у фоні. Слот не готовий, тож попереднє значення тут лише
      // для показу, а записи не дійдуть до сховища, доки розбір не завершиться.
      if (raw !== lockedRaw) void startAbsorb(raw);
      return stored ?? null;
    },
    write(text) {
      checkEpoch();
      if (!isReady()) {
        const raw = backend.read();
        logger.warn(`[aiAtRest] slot not ready, edit discarded: ${name}`);
        if (raw !== null && raw !== lockedRaw) void startAbsorb(raw);
        return Promise.resolve(false);
      }
      seq += 1;
      pending = text;
      if (!envSupportsCrypto()) {
        // Відкритий запис: середовище без WebCrypto/IDB (див. шапку).
        // Синхронно, якщо барʼєра немає; інакше через ту саму точку запису.
        const job = commit(text, text, seq, getAtRestWipeEpoch());
        return atRestWritesHeld() ? track(job) : job;
      }
      return persist(text, seq);
    },
    isReady,
    async whenReady() {
      // Замкнений слот пробуємо один раз знову: ключ міг уже завантажитись
      // (повтор «Спробуй ще раз» інакше чекав би перезавантаження).
      let retriedLocked = false;
      for (let i = 0; i < 5; i += 1) {
        if (isReady()) return true;
        const raw = backend.read();
        if (raw === null) continue;
        if (raw === lockedRaw) {
          if (retriedLocked) return false;
          retriedLocked = true;
          lockedRaw = undefined;
        }
        await startAbsorb(raw);
      }
      return isReady();
    },
    isLocked() {
      checkEpoch();
      const raw = backend.read();
      return raw !== null && raw === lockedRaw;
    },
    hasPendingWrite() {
      return inflight.size > 0;
    },
    remove() {
      checkEpoch();
      seq += 1;
      pending = undefined;
      adoptPlain(null);
      backend.remove();
    },
    onExternalChange(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    async hydrate() {
      // Епоху звіряємо ДО читання сховища: інакше наступний `read()` скинув
      // би щойно розібране як «застаріле».
      checkEpoch();
      const raw = backend.read();
      if (raw === null || parseEnvelope(raw) === null) {
        slot.read();
        return;
      }
      if (raw === rawSeen && stored !== undefined) return;
      if (raw === lockedRaw) lockedRaw = undefined; // повтор після збою ключа
      await startAbsorb(raw);
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
