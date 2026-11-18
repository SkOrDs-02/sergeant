// @vitest-environment jsdom
/**
 * @status Active
 *
 * Перелиття kvvfs → OPFS без sqlite-wasm на головному потоці (PR-T1,
 * рішення власника Б, 2026-11-18).
 *
 * Головний потік лише читає сирі рядки `kvvfs-local-*` (`readKvvfsSnapshot`),
 * а файл бази з них збирає воркер (`kvvfsSnapshotToBytes`). Тест ганяє обидві
 * половини на СПРАВЖНЬОМУ sqlite-wasm: стару базу пише справжній
 * `JsStorageDb("local")` у jsdom-`localStorage` — рівно той формат, який
 * лежить на пристроях людей, — і перевіряє, що байти на виході — та сама
 * база з тими самими рядками.
 */
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { kvvfsSnapshotToBytes } from "./kvvfsConvert";
import { readKvvfsSnapshot } from "./kvvfsHandoff";

type Sqlite3 = Awaited<ReturnType<typeof sqlite3InitModule>>;

let sqlite3: Sqlite3;

beforeAll(async () => {
  sqlite3 = await sqlite3InitModule();
});

beforeEach(() => {
  localStorage.clear();
});

/** Стара база так, як її писав головнопотоковий kvvfs до переїзду. */
function writeLegacyKvvfs(rows: number): void {
  const db = new sqlite3.oo1.JsStorageDb("local");
  try {
    db.exec(
      "CREATE TABLE sync_op_outbox (id TEXT PRIMARY KEY, user_id TEXT, payload TEXT)",
    );
    for (let i = 0; i < rows; i += 1) {
      db.exec({
        sql: "INSERT INTO sync_op_outbox VALUES (?, ?, ?)",
        bind: [`op-${i}`, i % 2 === 0 ? "user-a" : "user-b", "x".repeat(300)],
      });
    }
  } finally {
    db.close();
  }
}

/** Відкриває байти як окрему базу в памʼяті й рахує рядки. */
function countRows(bytes: Uint8Array): number {
  const db = new sqlite3.oo1.DB(":memory:");
  try {
    const pointer = sqlite3.wasm.allocFromTypedArray(bytes);
    const rc = sqlite3.capi.sqlite3_deserialize(
      db.pointer!,
      "main",
      pointer,
      bytes.byteLength,
      bytes.byteLength,
      sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE,
    );
    expect(rc).toBe(0);
    return Number(db.selectValue("SELECT count(*) FROM sync_op_outbox"));
  } finally {
    db.close();
  }
}

describe("readKvvfsSnapshot — головний потік, без SQLite", () => {
  it("нічого не читає на чистому пристрої", () => {
    expect(readKvvfsSnapshot()).toBeNull();
  });

  it("кидає на дірці в нумерації сторінок замість тихо зіпсованої копії", () => {
    writeLegacyKvvfs(5);
    localStorage.removeItem("kvvfs-local-2");
    expect(() => readKvvfsSnapshot()).toThrow(/page 2 is missing/);
  });
});

describe("kvvfsSnapshotToBytes — воркер збирає ту саму базу", () => {
  it("переносить усі рядки, разом із недоставленою чергою", () => {
    writeLegacyKvvfs(40);
    const snapshot = readKvvfsSnapshot();
    expect(snapshot).not.toBeNull();

    const bytes = kvvfsSnapshotToBytes(sqlite3, snapshot!);

    expect(bytes).not.toBeNull();
    expect(countRows(bytes!)).toBe(40);
  });

  // `kvvfs.export` бібліотеки сортує номери сторінок як рядки (1, 10, 2, …),
  // і база з понад девʼяти сторінок збиралась би переплутаною. Порядок
  // будує `readKvvfsSnapshot` — за числом.
  it("тримає порядок сторінок на базі з понад девʼяти сторінок", () => {
    writeLegacyKvvfs(400);
    const snapshot = readKvvfsSnapshot()!;
    expect(snapshot.pages.length).toBeGreaterThan(9);

    const bytes = kvvfsSnapshotToBytes(sqlite3, snapshot);

    expect(countRows(bytes!)).toBe(400);
  });

  it("зіпсований знімок кидає, а не перетворюється на порожню базу", () => {
    writeLegacyKvvfs(40);
    const snapshot = readKvvfsSnapshot()!;
    const broken = {
      ...snapshot,
      pages: snapshot.pages.map((page, index) =>
        index === 1 ? "z".repeat(page.length) : page,
      ),
    };

    expect(() => kvvfsSnapshotToBytes(sqlite3, broken)).toThrow();
  });

  it("старе сховище в localStorage лишається недоторканим", () => {
    writeLegacyKvvfs(10);
    const before = localStorage.getItem("kvvfs-local-1");

    kvvfsSnapshotToBytes(sqlite3, readKvvfsSnapshot()!);

    expect(localStorage.getItem("kvvfs-local-1")).toBe(before);
    expect(localStorage.getItem("kvvfs-local-sz")).not.toBeNull();
  });
});
