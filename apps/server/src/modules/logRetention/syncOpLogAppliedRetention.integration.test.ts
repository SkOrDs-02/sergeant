/**
 * Integration: чистка `applied`-оп-ів журналу синку (ADR-0105 §2) на
 * справжньому Postgres — разом із межею `sync_op_log_floor` і тим, що pull
 * після чистки бачить прострочений курсор (`410 sync_cursor_expired`).
 *
 * Postgres: Testcontainers (`pgvector/pgvector:pg17`). Локально без Docker
 * можна дати вже змігровану ОДНОРАЗОВУ базу через `SYNC_IT_DATABASE_URL`, як
 * у `syncV2Snapshot.integration.test.ts`. Чистка глобальна, тож база має
 * бути одноразовою: тест видаляє старі `applied`-рядки всіх користувачів.
 *
 * Дані тесту тримають властивість проду: `id` і `server_ts` ростуть разом
 * (`server_ts` завжди ставить `now()` у момент запису). Тому кожен тест
 * пише оп-и від найстарішого до наймолодшого і прибирає своїх користувачів
 * після себе: молодий рядок попереднього тесту з меншим `id` зупинив би
 * скан чистки (`young` у SQL), чого в проді не буває.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import pg from "pg";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";

let selectPullPage: typeof import("../sync/syncV2Pull.js").selectPullPage;
let Poller: typeof import("./syncOpLogAppliedRetention.js").SyncOpLogAppliedRetentionPoller;

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
    ({ selectPullPage } = await import("../sync/syncV2Pull.js"));
    ({ SyncOpLogAppliedRetentionPoller: Poller } =
      await import("./syncOpLogAppliedRetention.js"));
    testPool = new pg.Pool({ connectionString: uri, max: 4 });
    if (!external) await runMigrations(testPool);
    ready = true;
  } catch (e) {
    if (process.env["CI"]) throw e;
    console.warn(
      `[syncOpLogAppliedRetention integration] Skipping: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}, TIMEOUT_MS);

afterAll(async () => {
  await testPool?.end().catch(() => {});
  await container?.stop().catch(() => {});
}, TIMEOUT_MS);

const createdUsers: string[] = [];

afterEach(async () => {
  if (!ready || createdUsers.length === 0) return;
  // Каскад прибирає і журнал, і межу.
  await testPool!.query(`DELETE FROM "user" WHERE id = ANY($1::text[])`, [
    createdUsers.splice(0),
  ]);
});

async function makeUser(): Promise<string> {
  const id = `ret-${randomUUID()}`;
  createdUsers.push(id);
  await testPool!.query(
    `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $1, $1 || '@example.test', false, now(), now())`,
    [id],
  );
  return id;
}

/** Оп у журналі віком `ageDays` днів; повертає його `id`. */
async function addOp(
  userId: string,
  ageDays: number,
  status: "applied" | "rejected" = "applied",
): Promise<number> {
  const res = await testPool!.query<{ id: string }>(
    `INSERT INTO sync_op_log
       (user_id, idempotency_key, table_name, op, row, client_ts, server_ts, status)
     VALUES ($1, $2, 'routine_habits', 'update', '{"id":"h"}',
             now() - ($3::int * INTERVAL '1 day'),
             now() - ($3::int * INTERVAL '1 day'), $4)
     RETURNING id`,
    [userId, randomUUID(), ageDays, status],
  );
  return Number(res.rows[0]!.id);
}

async function remainingIds(userId: string): Promise<number[]> {
  const res = await testPool!.query<{ id: string }>(
    `SELECT id FROM sync_op_log WHERE user_id = $1 ORDER BY id`,
    [userId],
  );
  return res.rows.map((r) => Number(r.id));
}

async function floorOf(userId: string): Promise<number | null> {
  const res = await testPool!.query<{ floor_id: string }>(
    `SELECT floor_id FROM sync_op_log_floor WHERE user_id = $1`,
    [userId],
  );
  return res.rows[0] ? Number(res.rows[0].floor_id) : null;
}

function poller(batchSize?: number, retentionDays = 90) {
  return new Poller({
    pool: testPool!,
    retentionDays,
    ...(batchSize ? { batchSize } : {}),
  });
}

