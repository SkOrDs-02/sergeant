/**
 * Last validated: 2026-10-20
 * Status: Active
 *
 * priv-05: прибирання осиротілих файлів баз у SAH-пулі воркера. Винесено з
 * `sqliteWorker.ts`, щоб логіку можна було перевірити без sqlite-wasm: пул і
 * база описані структурно, воркер передає справжні.
 */
import type { SqliteWorkerPruneResult } from "./sqliteProtocol";

interface PruneProbe {
  exec(options: { sql: string; returnValue: "resultRows" }): unknown;
  close(): void;
}

/** Мінімум від `installOpfsSAHPoolVfs`, потрібний для прибирання. */
export interface PrunePool {
  getFileNames(): string[];
  unlink(name: string): unknown;
  readonly OpfsSAHPoolDb: new (name: string) => PruneProbe;
}

/** Основний файл бази партиції; журнали (`-journal`, `-wal`) не збігаються. */
const PARTITION_FILE = /^\/sergeant-.+\.db$/;

/**
 * `true`, коли в чужому файлі є недоставлені записи або це не вдалося
 * з'ясувати. Лише `0` у `sync_op_outbox` дозволяє видалення без `force`:
 * усе доставлене повернеться з сервера при наступному вході.
 */
function hasUndeliveredRows(pool: PrunePool, file: string): boolean {
  let probe: PruneProbe | null = null;
  try {
    probe = new pool.OpfsSAHPoolDb(file);
    const rows = probe.exec({
      sql: "SELECT COUNT(*) FROM sync_op_outbox WHERE status IN ('pending','dead_letter')",
      returnValue: "resultRows",
    });
    const first: unknown = Array.isArray(rows) ? rows[0] : undefined;
    const n = Array.isArray(first) ? Number(first[0]) : Number.NaN;
    return n !== 0;
  } catch {
    // Немає таблиці, файл зіпсований, пул зайнятий: безпечний бік - лишити.
    return true;
  } finally {
    try {
      probe?.close();
    } catch {
      /* файл лишається */
    }
  }
}

/**
 * Прибирає файли баз, що пережили вихід (стирання впало або вийшли ще до
 * фіксу). `keep` не чіпаємо; `force` видаляємо безумовно (вихід уже спитав
 * людину про недоставлене); решту осиротілих - лише з порожньою чергою.
 */
export function pruneOrphanPartitions(
  pool: PrunePool,
  keep: readonly string[],
  force: readonly string[],
): SqliteWorkerPruneResult {
  const norm = (name: string) => (name.startsWith("/") ? name : `/${name}`);
  const keepSet = new Set(keep.map(norm));
  const forceSet = new Set(force.map(norm));
  const removed: string[] = [];
  const kept: string[] = [];
  const names = pool.getFileNames();
  for (const file of names) {
    if (!PARTITION_FILE.test(file) || keepSet.has(file)) continue;
    if (!forceSet.has(file) && hasUndeliveredRows(pool, file)) {
      kept.push(file);
      continue;
    }
    for (const sibling of [file, `${file}-journal`, `${file}-wal`]) {
      if (names.includes(sibling)) pool.unlink(sibling);
    }
    removed.push(file);
  }
  return { removed, kept };
}
