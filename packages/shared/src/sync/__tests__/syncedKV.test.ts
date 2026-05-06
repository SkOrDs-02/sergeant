import { describe, expect, it, vi } from "vitest";

import { createMemoryKVStore } from "../../storage/kv";
import { createSyncedKVStore } from "../syncedKV";

describe("createSyncedKVStore", () => {
  it("delegates getString to the base store", () => {
    const base = createMemoryKVStore({ a: "1" });
    const synced = createSyncedKVStore(base, {
      onChange: () => {},
      isTracked: () => true,
    });

    expect(synced.getString("a")).toBe("1");
    expect(synced.getString("missing")).toBeNull();
  });

  it("writes through to base before firing onChange (write-then-notify order)", () => {
    const base = createMemoryKVStore();
    const seen: Array<{ key: string; value: string | null }> = [];
    const synced = createSyncedKVStore(base, {
      onChange(key) {
        // Reading inside the callback must see the write that just landed.
        seen.push({ key, value: base.getString(key) });
      },
      isTracked: () => true,
    });

    synced.setString("k", "v");

    expect(base.getString("k")).toBe("v");
    expect(seen).toEqual([{ key: "k", value: "v" }]);
  });

  it("fires onChange only for tracked keys on setString", () => {
    const onChange = vi.fn();
    const synced = createSyncedKVStore(createMemoryKVStore(), {
      onChange,
      isTracked: (key) => key === "tracked",
    });

    synced.setString("tracked", "1");
    synced.setString("untracked", "2");

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("tracked");
  });

  it("fires onChange only for tracked keys on remove", () => {
    const onChange = vi.fn();
    const base = createMemoryKVStore({ tracked: "1", untracked: "2" });
    const synced = createSyncedKVStore(base, {
      onChange,
      isTracked: (key) => key === "tracked",
    });

    synced.remove("untracked");
    synced.remove("tracked");

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("tracked");
    expect(base.getString("tracked")).toBeNull();
    expect(base.getString("untracked")).toBeNull();
  });

  it("removes still happen on the base store even when key is untracked", () => {
    const base = createMemoryKVStore({ a: "1" });
    const synced = createSyncedKVStore(base, {
      onChange: () => {},
      isTracked: () => false,
    });

    synced.remove("a");

    expect(base.getString("a")).toBeNull();
  });

  it("forwards onChange subscriptions to the base store", () => {
    const base = createMemoryKVStore();
    const synced = createSyncedKVStore(base, {
      onChange: () => {},
      isTracked: () => true,
    });

    const listener = vi.fn();
    const unsubscribe = synced.onChange("k", listener);

    base.setString("k", "v");
    expect(listener).toHaveBeenCalledWith("v");

    unsubscribe();
    base.setString("k", "v2");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not fire onChange when the writer throws", () => {
    const onChange = vi.fn();
    const base = {
      ...createMemoryKVStore(),
      setString() {
        throw new Error("quota exceeded");
      },
    };
    const synced = createSyncedKVStore(base, {
      onChange,
      isTracked: () => true,
    });

    expect(() => synced.setString("k", "v")).toThrow("quota exceeded");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("delegates listKeys to the base store", () => {
    const base = createMemoryKVStore({ a: "1", b: "2" });
    const synced = createSyncedKVStore(base, {
      onChange: () => {},
      isTracked: () => true,
    });

    expect(new Set(synced.listKeys())).toEqual(new Set(["a", "b"]));

    synced.setString("c", "3");
    expect(new Set(synced.listKeys())).toEqual(new Set(["a", "b", "c"]));

    synced.remove("a");
    expect(new Set(synced.listKeys())).toEqual(new Set(["b", "c"]));
  });
});
