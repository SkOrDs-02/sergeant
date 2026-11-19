// @vitest-environment jsdom
/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Скидання id пристрою після виходу на СПРАВЖНІХ розділах KV
 * (`kvStoreBoot` + `switchSqliteUser` через in-process воркер).
 *
 * Регресія, знайдена 2026-11-19: id мінтиться в анонімному розділі (рушій
 * синку стартує до входу), а `webKVStore.remove(...)` на виході влучав лише в
 * розділ акаунта, тож наступний старт читав той самий id. Тепер чистка ставить
 * позначку, а старт перевипускає id (`originDeviceReset.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { kvStore } from "@sergeant/db-schema/sqlite";
import { STORAGE_KEYS } from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";

import {
  __resetKvStoreBootForTests,
  bootstrapKvStore,
  resetKvStoreBoot,
} from "../kvStoreBoot";
import {
  __resetSqliteDbForTests,
  getSqliteDb,
  switchSqliteUser,
  type SqliteDbHandle,
} from "../sqlite";
import {
  installInProcessSqliteWorker,
  uninstallInProcessSqliteWorker,
} from "./inProcessSqliteWorker";
import {
  requestOriginDeviceReset,
  resolveBootOriginDeviceId,
} from "../../syncEngine/originDeviceReset";

vi.mock("../dbOwnership.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../dbOwnership.js")>()),
  claimDbOwnership: () => Promise.resolve("follower"),
}));
vi.stubGlobal("crossOriginIsolated", true);

const KEY = STORAGE_KEYS.SYNC_ORIGIN_DEVICE_ID;
const partitions = new Map<string, SqliteDbHandle>();
let active = "anon";

async function openPartition(name: string): Promise<void> {
  __resetSqliteDbForTests();
  const handle = await getSqliteDb();
  await handle.drizzle.run(
    sql`CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT 0)`,
  );
  partitions.set(name, handle);
}

async function read(name: string): Promise<Record<string, string>> {
  const rows = await partitions.get(name)!.drizzle.select().from(kvStore);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Старт застосунку: завжди з анонімного розділу. */
async function boot(): Promise<void> {
  active = "anon";
  resetKvStoreBoot();
  __resetKvStoreBootForTests();
  __resetSqliteDbForTests();
  const result = await bootstrapKvStore({
    getDb: () => Promise.resolve(partitions.get(active)!),
    broadcastChannel: null,
    localStorage: null,
  });
  expect(result.loaded).toBe(true);
}

const flush = async () => {
  for (let i = 0; i < 20; i += 1) await new Promise((r) => setTimeout(r, 0));
};

beforeEach(installInProcessSqliteWorker);
afterEach(uninstallInProcessSqliteWorker);
beforeEach(() => {
  partitions.clear();
  localStorage.clear();
  __resetSqliteDbForTests();
  __resetKvStoreBootForTests();
  Object.defineProperty(globalThis.navigator, "storage", {
    value: undefined,
    configurable: true,
  });
});

describe("id пристрою після виходу", () => {
  it("наступний старт видає НОВИЙ id і тримає його далі", async () => {
    await openPartition("anon");
    await openPartition("u1");

    await boot();
    expect(
      resolveBootOriginDeviceId(webKVStore, { randomUUID: () => "dev-OLD" }),
    ).toBe("dev-OLD");
    await flush();
    active = "u1";
    await switchSqliteUser("u1");
    await flush();

    // Вихід: `remove` у розділі акаунта (AuthContext) + чистка ставить
    // позначку (purgeAppOwnedLocalData).
    webKVStore.remove(KEY);
    requestOriginDeviceReset();
    await flush();
    expect((await read("anon"))[KEY]).toBe("dev-OLD");

    await boot();
    expect(
      resolveBootOriginDeviceId(webKVStore, { randomUUID: () => "dev-NEW" }),
    ).toBe("dev-NEW");
    await flush();
    // Новий id ліг саме в анонімний розділ, звідки його читає кожен старт.
    expect((await read("anon"))[KEY]).toBe("dev-NEW");

    await boot();
    expect(
      resolveBootOriginDeviceId(webKVStore, { randomUUID: () => "dev-OTHER" }),
    ).toBe("dev-NEW");
  });
});
