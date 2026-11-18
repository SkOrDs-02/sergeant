/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Збирає файл бази зі знімка старого kvvfs-сховища — ВОРКЕРНА половина
 * перелиття (стадія 2 спеки
 * [`sqlite-opfs-worker.md`](../../../../../docs/work/specs/sqlite-opfs-worker.md)).
 *
 * AI-CONTEXT: до 2026-11-18 це робив головний потік власною копією
 * sqlite-wasm (`JsStorageDb("local")` + `sqlite3_js_db_export`). Рішення
 * власника Б по PR-T1 прибрало ту копію з бандла, тож головний потік лише
 * читає рядки `kvvfs-local-*` з `localStorage` (`kvvfsHandoff.ts`), а
 * відкриває їх уже SQLite воркера: знімок кладеться в ТРАНЗИТНЕ kvvfs-сховище
 * (kvvfs v2, у памʼяті воркера) і експортується тим самим
 * `sqlite3_js_db_export`. Тобто байти ті самі, що й раніше, і журнал відкату
 * обробляє сам SQLite, а не наш код.
 *
 * AI-DANGER: `sqlite3.kvvfs.import` КОВТАЄ помилки запису (порожній `catch`
 * у бібліотеці) і `kvvfs.export` сортує сторінки як рядки (1, 10, 2, …).
 * Тому порядок сторінок будує головний потік сам, а тут результат
 * перевіряється `PRAGMA quick_check`: зіпсований знімок має впасти голосно,
 * а не перелитись порожньою базою з позначкою «готово».
 *
 * Модуль імпортується ЛИШЕ воркером. На головний потік sqlite-wasm не
 * повертається — це стереже `__tests__/sqlite.mainThreadNoWasm.test.ts`.
 */
import type sqlite3InitModule from "@sqlite.org/sqlite-wasm";

import type { KvvfsSnapshot } from "./sqliteProtocol";

type Sqlite3Static = Awaited<ReturnType<typeof sqlite3InitModule>>;

/** Ім'я транзитного сховища. Не `local`/`session`: ті — справжній `localStorage`. */
const HANDOFF_STORAGE = "sergeant-handoff";

/**
 * Публічний API kvvfs v2. У типах пакета його немає (вони описують v1),
 * тож звужуємо рівно до того, що викликаємо.
 */
interface KvvfsV2 {
  import(
    exp: {
      name: string;
      timestamp: number;
      size: number;
      journal?: string;
      pages: string[];
    },
    overwrite?: boolean,
  ): unknown;
  unlink(name: string): void;
}

function isKvvfsV2(value: unknown): value is KvvfsV2 {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Record<keyof KvvfsV2, unknown>>;
  return (
    typeof candidate.import === "function" &&
    typeof candidate.unlink === "function"
  );
}

/**
 * Перетворює знімок на байти файлу бази, або `null`, якщо база порожня.
 * Кидає, якщо знімок зіпсований: рішення, що з цим робити, — у викликача.
 */
export function kvvfsSnapshotToBytes(
  sqlite3: Sqlite3Static,
  snapshot: KvvfsSnapshot,
): Uint8Array | null {
  if (snapshot.pages.length === 0) return null;
  const kvvfs: unknown = "kvvfs" in sqlite3 ? sqlite3.kvvfs : undefined;
  if (!isKvvfsV2(kvvfs)) {
    throw new Error("kvvfs-handoff: kvvfs v2 API is unavailable");
  }

  kvvfs.import(
    {
      name: HANDOFF_STORAGE,
      timestamp: Date.now(),
      size: snapshot.size,
      ...(snapshot.journal ? { journal: snapshot.journal } : {}),
      pages: [...snapshot.pages],
    },
    true,
  );
  try {
    const db = new sqlite3.oo1.DB(HANDOFF_STORAGE, "w", "kvvfs");
    try {
      const check = db.selectValue("PRAGMA quick_check");
      if (check !== "ok") {
        throw new Error(`kvvfs-handoff: quick_check failed: ${String(check)}`);
      }
      const pointer = db.pointer;
      if (pointer === undefined) return null;
      const bytes = sqlite3.capi.sqlite3_js_db_export(pointer);
      return bytes.byteLength > 0 ? bytes : null;
    } finally {
      db.close();
    }
  } finally {
    try {
      kvvfs.unlink(HANDOFF_STORAGE);
    } catch {
      // Транзитне сховище живе в памʼяті воркера й помре разом із ним.
    }
  }
}
