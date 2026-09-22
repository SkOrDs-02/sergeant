/**
 * Last validated: 2026-09-22
 * Status: Active
 *
 * Хто з відкритих вкладок володіє локальною базою.
 *
 * OPFS-SAH-пул бере sync-access-handle на **весь каталог** `sergeant/sqlite`,
 * а не на окремий файл. Тому пул дістається рівно одній вкладці профілю, і
 * доти, доки це не було проговорено явно, решта вкладок мовчки з'їжджали по
 * драбині VFS у власний персистентний стор поруч із живою базою першої.
 * Саме так зникали дані: записи лишались у OPFS, а сусідня вкладка показувала
 * знімок зі старого сховища й приймала в нього нові.
 *
 * Правило тут одне, і воно замінює вгадування: **персистентний стор відкриває
 * лише лідер**. Лідерство — іменований лок `navigator.locks`, тобто примітив
 * браузера, а не власний семафор у localStorage (той переживає краш вкладки і
 * залипає назавжди).
 *
 * AI-DANGER: модуль навмисно НЕ імпортує `sqlite.ts`. Його читає `RootLayout`,
 * а `sqlite.ts` статично тягне `drizzle-orm` — один такий імпорт кладе весь
 * `drizzle-orm` на критичний шлях (root `AGENTS.md` § Performance budgets,
 * ратчет 2026-08-07). Зворотний звʼязок до бази йде через
 * {@link onYieldRequested}: писар реєструє тут закривач, читач про писаря не
 * знає.
 */
import { logger } from "@shared/lib";

/**
 * Стан вкладки щодо локальної бази.
 *
 * `unknown` — лідерства ще не питали; `leader` — база наша;
 * `follower` — базу тримає інша вкладка, персистентний стор тут заборонений.
 */
export type DbOwnership = "unknown" | "leader" | "follower";

/**
 * Один лок на ORIGIN, не на партицію користувача.
 *
 * Здається природним іменувати лок по `userKey`, але це було б хибно: пул
 * замикає каталог цілком, тож дві вкладки з різними акаунтами конфліктують
 * так само, як дві з однаковим.
 */
const LOCK_NAME = "sergeant-sqlite-db";
const CHANNEL_NAME = "sergeant-db-ownership";

type Msg = { type: "claim" } | { type: "released" };

let ownership: DbOwnership = "unknown";
let releaseLock: (() => void) | null = null;
let channel: BroadcastChannel | null = null;
let claimPromise: Promise<DbOwnership> | null = null;
let yieldHandler: (() => Promise<void>) | null = null;
const listeners = new Set<() => void>();

function setOwnership(next: DbOwnership): void {
  if (ownership === next) return;
  ownership = next;
  for (const fn of listeners) fn();
}

function hasLocks(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.locks?.request === "function"
  );
}

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  channel ??= new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

/**
 * Реєструє спосіб закрити базу, коли лідерство доводиться віддати.
 *
 * Викликає `sqlite.ts` — див. AI-DANGER у шапці модуля.
 */
export function onYieldRequested(handler: () => Promise<void>): void {
  yieldHandler = handler;
}

/** Поточний стан. Для `useSyncExternalStore`. */
export function readDbOwnership(): DbOwnership {
  return ownership;
}

/** Підписка на зміну стану. Для `useSyncExternalStore`. */
export function subscribeDbOwnership(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Спробувати стати лідером — НЕ чекаючи, поки звільниться лок.
 *
 * `ifAvailable` тут принципове: заблокуватись на буті означало б тримати
 * застосунок у завантаженні доти, доки людина не закриє іншу вкладку, навіть
 * не сказавши їй, чого він чекає.
 *
 * Браузер без `navigator.locks` вважається лідером: інакше застосунок там
 * перестав би відкривати базу взагалі — регресія замість ремонту.
 */
export function claimDbOwnership(): Promise<DbOwnership> {
  claimPromise ??= doClaim();
  return claimPromise;
}

async function doClaim(): Promise<DbOwnership> {
  if (!hasLocks()) {
    setOwnership("leader");
    return ownership;
  }
  installChannelListener();
  const granted = await new Promise<boolean>((settle) => {
    void navigator.locks
      .request(LOCK_NAME, { ifAvailable: true }, (lock) => {
        if (!lock) {
          settle(false);
          return;
        }
        settle(true);
        // Лок тримається, доки не розвʼязано цей проміс, тобто до
        // закриття вкладки або до явної поступки.
        return new Promise<void>((release) => {
          releaseLock = release;
        });
      })
      .catch((err: unknown) => {
        logger.warn("[db-ownership] lock request failed", err);
        settle(true);
      });
  });
  setOwnership(granted ? "leader" : "follower");
  if (granted) installReleaseOnUnload();
  return ownership;
}

function installChannelListener(): void {
  const ch = getChannel();
  if (!ch) return;
  ch.onmessage = (event: MessageEvent<Msg>) => {
    const msg = event.data;
    if (msg?.type === "claim" && ownership === "leader") {
      void yieldOwnership();
      return;
    }
    // Лідер пішов. Вкладка, що чекала, піднімає базу — але лише після
    // перезавантаження: половина застосунку вже тримає памʼятєву базу, і
    // підмінити її під ними на живу означало б показати два різні набори
    // даних на одному екрані.
    if (msg?.type === "released" && ownership === "follower") {
      window.location.reload();
    }
  };
}

/**
 * Повідомити сусідів, що база звільнилась.
 *
 * `pagehide` замість `beforeunload`: другий не спрацьовує на мобільних, коли
 * вкладку вивантажує сам рушій.
 */
function installReleaseOnUnload(): void {
  if (typeof window === "undefined") return;
  window.addEventListener(
    "pagehide",
    () => {
      getChannel()?.postMessage({ type: "released" } satisfies Msg);
    },
    { once: true },
  );
}

/** Закрити базу й віддати лок. Після цього вкладка — послідовник. */
async function yieldOwnership(): Promise<void> {
  try {
    await yieldHandler?.();
  } catch (err) {
    logger.warn("[db-ownership] closing db before yielding failed", err);
  }
  setOwnership("follower");
  releaseLock?.();
  releaseLock = null;
  getChannel()?.postMessage({ type: "released" } satisfies Msg);
}

/**
 * «Працювати тут»: забрати базу в тієї вкладки, що її тримає.
 *
 * Черга `navigator.locks` — FIFO, тож той, хто натиснув, стане в неї першим і
 * отримає лок, щойно лідер його відпустить. Перезавантаження робиться вже
 * після цього: воно і є переініціалізацією застосунку на живу базу.
 */
export async function takeOverDbOwnership(): Promise<void> {
  if (!hasLocks()) return;
  getChannel()?.postMessage({ type: "claim" } satisfies Msg);
  await navigator.locks.request(LOCK_NAME, () => {
    // Лок відпускається разом із поверненням із колбека — і одразу ж
    // перехоплюється наново вже на новому завантаженні сторінки.
    window.location.reload();
  });
}

/** Test-only. */
export function __resetDbOwnershipForTests(): void {
  ownership = "unknown";
  releaseLock = null;
  claimPromise = null;
  yieldHandler = null;
  channel?.close();
  channel = null;
  listeners.clear();
}
