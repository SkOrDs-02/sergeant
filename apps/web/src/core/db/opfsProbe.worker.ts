/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * Стадія 0 спеки [`sqlite-opfs-worker.md`](../../../../../docs/work/specs/sqlite-opfs-worker.md):
 * доказ, що OPFS-SAH пул піднімається на РЕАЛЬНОМУ пристрої користувача.
 *
 * AI-CONTEXT: `installOpfsSAHPoolVfs` вимагає `FileSystemSyncAccessHandle`,
 * якого на головному потоці немає — перевірено в справжньому Chromium:
 * звідти виклик кидає `Missing required OPFS APIs`, з воркера той самий
 * виклик проходить. Саме через це застосунок увесь час тихо працював на
 * localStorage-фолбеку зі стелею ~5 МБ, аж поки дані її не переросли.
 *
 * Це РОЗВІДКА, не робочий шлях: воркер нічого не читає й не пише в дані
 * користувача. Він ставить пул у власній теці з ємністю 1, повідомляє
 * результат і завершується. Ціна — один порожній службовий файл в OPFS.
 *
 * AI-DANGER: не перетворюй це на гейт. Доти, доки переїзд не зроблено,
 * негативна відповідь нічого не змінює в поведінці — вона лише має
 * потрапити в Sentry й на екран діагностики, щоб рішення про велику зміну
 * спиралось на факт із пристрою, а не на припущення про Safari.
 */

export type OpfsProbeResult =
  /** Пул піднявся — переїзд у воркер має сенс. */
  | { readonly kind: "ok" }
  /** Пул не піднявся; `reason` — текст винятку від бібліотеки. */
  | { readonly kind: "unavailable"; readonly reason: string };

/** Тека саме для розвідки — щоб не чіпати майбутню робочу теку бази. */
const PROBE_DIRECTORY = "/sergeant/opfs-probe";

self.onmessage = async () => {
  try {
    const mod = await import("@sqlite.org/sqlite-wasm");
    const sqlite3 = await mod.default();
    await sqlite3.installOpfsSAHPoolVfs({
      directory: PROBE_DIRECTORY,
      // Мінімум: розвідці потрібен сам факт установки, не місце під бази.
      initialCapacity: 1,
    });
    self.postMessage({ kind: "ok" } satisfies OpfsProbeResult);
  } catch (err) {
    self.postMessage({
      kind: "unavailable",
      reason: err instanceof Error ? err.message : String(err),
    } satisfies OpfsProbeResult);
  }
};
