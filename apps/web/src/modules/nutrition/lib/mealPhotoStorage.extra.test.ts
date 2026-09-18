// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 * Extra branch-coverage tests for mealPhotoStorage.ts.
 * Targets db=null paths and the gcMealThumbnails transaction-failure branch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

import { __resetSergeantDbForTests } from "../../../shared/lib/idb/sergeantDb";
import {
  deleteMealThumbnail,
  gcMealThumbnails,
  getMealThumbnailBlob,
  saveMealThumbnail,
} from "./mealPhotoStorage";

const originalIndexedDB = (globalThis as { indexedDB?: unknown }).indexedDB;

function makeBlob(text = "thumb"): Blob {
  return new Blob([text], { type: "image/jpeg" });
}

beforeEach(() => {
  (globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory();
  __resetSergeantDbForTests();
});

afterEach(() => {
  if (originalIndexedDB === undefined) {
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
  } else {
    (globalThis as { indexedDB?: unknown }).indexedDB = originalIndexedDB;
  }
  __resetSergeantDbForTests();
  vi.restoreAllMocks();
});

function mockNullDb() {
  vi.spyOn(globalThis.indexedDB as IDBFactory, "open").mockImplementation(
    () => {
      const req = Object.create(IDBOpenDBRequest.prototype) as IDBOpenDBRequest;
      setTimeout(() => {
        Object.defineProperty(req, "error", {
          value: new DOMException("blocked"),
        });
        req.onerror?.(new Event("error"));
      }, 0);
      return req;
    },
  );
}

describe("mealPhotoStorage – db=null / open fails paths", () => {
  it("saveMealThumbnail returns false when DB cannot be opened", async () => {
    mockNullDb();
    expect(await saveMealThumbnail("m1", makeBlob())).toBe(false);
  });

  it("getMealThumbnailBlob returns null when DB cannot be opened", async () => {
    mockNullDb();
    expect(await getMealThumbnailBlob("m1")).toBeNull();
  });

  it("deleteMealThumbnail resolves without throwing when DB cannot be opened", async () => {
    mockNullDb();
    await expect(deleteMealThumbnail("m1")).resolves.toBeUndefined();
  });

  it("gcMealThumbnails returns { ok:false, deleted:0 } when DB cannot be opened", async () => {
    mockNullDb();
    const result = await gcMealThumbnails(new Set(["keep"]));
    expect(result).toEqual({ ok: false, deleted: 0 });
  });
});

describe("mealPhotoStorage – gcMealThumbnails transaction failure", () => {
  it("returns { ok:false, deleted:0 } when store.getAllKeys() transaction fails", async () => {
    const { openSergeantDb } =
      await import("../../../shared/lib/idb/sergeantDb");
    const db = await openSergeantDb();
    expect(db).not.toBeNull();
    vi.spyOn(db!, "transaction").mockImplementation(() => {
      throw new Error("tx failed");
    });
    const result = await gcMealThumbnails(["keep"]);
    expect(result).toEqual({ ok: false, deleted: 0 });
  });
});

describe("mealPhotoStorage – saveMealThumbnail transaction failure", () => {
  it("returns false when write transaction fails", async () => {
    const { openSergeantDb } =
      await import("../../../shared/lib/idb/sergeantDb");
    const db = await openSergeantDb();
    expect(db).not.toBeNull();
    vi.spyOn(db!, "transaction").mockImplementation(() => {
      throw new Error("write tx failed");
    });
    expect(await saveMealThumbnail("m2", makeBlob())).toBe(false);
  });
});

describe("mealPhotoStorage – getMealThumbnailBlob transaction failure", () => {
  it("returns null when read transaction fails", async () => {
    const { openSergeantDb } =
      await import("../../../shared/lib/idb/sergeantDb");
    const db = await openSergeantDb();
    expect(db).not.toBeNull();
    vi.spyOn(db!, "transaction").mockImplementation(() => {
      throw new Error("read tx failed");
    });
    expect(await getMealThumbnailBlob("m3")).toBeNull();
  });
});
