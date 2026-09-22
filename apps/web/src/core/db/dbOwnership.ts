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

type Msg = { type: "claim" };

let ownership: DbOwnership = "unknown";
let releaseLock: (() => void) | null = null;
let channel: BroadcastChannel | null = null;
let claimPromise: Promise<DbOwnership> | null = null;
let waiting = false;
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
  if (!granted) waitForOwnership();
  return ownership;
}

/**
 * Стати в чергу за локом і НЕ виходити з неї.
 *
 * Це єдиний надійний сигнал «лідер пішов». Перша версія слухала власну
 * розсилку по `BroadcastChannel` з `pagehide` — і на живій перевірці 2026-09-22
 * повідомлення при закритті вкладки не долітало: лок звільнявся коректно
 * (`navigator.locks.query()` показував порожньо), а послідовник так і сидів на
 * екрані «відкрито в іншій вкладці». Черга локів переживає і закриття, і краш,
 * і падіння рушія — саме тому вона тут, а не подія вивантаження.
 *
 * Перезавантаження — і є переініціалізація: половина застосунку вже тримає
 * памʼятєву базу, і підмінити її під ними на живу означало б показати два
 * різні набори даних на одному екрані. Лок навмисно НЕ відпускається до
 * вивантаження сторінки, інакше його встигне перехопити сусід, і ця вкладка
 * перезавантажиться в той самий стан послідовника.
 */
function waitForOwnership(): void {
  if (waiting || !hasLocks()) return;
  waiting = true;
  void navigator.locks
    .request(LOCK_NAME, () => {
      window.location.reload();
      return new Promise<void>(() => {});
    })
    .catch((err: unknown) => {
      waiting = false;
      logger.warn("[db-ownership] waiting for the lock failed", err);
    });
}

function installChannelListener(): void {
  const ch = getChannel();
  if (!ch) return;
  ch.onmessage = (event: MessageEvent<Msg>) => {
    const msg = event.data;
    if (msg?.type === "claim" && ownership === "leader") void yieldOwnership();
  };
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
  // У чергу назад НЕ стаємо, і це навмисно. Людина щойно свідомо перенесла
  // роботу в іншу вкладку; забрати базу назад при першій нагоді означало б
  // скасувати її рішення. Технічно це ще й знімає зайве перезавантаження:
  // новий лідер відпускає лок на власному релоуді, і waiter тут спіймав би
  // саме цю мить (заміряно 2026-09-22 — вкладка, що віддала базу,
  // перезавантажувалась услід за тією, що її забрала). Повернутись можна
  // тією самою кнопкою.
}

/**
 * «Працювати тут»: попросити вкладку-лідера віддати базу.
 *
 * Тут лише прохання, і це навмисно. Послідовник стоїть у черзі за локом від
 * самого буту ({@link waitForOwnership}), тож усе інше — відпускання, чергу і
 * перезавантаження — робить той самий механізм, яким вкладка відновлюється
 * після звичайного закриття лідера. Двох різних шляхів до одного стану тут
 * не потрібно.
 */
export function takeOverDbOwnership(): void {
  getChannel()?.postMessage({ type: "claim" } satisfies Msg);
  // Стати в чергу тут, а не лише на буті: цю саму кнопку тисне й вкладка,
  // яка колись віддала базу сама і з черги вийшла. Без цього рядка для неї
  // кнопка була б декорацією.
  waitForOwnership();
}

/** Test-only. */
export function __resetDbOwnershipForTests(): void {
  ownership = "unknown";
  releaseLock = null;
  waiting = false;
  claimPromise = null;
  yieldHandler = null;
  channel?.close();
  channel = null;
  listeners.clear();
}
