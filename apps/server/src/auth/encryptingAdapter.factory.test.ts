import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { parseKeyRing } from "../lib/keyRing.js";
import { createEncryptingAdapter } from "./encryptingAdapter.js";
import { decryptString, encryptString, isEncrypted } from "./tokenCrypto.js";

// Exercise the real wrapper and crypto, isolating only the storage boundary.
// The companion integration suite verifies the same contract on Postgres.
const { storage } = vi.hoisted(() => ({
  storage: {
    id: "test-storage",
    create: vi.fn(),
    findOne: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("@better-auth/drizzle-adapter", () => ({
  drizzleAdapter: () => () => storage,
}));

const KEY = "e".repeat(64);
const RING = parseKeyRing({ legacyKey: KEY, envName: "TEST_ADAPTER_KEY" })!;
const TOKENS = {
  accessToken: "test-access",
  refreshToken: "test-refresh",
  idToken: "test-id",
};
const encryptedRow = () => ({
  id: "account-1",
  providerId: "google",
  accessToken: encryptString(TOKENS.accessToken, RING),
  refreshToken: encryptString(TOKENS.refreshToken, RING),
  idToken: encryptString(TOKENS.idToken, RING),
});

let adapter: DBAdapter;
beforeEach(() => {
  for (const method of Object.values(storage)) {
    if (typeof method === "function") method.mockReset();
  }
  adapter = createEncryptingAdapter(RING)({});
});

describe("encrypting adapter — storage boundary", () => {
  it("encrypts create input, preserves options and returns plaintext without mutating input", async () => {
    storage.create.mockImplementation(async ({ data }) => ({
      ...data,
      id: "account-1",
    }));
    const data = { ...TOKENS, providerId: "google", userId: "user-1" };
    const result = await adapter.create({
      model: "account",
      data,
      select: ["id", "accessToken"],
      forceAllowId: true,
    });
    const written = storage.create.mock.calls[0]![0];
    expect(written).toMatchObject({
      model: "account",
      select: ["id", "accessToken"],
      forceAllowId: true,
    });
    expect(written.data).not.toBe(data);
    for (const field of Object.keys(TOKENS) as Array<keyof typeof TOKENS>) {
      expect(isEncrypted(written.data[field])).toBe(true);
      expect(decryptString(written.data[field], RING)).toBe(TOKENS[field]);
    }
    expect(data).toEqual({ ...TOKENS, providerId: "google", userId: "user-1" });
    expect(result).toEqual({ ...data, id: "account-1" });
  });

  it("passes another model's create input and result through by reference", async () => {
    const data = { ...TOKENS, name: "test user" };
    const row = { id: "user-1", ...data };
    storage.create.mockResolvedValue(row);
    await expect(adapter.create({ model: "user", data })).resolves.toBe(row);
    expect(storage.create.mock.calls[0]![0].data).toBe(data);
  });

  it("decrypts findOne results without overwriting ciphertext held by storage", async () => {
    const row = encryptedRow();
    storage.findOne.mockResolvedValue(row);
    const args = {
      model: "account",
      where: [{ field: "id", value: "account-1" }],
    };
    await expect(adapter.findOne(args)).resolves.toEqual({
      id: "account-1",
      providerId: "google",
      ...TOKENS,
    });
    expect(storage.findOne).toHaveBeenCalledExactlyOnceWith(args);
    expect(isEncrypted(row.accessToken!)).toBe(true);
  });

  it("preserves a missing findOne result", async () => {
    storage.findOne.mockResolvedValue(null);
    await expect(
      adapter.findOne({ model: "account", where: [] }),
    ).resolves.toBeNull();
  });

  it("does not decrypt token-shaped fields from another model", async () => {
    const row = encryptedRow();
    storage.findOne.mockResolvedValue(row);
    await expect(
      adapter.findOne({ model: "session", where: [] }),
    ).resolves.toBe(row);
  });

  it("decrypts all findMany rows, including mixed legacy plaintext, without changing storage rows", async () => {
    const encrypted = encryptedRow();
    const legacy = { id: "legacy", accessToken: "legacy-plaintext" };
    const rows = [encrypted, legacy];
    storage.findMany.mockResolvedValue(rows);
    const args = { model: "account", where: [], limit: 2, offset: 1 };
    await expect(adapter.findMany(args)).resolves.toEqual([
      { id: "account-1", providerId: "google", ...TOKENS },
      legacy,
    ]);
    expect(storage.findMany).toHaveBeenCalledExactlyOnceWith(args);
    expect(isEncrypted(encrypted.accessToken!)).toBe(true);
  });

  it("passes another model's findMany array through by reference", async () => {
    const rows = [encryptedRow()];
    storage.findMany.mockResolvedValue(rows);
    await expect(adapter.findMany({ model: "user" })).resolves.toBe(rows);
  });

  it("encrypts account updates and decrypts the returned row, preserving where", async () => {
    storage.update.mockImplementation(async ({ update }) => ({
      id: "account-1",
      ...update,
    }));
    const update = { ...TOKENS, scope: "email" };
    const where = [{ field: "id", value: "account-1" }];
    await expect(
      adapter.update({ model: "account", where, update }),
    ).resolves.toEqual({ id: "account-1", ...update });
    const call = storage.update.mock.calls[0]![0];
    expect(call.where).toBe(where);
    expect(call.update.scope).toBe("email");
    expect(isEncrypted(call.update.refreshToken)).toBe(true);
    expect(update).toEqual({ ...TOKENS, scope: "email" });
  });

  it("preserves a missing update result", async () => {
    storage.update.mockResolvedValue(null);
    await expect(
      adapter.update({ model: "account", where: [], update: TOKENS }),
    ).resolves.toBeNull();
  });

  it("passes another model's update and result through by reference", async () => {
    const update = { ...TOKENS };
    const row = { id: "user-1", ...TOKENS };
    storage.update.mockResolvedValue(row);
    await expect(
      adapter.update({ model: "user", where: [], update }),
    ).resolves.toBe(row);
    expect(storage.update.mock.calls[0]![0].update).toBe(update);
  });

  it("encrypts bulk account updates and preserves affected-row counts", async () => {
    storage.updateMany.mockResolvedValue(3);
    const update = { refreshToken: TOKENS.refreshToken };
    const where = [{ field: "userId", value: "user-1" }];
    await expect(
      adapter.updateMany({ model: "account", where, update }),
    ).resolves.toBe(3);
    const call = storage.updateMany.mock.calls[0]![0];
    expect(call.where).toBe(where);
    expect(decryptString(call.update.refreshToken, RING)).toBe(
      TOKENS.refreshToken,
    );
    expect(call.update.refreshToken).not.toBe(TOKENS.refreshToken);
    expect(update.refreshToken).toBe(TOKENS.refreshToken);
  });

  it("passes another model's bulk update through unchanged", async () => {
    const update = { ...TOKENS };
    storage.updateMany.mockResolvedValue(0);
    await expect(
      adapter.updateMany({ model: "user", where: [], update }),
    ).resolves.toBe(0);
    expect(storage.updateMany.mock.calls[0]![0].update).toBe(update);
  });

  const failures: Array<{
    method: keyof Omit<typeof storage, "id">;
    run: (a: DBAdapter) => Promise<unknown>;
  }> = [
    {
      method: "create",
      run: (a) => a.create({ model: "account", data: TOKENS }),
    },
    {
      method: "findOne",
      run: (a) => a.findOne({ model: "account", where: [] }),
    },
    { method: "findMany", run: (a) => a.findMany({ model: "account" }) },
    {
      method: "update",
      run: (a) => a.update({ model: "account", where: [], update: TOKENS }),
    },
    {
      method: "updateMany",
      run: (a) => a.updateMany({ model: "account", where: [], update: TOKENS }),
    },
  ];
  it.each(failures)(
    "propagates $method storage errors without converting them into success",
    async ({ method, run }) => {
      const error = new Error("storage unavailable");
      storage[method].mockRejectedValue(error);
      await expect(run(adapter)).rejects.toBe(error);
      expect(storage[method]).toHaveBeenCalledTimes(1);
    },
  );
});
