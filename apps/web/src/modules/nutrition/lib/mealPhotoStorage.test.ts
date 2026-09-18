// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for the IndexedDB-backed meal thumbnail store.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

import { __resetSergeantDbForTests } from "../../../shared/lib/idb/sergeantDb";
import {
  deleteMealThumbnail,
  fileToThumbnailBlob,
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

describe("saveMealThumbnail / getMealThumbnailBlob", () => {
  it("returns false when mealId or blob is missing", async () => {
    expect(await saveMealThumbnail(null, makeBlob())).toBe(false);
    expect(await saveMealThumbnail("m1", null)).toBe(false);
  });

  it("persists a thumbnail key on save", async () => {
    // NOTE: fake-indexeddb's structured clone of a jsdom Blob does not
    // survive `instanceof Blob`, so `getMealThumbnailBlob` resolves null
    // even though the write succeeded. Assert persistence via the key set
    // (gc reads `getAllKeys`, not the Blob identity) instead.
    expect(await saveMealThumbnail("m1", makeBlob("hello"))).toBe(true);
    const gc = await gcMealThumbnails([]); // nothing kept → deletes everything
    expect(gc.deleted).toBe(1);
  });

  it("returns null for a missing id", async () => {
    expect(await getMealThumbnailBlob(null)).toBeNull();
    expect(await getMealThumbnailBlob("nope")).toBeNull();
  });
});

describe("deleteMealThumbnail", () => {
  it("no-ops on a missing id", async () => {
    await expect(deleteMealThumbnail(null)).resolves.toBeUndefined();
  });

  it("removes a stored thumbnail", async () => {
    await saveMealThumbnail("m1", makeBlob());
    await deleteMealThumbnail("m1");
    // After delete the key is gone, so gc finds nothing to remove.
    const gc = await gcMealThumbnails([]);
    expect(gc.deleted).toBe(0);
  });
});

describe("gcMealThumbnails", () => {
  it("deletes thumbnails whose meal id is not in the keep set", async () => {
    await saveMealThumbnail("keep", makeBlob());
    await saveMealThumbnail("drop1", makeBlob());
    await saveMealThumbnail("drop2", makeBlob());

    const res = await gcMealThumbnails(new Set(["keep"]));
    expect(res.ok).toBe(true);
    expect(res.deleted).toBe(2);
    // A second gc keeping the same id should now find nothing to delete:
    // confirms "keep" survived the first pass and the two drops are gone.
    const res2 = await gcMealThumbnails(new Set(["keep"]));
    expect(res2.deleted).toBe(0);
  });

  it("accepts an array of valid ids", async () => {
    await saveMealThumbnail("a", makeBlob());
    await saveMealThumbnail("b", makeBlob());
    const res = await gcMealThumbnails(["a"]);
    expect(res.deleted).toBe(1);
  });

  it("respects maxDeletes", async () => {
    await saveMealThumbnail("a", makeBlob());
    await saveMealThumbnail("b", makeBlob());
    await saveMealThumbnail("c", makeBlob());
    const res = await gcMealThumbnails([], { maxDeletes: 1 });
    expect(res.deleted).toBe(1);
  });

  it("treats null/undefined keep set as empty", async () => {
    await saveMealThumbnail("a", makeBlob());
    const res = await gcMealThumbnails(undefined);
    expect(res.deleted).toBe(1);
  });
});

describe("fileToThumbnailBlob", () => {
  it("resolves null when image decoding fails (jsdom has no real decoder)", async () => {
    // jsdom's HTMLImageElement never fires `onload` for a blob URL, so the
    // canvas path can't run. Drive the error branch deterministically.
    const OrigImage = globalThis.Image;
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 0;
      naturalHeight = 0;
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("Image", FakeImage as unknown as typeof Image);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const out = await fileToThumbnailBlob(makeBlob());
    expect(out).toBeNull();
    vi.stubGlobal("Image", OrigImage);
  });

  it("draws to canvas and returns a blob on successful decode", async () => {
    const OrigImage = globalThis.Image;
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 200;
      naturalHeight = 100;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FakeImage as unknown as typeof Image);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (cb: BlobCallback) => cb(makeBlob("scaled")),
    );

    const out = await fileToThumbnailBlob(makeBlob(), 128);
    expect(out).toBeInstanceOf(Blob);
    vi.stubGlobal("Image", OrigImage);
  });

  it("resolves null when canvas 2d context is unavailable", async () => {
    const OrigImage = globalThis.Image;
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 50;
      naturalHeight = 50;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FakeImage as unknown as typeof Image);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    const out = await fileToThumbnailBlob(makeBlob());
    expect(out).toBeNull();
    vi.stubGlobal("Image", OrigImage);
  });
});
