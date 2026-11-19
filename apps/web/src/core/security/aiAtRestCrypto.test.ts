import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

import { ensureKey, resetKey } from "./aiAtRestCrypto";

function readStoredKey(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("sergeant_ai_at_rest", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("keys");
    req.onsuccess = () => {
      const db = req.result;
      const get = db.transaction("keys").objectStore("keys").get("v1");
      get.onsuccess = () => {
        db.close();
        resolve(get.result);
      };
      get.onerror = () => reject(get.error);
    };
    req.onerror = () => reject(req.error);
  });
}

describe("aiAtRestCrypto.ensureKey (#1)", () => {
  beforeEach(() => {
    (globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory();
    resetKey();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ключ, який повернуто, вже лежить в IndexedDB", async () => {
    const key = await ensureKey();
    expect(key).not.toBeNull();
    expect(await readStoredKey()).toBeDefined();
  });

  it("перервана транзакція: ключ не віддається (без ключа лише в памʼяті)", async () => {
    const proto = Object.getPrototypeOf(
      (
        await new Promise<IDBDatabase>((resolve) => {
          const req = indexedDB.open("probe", 1);
          req.onupgradeneeded = () => req.result.createObjectStore("s");
          req.onsuccess = () => resolve(req.result);
        })
      )
        .transaction("s", "readwrite")
        .objectStore("s"),
    ) as IDBObjectStore;
    vi.spyOn(proto, "put").mockImplementation(function (this: IDBObjectStore) {
      this.transaction.abort();
      return {} as IDBRequest<IDBValidKey>;
    });
    expect(await ensureKey()).toBeNull();
  });
});
