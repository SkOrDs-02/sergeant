// @vitest-environment jsdom
/**
 * @status Active
 *
 * Стадія 3 перелиття (priv-17, рішення власника «a»): старе сховище
 * `kvvfs-local-*` стирається після підтвердженого перелиття і порожньої
 * черги, а `kv_store` зі знімка дістається лише першому акаунту.
 *
 * Тут справжній `kvvfsHandoff` і справжній `localStorage`; підмінено лише
 * воркер — його `all` відповідає на запити перепису і підчищання так, ніби
 * у файлі лежить знімок із заданими партиціями.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetSqliteDbForTests,
  getSqliteDb,
  switchSqliteUser,
} from "../sqlite";
import { __resetDbOwnershipForTests } from "../dbOwnership";
import { isHandoffDone, markHandoffDone } from "../kvvfsHandoff";

vi.mock("@sqlite.org/sqlite-wasm", () => import("./sqlite-wasm-fake"));
vi.mock("../../observability/sentry.js", () => ({
  addSentryBreadcrumb: vi.fn(),
  setSentryTag: vi.fn(),
}));
vi.mock("../sqliteWorkerClient.js", () => ({
  openSqliteInWorker: vi.fn(),
  openSqliteMemoryInWorker: vi.fn(),
}));

import { openSqliteInWorker } from "../sqliteWorkerClient.js";

/** Партиції знімка (`user_id` їхніх рядків) і вміст його спільних таблиць. */
interface SnapshotShape {
  readonly userIds: readonly string[];
  readonly outboxRows: number;
  readonly kvStoreRows?: number;
}

function snapshotConnection(shape: SnapshotShape, imported = true) {
  const run = vi.fn(async (_sql: string, _bind: readonly unknown[]) => {});
  const all = vi.fn(async (sql: string, bind: readonly unknown[] = []) => {
    if (sql.includes("sqlite_master")) {
      return ["routine_habits", "sync_op_outbox", "kv_store"].map((name) => ({
        name,
      }));
    }
    if (sql.includes("pragma_table_info")) {
      return bind[0] === "kv_store"
        ? [{ name: "key" }, { name: "value" }]
        : [{ name: "id" }, { name: "user_id" }];
    }
    if (sql.includes("DISTINCT user_id")) {
      return shape.userIds.map((user_id) => ({ user_id }));
    }
    if (sql.includes("COUNT(*)") && sql.includes("kv_store")) {
      return [{ n: shape.kvStoreRows ?? 0 }];
    }
    if (sql.includes("COUNT(*)")) return [{ n: shape.outboxRows }];
    return [];
  });
  return {
    dbName: "sergeant-anon.db",
    grewBy: 0,
    imported,
    exec: vi.fn(async () => {}),
    run,
    all,
    diagnostics: vi.fn(async () => ({ capacity: 24, fileCount: 2 })),
    close: vi.fn(async () => {}),
    wipe: vi.fn(async () => {}),
    prune: vi.fn(async () => ({ removed: [], kept: [] })),
  };
}

/** Старе сховище на дві сторінки, як його писав `JsStorageDb("local")`. */
function seedKvvfsStore(): void {
  localStorage.setItem("kvvfs-local-sz", "8192");
  localStorage.setItem("kvvfs-local-jrnl", "");
  localStorage.setItem("kvvfs-local-1", "page-1");
  localStorage.setItem("kvvfs-local-2", "page-2");
}

function kvvfsKeys(): string[] {
  return Object.keys(localStorage).filter((key) =>
    key.startsWith("kvvfs-local-"),
  );
}

function ranSql(conn: ReturnType<typeof snapshotConnection>): string[] {
  return conn.run.mock.calls.map(([sql]) => sql);
}

beforeEach(() => {
  localStorage.clear();
  __resetSqliteDbForTests();
  __resetDbOwnershipForTests();
  vi.mocked(openSqliteInWorker).mockReset();
  seedKvvfsStore();
  localStorage.setItem("unrelated", "keep-me");
});

afterEach(() => {
  __resetSqliteDbForTests();
});

describe("стадія 3: стирання старого сховища", () => {
  it("стирає kvvfs-local-* після перелиття, коли черга порожня", async () => {
    vi.mocked(openSqliteInWorker).mockResolvedValue(
      snapshotConnection({ userIds: ["local-anon"], outboxRows: 0 }),
    );

    await getSqliteDb();

    expect(isHandoffDone("anon")).toBe(true);
    expect(kvvfsKeys()).toEqual([]);
    // Стирається рівно старе сховище, а не все підряд.
    expect(localStorage.getItem("unrelated")).toBe("keep-me");
  });

  it("лишає сховище, коли в черзі знімка є недоставлене", async () => {
    vi.mocked(openSqliteInWorker).mockResolvedValue(
      snapshotConnection({ userIds: ["local-anon", "user42"], outboxRows: 1 }),
    );

    await getSqliteDb();

    // Перелиття відбулось, але знімок досі єдина копія операцій чужого
    // акаунта: стирати його не можна.
    expect(isHandoffDone("anon")).toBe(true);
    expect(kvvfsKeys()).toHaveLength(4);
  });

  it("лишає сховище, поки анонімні рядки не перелиті у свій файл", async () => {
    // Анонімні дані на сервер не їдуть, тож порожня черга про них нічого
    // не каже: стерти знімок до перелиття `anon` означало б їх втратити.
    vi.mocked(openSqliteInWorker).mockResolvedValue(
      snapshotConnection({ userIds: ["local-anon", "user42"], outboxRows: 0 }),
    );
    await switchSqliteUser("user42");

    await getSqliteDb();

    expect(isHandoffDone("user42")).toBe(true);
    expect(kvvfsKeys()).toHaveLength(4);
  });

  it("стирає, коли анонімна партиція вже перелита раніше", async () => {
    markHandoffDone("anon");
    vi.mocked(openSqliteInWorker).mockResolvedValue(
      snapshotConnection({ userIds: ["local-anon", "user42"], outboxRows: 0 }),
    );
    await switchSqliteUser("user42");

    await getSqliteDb();

    expect(kvvfsKeys()).toEqual([]);
  });

  it("не стирає, коли файл не зібрано зі знімка щойно", async () => {
    // Файл від попередньої спроби міг бути вже підчищений: перепис по ньому
    // не бачить чужих партицій, хоч у kvvfs вони є.
    vi.mocked(openSqliteInWorker).mockResolvedValue(
      snapshotConnection({ userIds: ["local-anon"], outboxRows: 0 }, false),
    );

    await getSqliteDb();

    expect(isHandoffDone("anon")).toBe(true);
    expect(kvvfsKeys()).toHaveLength(4);
  });
});

