/**
 * Інтеграційні тести батч-дедупу import-commit-у на реальному Postgres.
 *
 * 1. Еквівалентність: батч-матчер `findMonoMatchedRows` дає рівно той самий
 *    результат, що колишній per-row запит (`legacyFindMonoMatch` нижче,
 *    дослівна копія SQL до батчингу), на фікстурі з межами Kyiv-доби, DST,
 *    нічиями, tombstone-ами, чужим користувачем і дублями рядків.
 * 2. Кількість round-trip-ів commit-у стала: 1 рядок і 300 рядків дають
 *    однакове число запитів.
 * 3. Статуси рядків (created / mono_matched / duplicate / tombstoned) на
 *    реальній схемі.
 *
 * Без Docker локально тест пропускається; у CI падає.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import type { Request, Response } from "express";
import type pg from "pg";
import {
  bootIntegrationHarness,
  shutdownIntegrationHarness,
  seedIntegrationUser,
  truncateIntegrationTables,
  INTEGRATION_TIMEOUT_MS,
} from "../../../test/createIntegrationApp.js";
import type { DedupMonoInput } from "./dedupMono.js";

let testPool: pg.Pool;
let findMonoMatchedRows: typeof import("./dedupMono.js").findMonoMatchedRows;
let commitImportHandler: typeof import("./commit.js").default;
let dockerAvailable = false;

const USER_A = "finyk_import_int_a";
const USER_B = "finyk_import_int_b";

beforeAll(async () => {
  try {
    const harness = await bootIntegrationHarness({ app: false });
    testPool = harness.pool;
    vi.doMock("../../../db.js", () => ({
      query: (text: string, values?: unknown[]) => testPool.query(text, values),
      pool: testPool,
      default: testPool,
      ensureSchema: vi.fn().mockResolvedValue(undefined),
    }));
    findMonoMatchedRows = (await import("./dedupMono.js")).findMonoMatchedRows;
    commitImportHandler = (await import("./commit.js")).default;
    dockerAvailable = true;
  } catch (err) {
    if (process.env["CI"]) throw err;
    console.warn(
      `[finyk/import commit integration] Skipping: Docker unavailable - ${String(err)}`,
    );
  }
}, INTEGRATION_TIMEOUT_MS);

afterAll(async () => {
  await shutdownIntegrationHarness();
}, INTEGRATION_TIMEOUT_MS);

beforeEach(async () => {
  if (!dockerAvailable) return;
  await truncateIntegrationTables(testPool);
  await seedIntegrationUser(testPool, USER_A);
  await seedIntegrationUser(testPool, USER_B);
});

/** Дослівна копія per-row запиту `findMonoMatch` до батчингу (оракул). */
async function legacyFindMonoMatch(
  client: pg.PoolClient,
  userId: string,
  input: DedupMonoInput,
): Promise<string | null> {
  const { rows } = await client.query<{ mono_tx_id: string }>(
    `SELECT t.mono_tx_id
       FROM mono_transaction t
      WHERE t.user_id = $1
        AND t.deleted_at IS NULL
        AND ABS(t.amount) = $2::bigint
        AND (
          ($3::text = 'expense' AND t.amount < 0)
          OR ($3::text = 'income' AND t.amount > 0)
        )
        AND ABS(
          (timezone('Europe/Kyiv', t.time))::date - $4::date
        ) <= 1
      ORDER BY
        ABS((timezone('Europe/Kyiv', t.time))::date - $4::date) ASC,
        t.mono_tx_id ASC
      LIMIT 1`,
    [userId, input.amountKopiykas, input.direction, input.date],
  );
  return rows[0]?.mono_tx_id ?? null;
}

async function seedMono(
  userId: string,
  txs: Array<{ id: string; time: string; amount: number; deleted?: boolean }>,
) {
  await testPool.query(
    `INSERT INTO mono_account
       (user_id, mono_account_id, type, currency_code, balance, credit_limit)
     VALUES ($1, 'acct', 'black', 980, 0, 0)`,
    [userId],
  );
  for (const tx of txs) {
    await testPool.query(
      `INSERT INTO mono_transaction
         (user_id, mono_account_id, mono_tx_id, time, amount, operation_amount,
          currency_code, description, source, raw, deleted_at)
       VALUES ($1, 'acct', $2, $3, $4, $4, 980, 'tx', 'webhook', '{}', $5)`,
      [
        userId,
        tx.id,
        new Date(tx.time),
        tx.amount,
        tx.deleted ? new Date() : null,
      ],
    );
  }
}

