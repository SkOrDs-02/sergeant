import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import {
  startPgContainer,
  stopPgContainer,
  testQuery,
  truncateAll,
} from "../../test/pg-container.js";

// AI-NOTE: реальний Postgres (Testcontainers). Закриває data-33: закриті
// банки Monobank мають зникати з `mono_jar` після авторитетного client-info,
// а неавторитетні відповіді не мають стирати нічого.

let upsertJars: typeof import("./jars.js").upsertJars;

beforeAll(async () => {
  const pool = await startPgContainer();
  vi.doMock("../../db.js", () => ({
    query: (text: string, values?: unknown[]) => pool.query(text, values),
    pool,
    default: pool,
    ensureSchema: vi.fn().mockResolvedValue(undefined),
  }));
  ({ upsertJars } = await import("./jars.js"));
});

afterAll(async () => {
  await stopPgContainer();
});

const USER = "jars_user_1";
const OTHER = "jars_user_2";

async function seedUser(id: string): Promise<void> {
  await testQuery(
    `INSERT INTO "user" (id, name, email, "emailVerified")
     VALUES ($1, $2, $3, true) ON CONFLICT (id) DO NOTHING`,
    [id, id, `${id}@example.com`],
  );
}

async function jarIds(userId: string): Promise<string[]> {
  const r = await testQuery(
    `SELECT mono_jar_id FROM mono_jar WHERE user_id = $1 ORDER BY mono_jar_id`,
    [userId],
  );
  return r.rows.map((row) => String(row["mono_jar_id"]));
}

describe("upsertJars — реальний Postgres (data-33)", () => {
  beforeEach(async () => {
    await truncateAll();
    await seedUser(USER);
    await seedUser(OTHER);
    await upsertJars(USER, [
      { id: "jar_a", currencyCode: 980, balance: 500_000 },
      { id: "jar_b", currencyCode: 980, balance: 100_000 },
    ]);
    await upsertJars(OTHER, [{ id: "jar_x", currencyCode: 980, balance: 7 }]);
  });

  it("авторитетний список з однією банкою видаляє другу (закриту)", async () => {
    await upsertJars(USER, [{ id: "jar_a", currencyCode: 980, balance: 1 }], {
      authoritative: true,
    });
    expect(await jarIds(USER)).toEqual(["jar_a"]);
    // Чужий користувач не зачеплений.
    expect(await jarIds(OTHER)).toEqual(["jar_x"]);
  });

  it("авторитетний порожній список видаляє всі банки користувача", async () => {
    await upsertJars(USER, [], { authoritative: true });
    expect(await jarIds(USER)).toEqual([]);
    expect(await jarIds(OTHER)).toEqual(["jar_x"]);
  });

  it("неавторитетний (порожній чи ні) список нічого не видаляє", async () => {
    await upsertJars(USER, []);
    expect(await jarIds(USER)).toEqual(["jar_a", "jar_b"]);
    await upsertJars(USER, [{ id: "jar_a", currencyCode: 980 }]);
    expect(await jarIds(USER)).toEqual(["jar_a", "jar_b"]);
  });

  it("не чіпає mono_account (is_jar) і mono_transaction закритої банки", async () => {
    await testQuery(
      `INSERT INTO mono_account
         (user_id, mono_account_id, currency_code, balance, is_jar)
       VALUES ($1, 'jar_b', 980, 100000, TRUE)`,
      [USER],
    );
    await testQuery(
      `INSERT INTO mono_transaction
         (user_id, mono_account_id, mono_tx_id, time, amount, operation_amount,
          currency_code, raw, source)
       VALUES ($1, 'jar_b', 'tx_1', NOW(), -100, -100, 980, '{}'::jsonb,
               'webhook')`,
      [USER],
    );

    await upsertJars(USER, [{ id: "jar_a", currencyCode: 980 }], {
      authoritative: true,
    });

    expect(await jarIds(USER)).toEqual(["jar_a"]);
    const acc = await testQuery(
      `SELECT is_jar FROM mono_account WHERE user_id = $1 AND mono_account_id = 'jar_b'`,
      [USER],
    );
    expect(acc.rows[0]?.["is_jar"]).toBe(true);
    const tx = await testQuery(
      `SELECT 1 FROM mono_transaction WHERE user_id = $1 AND mono_account_id = 'jar_b'`,
      [USER],
    );
    expect(tx.rows).toHaveLength(1);
  });
});
