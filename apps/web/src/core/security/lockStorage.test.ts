import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";

import { clearPinHash, hasPinSet, savePinHash, verifyPin } from "./lockStorage";

const originalIndexedDB = (globalThis as { indexedDB?: unknown }).indexedDB;

function installFakeIDB(): IDBFactory {
  const factory = new IDBFactory();
  (globalThis as { indexedDB?: IDBFactory }).indexedDB = factory;
  return factory;
}

function uninstallIDB() {
  (globalThis as { indexedDB?: unknown }).indexedDB = originalIndexedDB;
}

describe("lockStorage", () => {
  beforeEach(() => {
    installFakeIDB();
  });

  afterEach(async () => {
    // Wipe the fake DB so each test starts clean.
    await clearPinHash().catch(() => {});
    uninstallIDB();
  });

  it("hasPinSet returns false when no PIN has been saved", async () => {
    expect(await hasPinSet()).toBe(false);
  });

  it("savePinHash + hasPinSet returns true", async () => {
    await savePinHash("1234");
    expect(await hasPinSet()).toBe(true);
  });

  it("verifyPin succeeds with the correct PIN", async () => {
    await savePinHash("9876");
    expect(await verifyPin("9876")).toBe(true);
  });

  it("verifyPin fails with a wrong PIN", async () => {
    await savePinHash("9876");
    expect(await verifyPin("0000")).toBe(false);
  });

  it("verifyPin returns false when no PIN is set", async () => {
    expect(await verifyPin("1234")).toBe(false);
  });

  it("clearPinHash removes the stored credential", async () => {
    await savePinHash("5555");
    await clearPinHash();
    expect(await hasPinSet()).toBe(false);
  });

  it("two saves with the same PIN still verify correctly (different salts)", async () => {
    await savePinHash("1234");
    // Overwrite — should still verify with the same PIN.
    await savePinHash("1234");
    expect(await verifyPin("1234")).toBe(true);
  });
});