/**
 * Фікстура з гострими кутами:
 * - межа Kyiv-доби (UTC+2 взимку): 22:30Z = наступна доба за Києвом,
 *   21:59Z = ще та сама;
 * - перехід на літній час 2026-03-29 (UTC+3);
 * - нічия: два однакові mono-tx однієї суми й дня;
 * - tombstone (deleted_at) не матчиться;
 * - протилежний знак не матчиться;
 * - mono-tx іншого користувача не матчиться.
 */
async function seedTrickyFixture() {
  await seedMono(USER_A, [
    { id: "a-kyiv-next-day", time: "2026-01-14T22:30:00Z", amount: -10000 },
    { id: "a-kyiv-same-day", time: "2026-01-12T21:59:59Z", amount: -10000 },
    { id: "a-income", time: "2026-01-12T10:00:00Z", amount: 5000 },
    {
      id: "a-deleted",
      time: "2026-01-17T10:00:00Z",
      amount: -5000,
      deleted: true,
    },
    { id: "a-tie-1", time: "2026-01-18T09:00:00Z", amount: -7777 },
    { id: "a-tie-2", time: "2026-01-18T11:00:00Z", amount: -7777 },
    { id: "a-dst", time: "2026-03-29T21:30:00Z", amount: -4200 },
    { id: "a-positive-4200", time: "2026-03-27T12:00:00Z", amount: 4200 },
  ]);
  await seedMono(USER_B, [
    { id: "b-other-user", time: "2026-01-11T10:00:00Z", amount: -7777 },
  ]);
}

function trickyRows(): DedupMonoInput[] {
  const days = [
    ...Array.from(
      { length: 12 },
      (_, i) => `2026-01-${String(9 + i).padStart(2, "0")}`,
    ),
    ...Array.from(
      { length: 6 },
      (_, i) => `2026-03-${String(26 + i).padStart(2, "0")}`,
    ),
  ];
  const rows: DedupMonoInput[] = [];
  for (const date of days) {
    for (const amountKopiykas of [10000, 5000, 7777, 4200]) {
      for (const direction of ["expense", "income"] as const) {
        rows.push({ date, amountKopiykas, direction });
      }
    }
  }
  // Дублі рядків: той самий рядок двічі матчиться незалежно (не consume).
  return [...rows, ...rows.slice(0, 40)];
}

function makeRes() {
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
  return res as typeof res & Response;
}

function commitReq(userId: string, rows: DedupMonoInput[]): Request {
  return {
    user: { id: userId },
    body: {
      source: "bank_statement",
      rows: rows.map((r, i) => ({
        ...r,
        description: `рядок ${i}`,
        category: "food",
      })),
    },
  } as unknown as Request;
}

/** Рахує запити commit-у: обгортка над `pool.connect`. */
function countCommitQueries(): { count: () => number; restore: () => void } {
  let n = 0;
  const original = testPool.connect.bind(
    testPool,
  ) as () => Promise<pg.PoolClient>;
  const spy = vi.spyOn(testPool, "connect").mockImplementation((async () => {
    const client = await original();
    return {
      query: (...args: Parameters<pg.PoolClient["query"]>) => {
        n++;
        return (client.query as (...a: unknown[]) => unknown)(...args);
      },
      release: () => client.release(),
    };
  }) as unknown as typeof testPool.connect);
  return { count: () => n, restore: () => spy.mockRestore() };
}

