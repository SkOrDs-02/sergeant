/**
 * Integration: нижня межа журналу (410 `sync_cursor_expired`) і
 * `GET /api/v2/sync/snapshot` (ADR-0105 §3, міграція 166, аудит `rel-06`).
 *
 * Реальний Postgres: Testcontainers (`pgvector/pgvector:pg17`, як сусідній
 * `syncV2.integration.test.ts`). Локально без Docker можна дати вже
 * змігровану ОДНОРАЗОВУ базу через `SYNC_IT_DATABASE_URL` - тест не
 * труncate-ить таблиць, лише вставляє рядки під унікальними user id.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import pg from "pg";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";
import type { Request, Response } from "express";

let syncV2Pull: typeof import("./syncV2Pull.js").syncV2Pull;
let snapshotMod: typeof import("./syncV2Snapshot.js");
let emitServerSyncOps: typeof import("./serverOpLog.js").emitServerSyncOps;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..", "..", "migrations");
const TIMEOUT_MS = 240_000;

let container: StartedTestContainer | undefined;
let testPool: pg.Pool | undefined;
let ready = false;

async function runMigrations(p: pg.Pool): Promise<void> {
  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .sort();
  for (const file of files) {
    const sql = (
      await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8")
    ).trim();
    if (sql) await p.query(sql);
  }
}

beforeAll(async () => {
  try {
    let uri = process.env["SYNC_IT_DATABASE_URL"];
    const external = Boolean(uri);
    if (!uri) {
      container = await new GenericContainer("pgvector/pgvector:pg17")
        .withEnvironment({
          POSTGRES_USER: "hub",
          POSTGRES_PASSWORD: "hub",
          POSTGRES_DB: "hub_test",
        })
        .withExposedPorts(5432)
        .withWaitStrategy(
          Wait.forLogMessage(
            /database system is ready to accept connections/,
            2,
          ),
        )
        .start();
      uri = `postgresql://hub:hub@${container.getHost()}:${container.getMappedPort(5432)}/hub_test`;
    }
    // `db.js` будує пул з env при першому імпорті - тому динамічно.
    process.env["DATABASE_URL"] = uri;
    ({ syncV2Pull } = await import("./syncV2Pull.js"));
    snapshotMod = await import("./syncV2Snapshot.js");
    ({ emitServerSyncOps } = await import("./serverOpLog.js"));
    testPool = new pg.Pool({ connectionString: uri, max: 4 });
    if (!external) await runMigrations(testPool);
    ready = true;
  } catch (e) {
    if (process.env["CI"]) throw e;
    console.warn(
      `[syncV2Snapshot integration] Skipping: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}, TIMEOUT_MS);

afterAll(async () => {
  if (testPool) await testPool.end().catch(() => {});
  if (container) await container.stop().catch(() => {});
}, TIMEOUT_MS);

async function newUser(): Promise<string> {
  const id = `u-snap-${randomUUID()}`;
  await testPool!.query(
    `INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $1, false, NOW(), NOW())`,
    [id, `${id}@test.local`],
  );
  return id;
}

async function emitOp(userId: string, key: string): Promise<void> {
  const client = await testPool!.connect();
  try {
    await client.query("BEGIN");
    await emitServerSyncOps(client, userId, "routine_entries", [
      {
        idempotencyKey: key,
        op: "insert",
        row: { id: key, user_id: userId, name: key },
        clientTs: new Date(),
      },
    ]);
    await client.query("COMMIT");
  } finally {
    client.release();
  }
}

async function maxOpId(userId: string): Promise<number> {
  const { rows } = await testPool!.query<{ m: string | null }>(
    "SELECT MAX(id) AS m FROM sync_op_log WHERE user_id = $1",
    [userId],
  );
  return Number(rows[0]?.m ?? 0);
}

async function setFloor(userId: string, floorId: number): Promise<void> {
  await testPool!.query(
    `INSERT INTO sync_op_log_floor (user_id, floor_id) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET floor_id = EXCLUDED.floor_id`,
    [userId, floorId],
  );
}

interface TestRes {
  statusCode: number;
  body: unknown;
}

async function pull(
  userId: string,
  since: number,
): Promise<TestRes & { error?: unknown }> {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  const req = {
    query: { since: String(since) },
    // Без заголовка pull відсіює і серверні оп-и (`NULL IS DISTINCT FROM
    // NULL` = false); справжній клієнт його шле завжди.
    headers: { "x-origin-device-id": "device-it" },
    user: { id: userId },
  } as unknown as Request;
  try {
    await syncV2Pull(req, res as unknown as Response);
    return res;
  } catch (error) {
    return { ...res, error };
  }
}

type Page = Awaited<
  ReturnType<typeof import("./syncV2Snapshot.js").readSnapshotPage>
>;

async function snapshotPage(
  userId: string,
  opts: {
    cursor?: string | null;
    asOfOpId?: number;
    limit?: number;
    budget?: number;
    tables?: readonly string[];
  } = {},
): Promise<Page> {
  const tables = opts.tables ?? ["routine_entries", "finyk_budgets"];
  const client = await testPool!.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const page = await snapshotMod.readSnapshotPage(client, userId, {
      cursor: opts.cursor
        ? snapshotMod.decodeSnapshotCursor(opts.cursor, tables)
        : null,
      asOfOpId: opts.asOfOpId,
      limit: opts.limit ?? 500,
      budget: opts.budget ?? 2_097_152,
      tables,
    });
    await client.query("COMMIT");
    return page;
  } finally {
    client.release();
  }
}

async function walk(
  userId: string,
  opts: { limit?: number; budget?: number },
): Promise<Page[]> {
  const pages: Page[] = [];
  let page = await snapshotPage(userId, opts);
  pages.push(page);
  while (page.next_cursor) {
    page = await snapshotPage(userId, {
      ...opts,
      cursor: page.next_cursor,
      asOfOpId: pages[0]!.as_of_op_id,
    });
    pages.push(page);
    if (pages.length > 100) throw new Error("snapshot не сходиться");
  }
  return pages;
}

describe("pull · нижня межа журналу (ADR-0105 §3.2)", () => {
  it("межі немає -> 200, як раніше", async (ctx) => {
    if (!ready) return ctx.skip();
    const u = await newUser();
    await emitOp(u, "a1");
    const res = await pull(u, 0);
    expect(res.error).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect((res.body as { ops: unknown[] }).ops).toHaveLength(1);
  });

  it("межа 0 -> 200", async (ctx) => {
    if (!ready) return ctx.skip();
    const u = await newUser();
    await emitOp(u, "b1");
    await setFloor(u, 0);
    const res = await pull(u, 0);
    expect(res.error).toBeUndefined();
    expect((res.body as { ops: unknown[] }).ops).toHaveLength(1);
  });

  it("since < floor_id -> 410 sync_cursor_expired; since = floor_id -> 200", async (ctx) => {
    if (!ready) return ctx.skip();
    const u = await newUser();
    await emitOp(u, "c1");
    await emitOp(u, "c2");
    const floor = (await maxOpId(u)) - 1;
    await setFloor(u, floor);

    const expired = await pull(u, 0);
    expect(expired.error).toMatchObject({
      status: 410,
      code: "sync_cursor_expired",
      floorId: floor,
    });

    // Межа вище за всі оп-и (retention стер усе) - порожня сторінка теж 410.
    const empty = await newUser();
    await setFloor(empty, 42);
    expect((await pull(empty, 0)).error).toMatchObject({ status: 410 });

    const ok = await pull(u, floor);
    expect(ok.error).toBeUndefined();
    expect((ok.body as { ops: unknown[] }).ops).toHaveLength(1);
  });
});

describe("snapshot (ADR-0105 §3.3)", () => {
  it("лише рядки користувача, tombstone включно, у формі pull-опа", async (ctx) => {
    if (!ready) return ctx.skip();
    const u = await newUser();
    const other = await newUser();
    await testPool!.query(
      `INSERT INTO routine_entries (id, user_id, name, updated_at, deleted_at)
       VALUES ('e1', $1, 'live', '2026-10-01T10:00:00Z', NULL),
              ('e2', $1, 'gone', '2026-10-02T10:00:00Z', '2026-10-02T10:00:00Z'),
              ('e1', $2, 'чужий', NOW(), NULL)`,
      [u, other],
    );
    await testPool!.query(
      `INSERT INTO finyk_budgets (id, user_id, data_json) VALUES ('b1', $1, '{"limit": 100}')`,
      [u],
    );
    await emitOp(u, "s1");
    const asOf = await maxOpId(u);

    const page = await snapshotPage(u);
    expect(page.next_cursor).toBeNull();
    expect(page.as_of_op_id).toBe(asOf);
    expect(page.ops.map((o) => `${o.table}:${String(o.row["id"])}`)).toEqual([
      "routine_entries:e1",
      "routine_entries:e2",
      "finyk_budgets:b1",
    ]);
    for (const op of page.ops) {
      expect(op.row["user_id"]).toBe(u);
      expect(op.op).toBe("insert");
      expect(op.id).toBe(asOf);
      expect(op.origin_device_id).toBeNull();
    }
    const gone = page.ops.find((o) => o.row["id"] === "e2")!;
    expect(gone.row["deleted_at"]).not.toBeNull();
    // LWW-годинник рядка - його `updated_at`, не час запиту.
    expect(gone.client_ts).toBe("2026-10-02T10:00:00.000Z");
    const budget = page.ops.find((o) => o.table === "finyk_budgets")!;
    expect(budget.row["data_json"]).toEqual({ limit: 100 });
  });

  it("as_of_op_id не нижче за межу журналу (retention стер усі оп-и)", async (ctx) => {
    if (!ready) return ctx.skip();
    const u = await newUser();
    await setFloor(u, 777);
    expect((await snapshotPage(u)).as_of_op_id).toBe(777);
  });

  it("пагінація за бюджетом і limit: повно, без дублів, стабільно, as_of на всіх сторінках однаковий", async (ctx) => {
    if (!ready) return ctx.skip();
    const u = await newUser();
    await testPool!.query(
      `INSERT INTO routine_entries (id, user_id, name)
       SELECT 'r' || lpad(g::text, 3, '0'), $1, repeat('x', 200)
         FROM generate_series(1, 25) g`,
      [u],
    );
    await testPool!.query(
      `INSERT INTO finyk_budgets (id, user_id)
       SELECT 'b' || g, $1 FROM generate_series(1, 4) g`,
      [u],
    );
    await emitOp(u, "p1");

    for (const opts of [{ budget: 1_000 }, { limit: 7 }]) {
      const pages = await walk(u, opts);
      expect(pages.length).toBeGreaterThan(2);
      const asOf = new Set(pages.map((p) => p.as_of_op_id));
      expect(asOf).toEqual(new Set([pages[0]!.as_of_op_id]));
      const keys = pages.flatMap((p) =>
        p.ops.map((o) => `${o.table}:${String(o.row["id"])}`),
      );
      expect(keys).toHaveLength(29);
      expect(new Set(keys).size).toBe(29);
      if (opts.limit) {
        for (const p of pages) expect(p.ops.length).toBeLessThanOrEqual(7);
      }
      // Повторний прохід дає ті самі сторінки (стабільний порядок за PK).
      const again = await walk(u, opts);
      expect(again.map((p) => p.ops.map((o) => o.row["id"]))).toEqual(
        pages.map((p) => p.ops.map((o) => o.row["id"])),
      );
    }
  });

  it("обходить УСІ таблиці реєстру sync (PK з каталогу) без помилок", async (ctx) => {
    if (!ready) return ctx.skip();
    const { SYNC_V2_SUPPORTED_TABLES } = await import("./syncV2.js");
    const u = await newUser();
    await testPool!.query(
      `INSERT INTO fizruk_injuries (id, user_id, site, started_at, note)
       VALUES ('i1', $1, 'knee', NOW(), 'plain')`,
      [u],
    );
    const page = await snapshotPage(u, { tables: SYNC_V2_SUPPORTED_TABLES });
    expect(page.next_cursor).toBeNull();
    expect(page.ops.map((o) => o.table)).toEqual(["fizruk_injuries"]);
  });

  it("курсор: зіпсований або з неповним ключем -> ValidationError", async (ctx) => {
    if (!ready) return ctx.skip();
    const u = await newUser();
    expect(() =>
      snapshotMod.decodeSnapshotCursor("@@@", ["routine_entries"]),
    ).toThrow();
    const bad = snapshotMod.encodeSnapshotCursor({
      t: "routine_entries",
      k: { wrong: "x" },
    });
    await expect(
      snapshotPage(u, { cursor: bad, asOfOpId: 1 }),
    ).rejects.toMatchObject({ name: "ValidationError" });
  });
});
