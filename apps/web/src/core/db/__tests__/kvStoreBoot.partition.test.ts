// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { kvStore } from "@sergeant/db-schema/sqlite";

import {
  __resetKvStoreBootForTests,
  bootstrapKvStore,
  getActiveSqliteKvStore,
  kvStoreBoot,
  resetKvStoreBoot,
} from "../kvStoreBoot";
import {
  __resetSqliteDbForTests,
  getSqliteDb,
  switchSqliteUser,
  type SqliteDbHandle,
} from "../sqlite";

/**
 * Живучість KV після входу (спека `docs/work/specs/kv-warm-cache-user-partition.md`).
 * Бут заповнює warm-cache з `anon`, тож після `switchSqliteUser(userId)` кеш
 * має перечитатись з розділу користувача.
 *
 * Кожен розділ тут окрема `:memory:`-база: вкладка-«послідовник» не відкриває
 * спільний kvvfs, у якому всі розділи тестового середовища злиплися б в один.
 */
vi.mock("../dbOwnership.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../dbOwnership.js")>()),
  claimDbOwnership: () => Promise.resolve("follower"),
}));

vi.stubGlobal("crossOriginIsolated", true);

const partitions = new Map<string, SqliteDbHandle>();
let activePartition = "anon";

async function openPartition(
  name: string,
  rows: Record<string, string> = {},
): Promise<void> {
  __resetSqliteDbForTests();
  const handle = await getSqliteDb();
  await handle.drizzle.run(
    sql`CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (CAST((unixepoch() * 1000) AS INTEGER))
    )`,
  );
  for (const [key, value] of Object.entries(rows)) {
    await handle.drizzle.insert(kvStore).values({
      key,
      value,
      updatedAt: new Date(1_700_000_000_000),
    });
  }
  partitions.set(name, handle);
}

async function readPartition(name: string): Promise<Record<string, string>> {
  const rows = await partitions.get(name)!.drizzle.select().from(kvStore);
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

async function bootAsAnon(): Promise<void> {
  activePartition = "anon";
  __resetSqliteDbForTests();
  const result = await bootstrapKvStore({
    getDb: () => Promise.resolve(partitions.get(activePartition)!),
    broadcastChannel: null,
    localStorage: null,
  });
  expect(result.loaded).toBe(true);
}

async function signIn(userId: string): Promise<void> {
  activePartition = userId;
  await switchSqliteUser(userId);
}

beforeEach(() => {
  partitions.clear();
  __resetSqliteDbForTests();
  __resetKvStoreBootForTests();
  Object.defineProperty(globalThis.navigator, "storage", {
    value: undefined,
    configurable: true,
  });
  Object.defineProperty(globalThis, "FileSystemFileHandle", {
    value: undefined,
    configurable: true,
  });
});

afterEach(() => {
  __resetSqliteDbForTests();
  __resetKvStoreBootForTests();
});

describe("KV warm-cache після перемикання на розділ користувача", () => {
  it("віддає значення розділу користувача і сповіщає лише про змінені ключі", async () => {
    await openPartition("anon", { same: "x", changed: "anon", gone: "1" });
    await openPartition("u1", { same: "x", changed: "u1", fresh: "2" });
    await bootAsAnon();
    const store = getActiveSqliteKvStore()!;
    expect(store.getString("changed")).toBe("anon");

    const seen: [string, string | null][] = [];
    for (const key of ["same", "changed", "gone", "fresh"]) {
      store.onChange(key, (next) => seen.push([key, next]));
    }
    await signIn("u1");

    expect(store.getString("changed")).toBe("u1");
    expect(store.getString("fresh")).toBe("2");
    expect(store.getString("gone")).toBeNull();
    expect(seen.sort()).toEqual([
      ["changed", "u1"],
      ["fresh", "2"],
      ["gone", null],
    ]);
  });

  it("переносить запис, зроблений до перемикання, у розділ користувача поверх старшого", async () => {
    await openPartition("anon");
    await openPartition("u1", { early: "old", kept: "k" });
    await bootAsAnon();
    const store = getActiveSqliteKvStore()!;
    store.setString("early", "new");

    await signIn("u1");

    expect(store.getString("early")).toBe("new");
    expect(store.getString("kept")).toBe("k");
    await vi.waitFor(async () => {
      expect(await readPartition("u1")).toEqual({ early: "new", kept: "k" });
    });
  });

  it("A → вихід → B: B не бачить KV-значень A", async () => {
    await openPartition("anon");
    await openPartition("a", { theme: "dark-a" });
    await openPartition("b", { lang: "b-only" });
    await bootAsAnon();
    await signIn("a");
    const storeA = getActiveSqliteKvStore()!;
    expect(storeA.getString("theme")).toBe("dark-a");
    storeA.setString("secret", "from-a");
    await vi.waitFor(async () => {
      expect((await readPartition("a"))["secret"]).toBe("from-a");
    });

    // Вихід: те саме, що робить `purgeLocalData` + `AuthContext.logout`.
    resetKvStoreBoot();
    activePartition = "anon";
    await switchSqliteUser(null);
    // Новий бут сторінки для B: знову з `anon`, потім вхід.
    await bootAsAnon();
    await signIn("b");

    const storeB = getActiveSqliteKvStore()!;
    expect(storeB.getString("lang")).toBe("b-only");
    expect(storeB.getString("theme")).toBeNull();
    expect(storeB.getString("secret")).toBeNull();
    expect(Array.from(kvStoreBoot.warmCache.keys())).toEqual(["lang"]);
    expect(await readPartition("b")).toEqual({ lang: "b-only" });
  });
});