describe("finyk import commit - батч-дедуп на реальному Postgres", () => {
  it("батч-матчер еквівалентний колишньому per-row запиту на гострій фікстурі", async () => {
    if (!dockerAvailable) return;
    await seedTrickyFixture();
    const rows = trickyRows();

    const client = await testPool.connect();
    try {
      const legacy: boolean[] = [];
      for (const row of rows) {
        legacy.push((await legacyFindMonoMatch(client, USER_A, row)) !== null);
      }
      const batched = await findMonoMatchedRows(client, USER_A, rows);
      expect(batched).toEqual(legacy);
      // Фікстура справді містить і матчі, і не-матчі.
      expect(legacy.filter(Boolean).length).toBeGreaterThan(5);
      expect(legacy.filter((m) => !m).length).toBeGreaterThan(5);
    } finally {
      client.release();
    }
  });

  it("гострі кути фікстури: межі доби, DST, tombstone, знак, чужий користувач", async () => {
    if (!dockerAvailable) return;
    await seedTrickyFixture();
    const client = await testPool.connect();
    try {
      const check = (
        date: string,
        amountKopiykas: number,
        direction: "expense" | "income",
      ) =>
        findMonoMatchedRows(client, USER_A, [
          { date, amountKopiykas, direction },
        ]).then(([m]) => m);
      // 22:30Z 14-го = Kyiv 15-те: вікно 14..16.
      expect(await check("2026-01-16", 10000, "expense")).toBe(true);
      // 21:59:59Z 12-го = Kyiv 12-те (23:59:59): 14-те поза вікном 11..13 цього tx,
      // але 13-те в ньому.
      expect(await check("2026-01-13", 10000, "expense")).toBe(true);
      expect(await check("2026-01-17", 10000, "expense")).toBe(false);
      // Tombstone не матчиться.
      expect(await check("2026-01-17", 5000, "expense")).toBe(false);
      // Протилежний знак не матчиться.
      expect(await check("2026-01-12", 5000, "expense")).toBe(false);
      expect(await check("2026-01-12", 5000, "income")).toBe(true);
      // DST: 21:30Z 29-го березня = Kyiv 30-те (UTC+3).
      expect(await check("2026-03-31", 4200, "expense")).toBe(true);
      expect(await check("2026-03-28", 4200, "expense")).toBe(false);
      // Чужий користувач не матчиться.
      expect(await check("2026-01-11", 7777, "expense")).toBe(false);
    } finally {
      client.release();
    }
  });

  it("commit: статуси рядків збігаються з per-row оракулом; round-trip-ів стало", async () => {
    if (!dockerAvailable) return;
    await seedTrickyFixture();
    const rows = trickyRows();

    const oracleClient = await testPool.connect();
    const expected: string[] = [];
    try {
      for (const row of rows) {
        expected.push(
          (await legacyFindMonoMatch(oracleClient, USER_A, row))
            ? "mono_matched"
            : "created",
        );
      }
    } finally {
      oracleClient.release();
    }

    const counter = countCommitQueries();
    const res = makeRes();
    try {
      await commitImportHandler(commitReq(USER_A, rows), res);
    } finally {
      counter.restore();
    }
    const body = res.body as {
      created: number;
      skipped: { monoMatched: number; duplicate: number };
      rows: Array<{ status: string }>;
    };
    expect(res.statusCode).toBe(201);
    expect(body.rows.map((r) => r.status)).toEqual(expected);
    expect(body.created).toBe(expected.filter((s) => s === "created").length);
    expect(body.skipped.monoMatched).toBe(
      expected.filter((s) => s === "mono_matched").length,
    );
    // BEGIN, mono-матч, upsert, import_batches, sync_op_log, COMMIT.
    expect(counter.count()).toBe(6);

    const one = countCommitQueries();
    try {
      await commitImportHandler(
        commitReq(USER_A, [
          { date: "2025-06-01", amountKopiykas: 1, direction: "expense" },
        ]),
        makeRes(),
      );
    } finally {
      one.restore();
    }
    expect(one.count()).toBe(counter.count());
  });

  it("повторний commit: duplicate для живих, tombstoned для видалених, лічильники", async () => {
    if (!dockerAvailable) return;
    const rows: DedupMonoInput[] = [
      { date: "2026-02-01", amountKopiykas: 100, direction: "expense" },
      { date: "2026-02-01", amountKopiykas: 200, direction: "income" },
      { date: "2026-02-02", amountKopiykas: 300, direction: "expense" },
    ];
    const first = makeRes();
    await commitImportHandler(commitReq(USER_A, rows), first);
    const firstBody = first.body as {
      rows: Array<{ id: string; status: string }>;
    };
    expect(firstBody.rows.map((r) => r.status)).toEqual([
      "created",
      "created",
      "created",
    ]);

    await testPool.query(
      `UPDATE finyk_manual_expenses SET deleted_at = NOW() WHERE id = $1`,
      [firstBody.rows[1]!.id],
    );

    const second = makeRes();
    await commitImportHandler(
      commitReq(USER_A, [
        ...rows,
        { date: "2026-02-03", amountKopiykas: 400, direction: "expense" },
      ]),
      second,
    );
    const body = second.body as {
      created: number;
      skipped: { monoMatched: number; duplicate: number };
      rows: Array<{ id: string; status: string }>;
    };
    expect(body.rows.map((r) => r.status)).toEqual([
      "duplicate",
      "tombstoned",
      "duplicate",
      "created",
    ]);
    expect(body.rows.slice(0, 3).map((r) => r.id)).toEqual(
      firstBody.rows.map((r) => r.id),
    );
    expect(body.created).toBe(1);
    expect(body.skipped).toEqual({ monoMatched: 0, duplicate: 3 });

    // Живі рядки (3 duplicate-и мінус tombstone + 1 created) реплікуються.
    const { rows: ops } = await testPool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM sync_op_log WHERE user_id = $1`,
      [USER_A],
    );
    expect(Number(ops[0]!.n)).toBe(3 + 3);
  });
});
