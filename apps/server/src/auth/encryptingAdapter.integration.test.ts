import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import type { Pool } from "pg";
import {
  bootIntegrationHarness,
  shutdownIntegrationHarness,
  seedIntegrationUser,
  INTEGRATION_TIMEOUT_MS,
} from "../test/createIntegrationApp.js";
import { parseKeyRing } from "../lib/keyRing.js";
import {
  decryptString,
  encryptString,
  isEncrypted,
  readKeyVersion,
} from "./tokenCrypto.js";

const KEY1 = "a".repeat(64);
const KEY2 = "b".repeat(64);
const RING1 = parseKeyRing({
  keysCsv: `v1:${KEY1}`,
  currentVersion: "v1",
  envName: "TEST_OAUTH_KEY",
})!;
const RING2 = parseKeyRing({
  keysCsv: `v1:${KEY1},v2:${KEY2}`,
  currentVersion: "v2",
  envName: "TEST_OAUTH_KEY",
})!;
const USER = "oauth-adapter-integration-user";
const TOKENS = {
  accessToken: "test-access",
  refreshToken: "test-refresh",
  idToken: "test-id",
};

interface AccountRow {
  id: string;
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  scope: string | null;
}

let pool: Pool;
let primary: Pool | undefined;
let adapter1: DBAdapter;
let adapter2: DBAdapter;

beforeAll(async () => {
  const harness = await bootIntegrationHarness({ app: false });
  pool = harness.pool;
  await seedIntegrationUser(pool, USER);
  const { createEncryptingAdapter } = await import("./encryptingAdapter.js");
  primary = (await import("../db.js")).default;
  adapter1 = createEncryptingAdapter(RING1)({});
  adapter2 = createEncryptingAdapter(RING2)({});
}, INTEGRATION_TIMEOUT_MS);

beforeEach(async () => {
  await pool.query('DELETE FROM account WHERE "userId" = $1', [USER]);
});

afterAll(async () => {
  try {
    await primary?.end();
  } finally {
    await shutdownIntegrationHarness();
  }
}, INTEGRATION_TIMEOUT_MS);

const whereId = (id = "account-1") => [{ field: "id", value: id }];

async function createAccount(id = "account-1") {
  return adapter1.create<Record<string, unknown>, AccountRow>({
    model: "account",
    forceAllowId: true,
    data: {
      id,
      accountId: `provider-${id}`,
      providerId: "google",
      userId: USER,
      ...TOKENS,
      scope: "openid email",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

async function stored(id = "account-1"): Promise<AccountRow> {
  const result = await pool.query<AccountRow>(
    'SELECT id, "accessToken", "refreshToken", "idToken", scope FROM account WHERE id = $1',
    [id],
  );
  expect(result.rowCount).toBe(1);
  return result.rows[0]!;
}

describe("OAuth encryption adapter — real Drizzle / Postgres", () => {
  it("returns plaintext to Better Auth while storing all three tokens as ciphertext", async () => {
    const created = await createAccount();
    expect(created).toMatchObject({
      id: "account-1",
      ...TOKENS,
      scope: "openid email",
    });
    const row = await stored();
    for (const field of Object.keys(TOKENS) as Array<keyof typeof TOKENS>) {
      expect(isEncrypted(row[field]!)).toBe(true);
      expect(row[field]).not.toBe(TOKENS[field]);
      expect(readKeyVersion(row[field])).toBe(1);
      expect(decryptString(row[field]!, RING1)).toBe(TOKENS[field]);
    }
    expect(row.scope).toBe("openid email");
  });

  it("reads encrypted and legacy plaintext rows without rewriting either in storage", async () => {
    await createAccount();
    await createAccount("legacy");
    await pool.query(
      'UPDATE account SET "accessToken" = $1, "refreshToken" = NULL WHERE id = $2',
      ["legacy-access", "legacy"],
    );
    const before = await stored();
    await expect(
      adapter2.findOne({ model: "account", where: whereId() }),
    ).resolves.toMatchObject(TOKENS);
    const rows = await adapter2.findMany<AccountRow>({
      model: "account",
      where: [{ field: "userId", value: USER }],
    });
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === "legacy")).toMatchObject({
      accessToken: "legacy-access",
      refreshToken: null,
    });
    expect(await stored()).toEqual(before);
    expect((await stored("legacy")).accessToken).toBe("legacy-access");
  });

  it("writes a refreshed token with the current key while preserving untouched old-key fields", async () => {
    await createAccount();
    const updated = await adapter2.update<AccountRow>({
      model: "account",
      where: whereId(),
      update: { refreshToken: "refreshed-v2" },
    });
    expect(updated).toMatchObject({ ...TOKENS, refreshToken: "refreshed-v2" });
    const row = await stored();
    expect(readKeyVersion(row.refreshToken)).toBe(2);
    expect(readKeyVersion(row.accessToken)).toBe(1);
    expect(decryptString(row.refreshToken!, RING2)).toBe("refreshed-v2");
    expect(decryptString(row.accessToken!, RING2)).toBe(TOKENS.accessToken);
  });

  it("encrypts updateMany for every selected row and returns the affected-row count", async () => {
    await createAccount();
    await createAccount("account-2");
    const count = await adapter2.updateMany({
      model: "account",
      where: [{ field: "userId", value: USER }],
      update: { accessToken: "bulk-refreshed-v2" },
    });
    expect(count).toBe(2);
    for (const id of ["account-1", "account-2"]) {
      const row = await stored(id);
      expect(readKeyVersion(row.accessToken)).toBe(2);
      expect(decryptString(row.accessToken!, RING2)).toBe("bulk-refreshed-v2");
      expect(readKeyVersion(row.refreshToken)).toBe(1);
    }
  });

  it("rejects ciphertext from an unavailable key without silently returning or replacing it", async () => {
    await createAccount();
    const foreign = encryptString("foreign-key-token", "c".repeat(64));
    await pool.query('UPDATE account SET "accessToken" = $1 WHERE id = $2', [
      foreign,
      "account-1",
    ]);
    await expect(
      adapter2.findOne({ model: "account", where: whereId() }),
    ).rejects.toThrow();
    expect((await stored()).accessToken).toBe(foreign);
  });

  it("preserves null and empty results for missing accounts", async () => {
    await expect(
      adapter2.findOne({ model: "account", where: whereId("missing") }),
    ).resolves.toBeNull();
    await expect(
      adapter2.findMany({ model: "account", where: whereId("missing") }),
    ).resolves.toEqual([]);
    await expect(
      adapter2.update({
        model: "account",
        where: whereId("missing"),
        update: { accessToken: "unused" },
      }),
    ).resolves.toBeNull();
  });
});
