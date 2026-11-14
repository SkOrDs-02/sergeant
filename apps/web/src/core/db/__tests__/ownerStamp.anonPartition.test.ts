// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { kvStore } from "@sergeant/db-schema/sqlite";

import { __resetKvStoreBootForTests, bootstrapKvStore } from "../kvStoreBoot";
import {
  __resetSqliteDbForTests,
  getSqliteDb,
  switchSqliteUser,
  type SqliteDbHandle,
} from "../sqlite";
import {
  CHAT_OWNER_KEY,
  deviceOwnerIsUser,
  reconcileChatOwnerOnAuthChange,
} from "../../hub/hubChatSessions";
import { purgeAppOwnedLocalData } from "@shared/lib/storage/purgeLocalData";
import { teardownLocalStateAfterSessionLoss } from "../../auth/sessionLossTeardown";

/**
 * Штамп власника на холодному старті читається з `anon`-партиції: KV бутиться
 * на ній, бо сесія ще невідома. Перший штамп `userId` після входу теж падає
 * туди (партицію перемикає провайдер переносу пізніше). Тож вихід і втрата
 * сесії мусять лишати в `anon` штамп, що не вказує на користувача, інакше
 * наступний холодний старт вважає пристрій чужим залогіненим
 * (крок 0 спеки офлайн холодного старту).
 */
vi.mock("../dbOwnership.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../dbOwnership.js")>()),
  claimDbOwnership: () => Promise.resolve("follower"),
}));
vi.mock("../../app/swControl", () => ({
  swClearCaches: vi.fn(() => Promise.resolve()),
  swSetActiveUser: vi.fn(() => Promise.resolve()),
}));

vi.stubGlobal("crossOriginIsolated", true);

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

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
    await handle.drizzle
      .insert(kvStore)
      .values({ key, value, updatedAt: new Date(1_700_000_000_000) });
  }
  partitions.set(name, handle);
}

async function readStamp(name: string): Promise<string | undefined> {
  const rows = await partitions.get(name)!.drizzle.select().from(kvStore);
  return rows.find((row) => row.key === CHAT_OWNER_KEY)?.value;
}

/** Новий бут сторінки: памʼять модулів скинуто, KV стартує з `anon`. */
async function coldBoot(): Promise<void> {
  __resetKvStoreBootForTests();
  __resetSqliteDbForTests();
  activePartition = "anon";
  const result = await bootstrapKvStore({
    getDb: () => Promise.resolve(partitions.get(activePartition)!),
    broadcastChannel: null,
  });
  expect(result.loaded).toBe(true);
}

/** Вхід, як у застосунку: ефект AuthContext штампує, потім провайдер перемикає партицію. */
async function signInAs(userId: string): Promise<void> {
  reconcileChatOwnerOnAuthChange(userId);
  // Між штампом і перемиканням у застосунку йде перенос анонімних даних:
  // запис штампа встигає лягти в `anon`.
  await flush();
  activePartition = userId;
  await switchSqliteUser(userId);
}

beforeEach(() => {
  partitions.clear();
  localStorage.clear();
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

describe("штамп власника в anon-партиції", () => {
  beforeEach(async () => {
    await openPartition("anon");
    await openPartition("u1");
  });

  it("залогінений пристрій: холодний старт бачить власника", async () => {
    await coldBoot();
    await signInAs("u1");
    await flush();

    await coldBoot();
    expect(deviceOwnerIsUser()).toBe(true);
  });

  it("після виходу холодний старт не бачить власника", async () => {
    await coldBoot();
    await signInAs("u1");

    // Порядок `logout()`: штамп, мережевий sign-out (запис штампа встигає
    // лягти в партицію користувача), перемикання на `anon`, purge.
    reconcileChatOwnerOnAuthChange(null);
    await flush();
    activePartition = "anon";
    await switchSqliteUser(null);
    await purgeAppOwnedLocalData();
    await flush();

    await coldBoot();
    expect(await readStamp("anon")).not.toBe("u1");
    expect(deviceOwnerIsUser()).toBe(false);
  });

  it("після 401-teardown холодний старт не бачить власника", async () => {
    await coldBoot();
    await signInAs("u1");

    // Порядок ефекту reconcile на user → anon: штамп, teardown, reload.
    reconcileChatOwnerOnAuthChange(null);
    await teardownLocalStateAfterSessionLoss();
    await flush();

    await coldBoot();
    expect(await readStamp("anon")).not.toBe("u1");
    expect(deviceOwnerIsUser()).toBe(false);
  });
});

describe("копія штампа в KV від старого білда", () => {
  it("вхід прибирає її з anon-партиції, вихід не повертає власника", async () => {
    await openPartition("anon", { [CHAT_OWNER_KEY]: "u1" });
    await openPartition("u1", { [CHAT_OWNER_KEY]: "u1" });
    await coldBoot();
    expect(deviceOwnerIsUser()).toBe(false);

    await signInAs("u1");
    expect(await readStamp("anon")).toBeUndefined();

    reconcileChatOwnerOnAuthChange(null);
    await flush();
    activePartition = "anon";
    await switchSqliteUser(null);
    await purgeAppOwnedLocalData();
    await flush();

    await coldBoot();
    expect(deviceOwnerIsUser()).toBe(false);
  });
});