describe("стадія 3: kv_store лише першому акаунту", () => {
  it("перший акаунт зберігає kv_store зі знімка", async () => {
    markHandoffDone("anon");
    const conn = snapshotConnection({ userIds: ["user42"], outboxRows: 1 });
    vi.mocked(openSqliteInWorker).mockResolvedValue(conn);
    await switchSqliteUser("user42");

    await getSqliteDb();

    expect(ranSql(conn)).not.toContain("DELETE FROM kv_store");
  });

  it("наступний акаунт не успадковує чужий kv_store", async () => {
    markHandoffDone("user42");
    const conn = snapshotConnection({ userIds: ["user99"], outboxRows: 1 });
    vi.mocked(openSqliteInWorker).mockResolvedValue(conn);
    await switchSqliteUser("user99");

    await getSqliteDb();

    expect(ranSql(conn)).toContain("DELETE FROM kv_store");
  });

  it("анонімна партиція kv_store не отримує", async () => {
    const conn = snapshotConnection({ userIds: ["local-anon"], outboxRows: 1 });
    vi.mocked(openSqliteInWorker).mockResolvedValue(conn);

    await getSqliteDb();

    expect(ranSql(conn)).toContain("DELETE FROM kv_store");
  });
});

describe("стадія 3: холодний старт — спершу анонімна партиція, потім акаунт", () => {
  // Анонімна партиція переливається першою, ще до того, як `AuthContext`
  // назве акаунт. Акаунт зі знімка мусить отримати свій `kv_store`, а
  // сховище — лишитись до його перелиття.
  const shape = {
    userIds: ["local-anon", "user42"],
    outboxRows: 0,
    kvStoreRows: 3,
  };

  it("акаунт зберігає kv_store, а сховище стирається лише після нього", async () => {
    const anonConn = snapshotConnection(shape);
    const accountConn = snapshotConnection(shape);
    vi.mocked(openSqliteInWorker)
      .mockResolvedValueOnce(anonConn)
      .mockResolvedValueOnce(accountConn);

    await getSqliteDb();

    expect(isHandoffDone("anon")).toBe(true);
    expect(ranSql(anonConn)).toContain("DELETE FROM kv_store");
    // Акаунт ще не перелитий: знімок — єдине джерело його `kv_store`.
    expect(kvvfsKeys()).toHaveLength(4);

    await switchSqliteUser("user42");
    await getSqliteDb();

    expect(vi.mocked(openSqliteInWorker).mock.calls[1]?.[1]).toMatchObject({
      importKvvfs: { size: 8192, pages: ["page-1", "page-2"] },
    });
    expect(ranSql(accountConn)).not.toContain("DELETE FROM kv_store");
    expect(isHandoffDone("user42")).toBe(true);
    expect(kvvfsKeys()).toEqual([]);
    expect(localStorage.getItem("unrelated")).toBe("keep-me");
  });

  it("лишає сховище, поки чекає хоч один акаунт зі знімка", async () => {
    markHandoffDone("anon");
    vi.mocked(openSqliteInWorker).mockResolvedValue(
      snapshotConnection({
        userIds: ["local-anon", "user42", "user99"],
        outboxRows: 0,
      }),
    );
    await switchSqliteUser("user42");

    await getSqliteDb();

    expect(isHandoffDone("user42")).toBe(true);
    expect(kvvfsKeys()).toHaveLength(4);
  });

  it("лише анонімні рядки і непорожній kv_store: сховище чекає акаунта", async () => {
    // `kv_store` анонімній партиції не дістається, тож стерти знімок зараз
    // означало б загубити його назавжди. Отримає його перший акаунт.
    const anonConn = snapshotConnection({
      userIds: ["local-anon"],
      outboxRows: 0,
      kvStoreRows: 2,
    });
    const accountConn = snapshotConnection({
      userIds: ["local-anon"],
      outboxRows: 0,
      kvStoreRows: 2,
    });
    vi.mocked(openSqliteInWorker)
      .mockResolvedValueOnce(anonConn)
      .mockResolvedValueOnce(accountConn);

    await getSqliteDb();
    expect(kvvfsKeys()).toHaveLength(4);

    await switchSqliteUser("user42");
    await getSqliteDb();

    expect(ranSql(accountConn)).not.toContain("DELETE FROM kv_store");
    expect(kvvfsKeys()).toEqual([]);
  });
});
