/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * Стадія 0 спеки [`sqlite-opfs-worker.md`](../../../../../docs/work/specs/sqlite-opfs-worker.md):
 * доказ, що OPFS-SAH пул підніметься на РЕАЛЬНОМУ пристрої користувача.
 *
 * AI-CONTEXT: `installOpfsSAHPoolVfs` вимагає `FileSystemSyncAccessHandle`,
 * якого на головному потоці немає — перевірено в справжньому Chromium:
 * звідти виклик кидає `Missing required OPFS APIs`, з воркера той самий
 * виклик проходить. Саме через це застосунок увесь час тихо працював на
 * localStorage-фолбеку зі стелею ~5 МБ, аж поки дані її не переросли.
 *
 * AI-DANGER: цей воркер НЕ імпортує `@sqlite.org/sqlite-wasm` — і не має.
 * Перша версія імпортувала, і `Bundle budgets` одразу почервонів: воркер
 * збирається окремим entry, тож Rollup не може ділити з ним чанки головного
 * графа й **дублює всю бібліотеку** в його бандл, а `size-limit` сумує ВСІ
 * емітовані чанки. Розвідці бібліотека не потрібна: нижче відтворено рівно
 * той `apiVersionCheck()`, яким сам пул вирішує, чи здатне середовище його
 * тримати (див. `node_modules/@sqlite.org/sqlite-wasm/dist/index.mjs`).
 *
 * Перевірка навмисно повторює всі ЧОТИРИ кроки оригіналу, включно з
 * останнім і найменш очевидним: `close()` мусить бути СИНХРОННИМ. Ранні
 * версії Safari віддавали з нього проміс, і пул таке середовище відхиляє —
 * тобто «API є» ще не означає «пул стане».
 *
 * Це РОЗВІДКА, не робочий шлях: воркер нічого не читає й не пише в дані
 * користувача, а свій тимчасовий файл прибирає за собою.
 */

export type OpfsProbeResult =
  /** Середовище тримає SAH-пул. */
  | { readonly kind: "ok" }
  /** Не тримає; `reason` — конкретна причина, а не просто «ні». */
  | { readonly kind: "unavailable"; readonly reason: string };

/** Ім'я тимчасового файлу розвідки — власне, щоб ні з чим не зіткнутись. */
const PROBE_FILE = ".sergeant-opfs-probe";

/**
 * `createSyncAccessHandle` немає в типах DOM цієї версії TypeScript — воно
 * й не має там бути: саме його відсутність у середовищі ми й перевіряємо.
 * Звужуємо руками, замість того щоб тягнути типи бібліотеки, яку цей
 * воркер навмисно не імпортує.
 */
type SyncAccessCapableHandle = FileSystemFileHandle & {
  createSyncAccessHandle?: () => Promise<{ close: () => unknown }>;
};

async function checkSyncAccessHandle(): Promise<OpfsProbeResult> {
  const directory = navigator.storage?.getDirectory;
  if (typeof directory !== "function") {
    return { kind: "unavailable", reason: "no navigator.storage.getDirectory" };
  }
  if (typeof FileSystemFileHandle === "undefined") {
    return { kind: "unavailable", reason: "no FileSystemFileHandle" };
  }
  const prototype = FileSystemFileHandle.prototype as SyncAccessCapableHandle;
  if (typeof prototype.createSyncAccessHandle !== "function") {
    return { kind: "unavailable", reason: "no createSyncAccessHandle" };
  }

  const root = await navigator.storage.getDirectory();
  const handle = (await root.getFileHandle(PROBE_FILE, {
    create: true,
  })) as SyncAccessCapableHandle;
  try {
    const open = handle.createSyncAccessHandle;
    if (typeof open !== "function") {
      return { kind: "unavailable", reason: "no createSyncAccessHandle" };
    }
    const sah = await open.call(handle);
    const closed: unknown = sah.close();
    // Саме тут відсіюються старі Safari: у них `close()` асинхронний, і пул
    // таке середовище відхиляє — рівно цією ж перевіркою.
    if (
      typeof (closed as { then?: unknown } | undefined)?.then === "function"
    ) {
      await closed;
      return {
        kind: "unavailable",
        reason: "async close() — OPFS API too old",
      };
    }
    return { kind: "ok" };
  } finally {
    // Прибираємо за собою навіть після невдачі: розвідка не має лишати слідів.
    await root.removeEntry(PROBE_FILE).catch(() => undefined);
  }
}

self.onmessage = async () => {
  try {
    self.postMessage(await checkSyncAccessHandle());
  } catch (err) {
    self.postMessage({
      kind: "unavailable",
      reason: err instanceof Error ? err.message : String(err),
    } satisfies OpfsProbeResult);
  }
};