describe("чистка applied-оп-ів sync_op_log (ADR-0105 §2)", () => {
  it(
    "видаляє лише applied старші за вікно, межа = макс. видалений id кожного користувача",
    async (ctx) => {
      if (!ready) return ctx.skip();
      const a = await makeUser();
      const b = await makeUser();
      await addOp(a, 120);
      const aOldRejected = await addOp(a, 120, "rejected");
      const bOld = await addOp(b, 100);
      const aOld2 = await addOp(a, 95);
      const bYoung = await addOp(b, 89);
      const aYoung = await addOp(a, 10);

      const result = await poller().runOnce();

      expect(result).toEqual({ deleted: 3, users: 2 });
      expect(await remainingIds(a)).toEqual([aOldRejected, aYoung]);
      expect(await remainingIds(b)).toEqual([bYoung]);
      expect(await floorOf(a)).toBe(aOld2);
      expect(await floorOf(b)).toBe(bOld);
    },
    TIMEOUT_MS,
  );

  it(
    "партія: найстаріші першими, межа росте від тіку до тіку",
    async (ctx) => {
      if (!ready) return ctx.skip();
      const u = await makeUser();
      const ids = [
        await addOp(u, 200),
        await addOp(u, 150),
        await addOp(u, 100),
      ];
      const keep = await addOp(u, 1);

      await poller(2).runOnce();
      expect(await remainingIds(u)).toEqual([ids[2], keep]);
      expect(await floorOf(u)).toBe(ids[1]);

      await poller(2).runOnce();
      expect(await remainingIds(u)).toEqual([keep]);
      expect(await floorOf(u)).toBe(ids[2]);
    },
    TIMEOUT_MS,
  );

  it(
    "межа, вища за все видалене, не опускається (GREATEST)",
    async (ctx) => {
      if (!ready) return ctx.skip();
      const v = await makeUser();
      const vOld = await addOp(v, 300);
      await testPool!.query(
        `INSERT INTO sync_op_log_floor (user_id, floor_id) VALUES ($1, $2)`,
        [v, vOld + 1000],
      );
      await poller().runOnce();
      expect(await remainingIds(v)).toEqual([]);
      expect(await floorOf(v)).toBe(vOld + 1000);
    },
    TIMEOUT_MS,
  );

  it(
    "старий за часом рядок за молодим за id чекає наступного тіку (лише пропуск, не зайве видалення)",
    async (ctx) => {
      if (!ready) return ctx.skip();
      const u = await makeUser();
      const old = await addOp(u, 200);
      const young = await addOp(u, 1);
      // Аномалія, якої прод не породжує: старий server_ts після молодого id.
      const lateOld = await addOp(u, 150);

      await poller().runOnce();

      expect(await remainingIds(u)).toEqual([young, lateOld]);
      expect(await floorOf(u)).toBe(old);
    },
    TIMEOUT_MS,
  );

  it(
    "pull після чистки: курсор нижче межі прострочений, від межі читається решта",
    async (ctx) => {
      if (!ready) return ctx.skip();
      const u = await makeUser();
      await addOp(u, 120);
      const lastOld = await addOp(u, 100);
      const young = await addOp(u, 5);

      await poller().runOnce();

      const fromZero = await selectPullPage(u, 0, "other-device", 500);
      expect(fromZero.floorId).toBe(lastOld);
      expect(fromZero.rows).toEqual([]);

      const fromFloor = await selectPullPage(u, lastOld, "other-device", 500);
      expect(fromFloor.rows.map((r) => Number(r.id))).toEqual([young]);
    },
    TIMEOUT_MS,
  );

  it(
    "вимкнена (0 днів) нічого не видаляє",
    async (ctx) => {
      if (!ready) return ctx.skip();
      const u = await makeUser();
      const old = await addOp(u, 400);

      expect(await poller(undefined, 0).runOnce()).toEqual({
        deleted: 0,
        users: 0,
      });
      expect(await remainingIds(u)).toEqual([old]);
      expect(await floorOf(u)).toBeNull();
    },
    TIMEOUT_MS,
  );
});
