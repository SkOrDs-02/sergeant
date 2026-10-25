/**
 * Last validated: 2026-10-20
 * Status: Active
 *
 * priv-05 (залишок після #1335): вихід має стерти `sergeant-<id>.db`, але
 * стирання може не завершитись (вкладку закрили посеред виходу, воркер упав,
 * пул зайнятий іншою вкладкою), а на пристроях, де виходили до фіксу, такі
 * файли вже лежать. Файл з фінансами, звичками й їжею лишався читабельним для
 * DevTools і будь-якого скрипта origin, а ще займав слот SAH-пулу.
 *
 * Два механізми:
 *  1. МАРКЕР «стирання не завершилось»: `wipeSqliteDb()` пише імʼя файлу ДО
 *     стирання і знімає ПІСЛЯ успіху. Наступний старт доводить стирання
 *     безумовно (вихід уже спитав людину про недоставлене).
 *  2. ПІДМІТАННЯ осиротілих `sergeant-*.db`: файл не активної й не анонімної
 *     партиції видаляється, лише якщо його `sync_op_outbox` порожня
 *     (ні `pending`, ні `dead_letter`). Усе доставлене повертається з сервера
 *     при наступному вході; недоставлене не чіпаємо, бо після втрати сесії
 *     (priv-02) це єдина копія.
 *
 * AI-DANGER: маркер лежить під ключем БЕЗ префіксів allowlist-а
 * `purgeAppOwnedLocalData` (як `auth_pending_signout_v1`): purge іде вже після
 * його запису й стер би його разом з рештою. Не додавай префікс `sergeant.`.
 * Анонімну партицію (`sergeant-anon.db`) не видаляй ніколи: там можуть лежати
 * чернетки до міграції в акаунт.
 */
import { logger } from "@shared/lib";
import { resolveLsStore } from "@shared/lib/storage/storage";

import { addSentryBreadcrumb } from "../observability/sentry";
import type { SqliteWorkerConnection } from "./sqliteWorkerClient";

export const PENDING_SQLITE_WIPE_KEY = "sqlite_pending_wipe_v1";

const ANON_DB_NAME = "sergeant-anon.db";

export function readPendingSqliteWipes(): string[] {
  try {
    const raw = resolveLsStore()?.getString(PENDING_SQLITE_WIPE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((n): n is string => typeof n === "string")
      : [];
  } catch {
    return [];
  }
}

function writePending(names: readonly string[]): void {
  try {
    const store = resolveLsStore();
    if (!store) return;
    if (names.length === 0) store.remove(PENDING_SQLITE_WIPE_KEY);
    else store.setString(PENDING_SQLITE_WIPE_KEY, JSON.stringify(names));
  } catch (err) {
    logger.warn("[sqlite.orphan] pending-wipe marker write failed", err);
  }
}

/** Викликай ДО стирання файлу. */
export function markPendingSqliteWipe(dbName: string): void {
  const names = readPendingSqliteWipes();
  if (!names.includes(dbName)) writePending([...names, dbName]);
}

/** Викликай ПІСЛЯ успішного стирання. */
export function clearPendingSqliteWipe(dbName: string): void {
  const names = readPendingSqliteWipes();
  if (names.includes(dbName)) {
    writePending(names.filter((n) => n !== dbName));
  }
}

/**
 * Після відкриття воркерної бази: довести недостерте й прибрати осиротіле.
 * Ніколи не кидає і не блокує бут (виклик без `await` теж безпечний).
 */
export async function cleanupOrphanSqliteFiles(
  conn: Pick<SqliteWorkerConnection, "prune">,
  activeDbName: string,
): Promise<void> {
  const pending = readPendingSqliteWipes();
  const keep = [activeDbName, ANON_DB_NAME];
  const force = pending.filter((name) => !keep.includes(name));
  // AI-DANGER: підмітати можна лише з партиції акаунта. Бут завжди відкриває
  // спершу `sergeant-anon.db` (сесія ще невідома), і з keep = [anon] файл
  // залогіненої людини виглядав «осиротілим»: з порожньою чергою його
  // видаляли на КОЖНОМУ старті, і дані їхали з сервера заново (офлайн-старт
  // показував порожній застосунок). Це ховав гейт переносу, поки розвідка
  // анонімної партиції тривала секунди; preflight ux-01 зробив його миттєвим,
  // і модулі почали малювати порожню базу (відкат #1628). З анонімної
  // партиції лишається тільки доведення стирання з маркера.
  const sweep = activeDbName !== ANON_DB_NAME;
  if (!sweep && force.length === 0) {
    for (const name of pending) clearPendingSqliteWipe(name);
    return;
  }
  try {
    const { removed, kept } = await conn.prune(keep, force, sweep);
    // Імена в маркері знято: або видалені, або їх уже немає, або це активна
    // партиція (людина встигла увійти знову, файл знову законно потрібен).
    for (const name of pending) clearPendingSqliteWipe(name);
    if (removed.length > 0 || kept.length > 0) {
      addSentryBreadcrumb({
        category: "storage",
        level: kept.length > 0 ? "warning" : "info",
        message: "sqlite: orphan partition files pruned",
        data: { removed: removed.length, keptUndelivered: kept.length },
      });
    }
  } catch (err) {
    // Маркер лишається: повтор на наступному старті.
    logger.warn("[sqlite.orphan] prune failed", err);
  }
}
