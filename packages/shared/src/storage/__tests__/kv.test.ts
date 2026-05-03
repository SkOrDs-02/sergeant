/**
 * Coverage target: 100% for `packages/shared/src/storage/kv.ts`.
 *
 * Each adapter is exercised against an isolated mock environment so we
 * never touch real DOM globals or `react-native-mmkv` in vitest.
 */
import { describe, expect, it, vi } from "vitest";

import {
  createMemoryKVStore,
  createMmkvKVStore,
  createWebKVStore,
  readJSON,
  writeJSON,
  type MmkvLike,
  type StorageEventLike,
  type StorageEventTargetLike,
  type StorageLike,
} from "../kv";

// ─── createMemoryKVStore ─────────────────────────────────────────────

describe("createMemoryKVStore", () => {
  it("returns null for missing keys", () => {
    const s = createMemoryKVStore();
    expect(s.getString("x")).toBeNull();
  });

  it("round-trips strings through set/get", () => {
    const s = createMemoryKVStore();
    s.setString("k", "v");
    expect(s.getString("k")).toBe("v");
  });

  it("honours the initial seed payload", () => {
    const s = createMemoryKVStore({ seeded: "yes" });
    expect(s.getString("seeded")).toBe("yes");
  });

  it("removes keys without throwing on unknown ids", () => {
    const s = createMemoryKVStore({ a: "1" });
    s.remove("a");
    s.remove("missing");
    expect(s.getString("a")).toBeNull();
  });

  it("fires onChange synchronously on setString with the new value", () => {
    const s = createMemoryKVStore();
    const listener = vi.fn();
    s.onChange("k", listener);
    s.setString("k", "v");
    expect(listener).toHaveBeenCalledWith("v");
  });

  it("fires onChange with null when the key is removed", () => {
    const s = createMemoryKVStore({ k: "v" });
    const listener = vi.fn();
    s.onChange("k", listener);
    s.remove("k");
    expect(listener).toHaveBeenCalledWith(null);
  });

  it("does not fire onChange when remove targets a missing key", () => {
    const s = createMemoryKVStore();
    const listener = vi.fn();
    s.onChange("k", listener);
    s.remove("k");
    expect(listener).not.toHaveBeenCalled();
  });

  it("scopes onChange listeners to the requested key", () => {
    const s = createMemoryKVStore();
    const aListener = vi.fn();
    const bListener = vi.fn();
    s.onChange("a", aListener);
    s.onChange("b", bListener);
    s.setString("a", "1");
    expect(aListener).toHaveBeenCalledTimes(1);
    expect(bListener).not.toHaveBeenCalled();
  });

  it("supports multiple listeners on the same key", () => {
    const s = createMemoryKVStore();
    const a = vi.fn();
    const b = vi.fn();
    s.onChange("k", a);
    s.onChange("k", b);
    s.setString("k", "v");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("disposer stops further notifications for that listener only", () => {
    const s = createMemoryKVStore();
    const a = vi.fn();
    const b = vi.fn();
    const dispose = s.onChange("k", a);
    s.onChange("k", b);
    dispose();
    s.setString("k", "v");
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("disposing twice is a no-op (no throw)", () => {
    const s = createMemoryKVStore();
    const dispose = s.onChange("k", vi.fn());
    dispose();
    expect(() => dispose()).not.toThrow();
  });

  it("swallows listener errors so writers stay safe", () => {
    const s = createMemoryKVStore();
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const ok = vi.fn();
    s.onChange("k", bad);
    s.onChange("k", ok);
    expect(() => s.setString("k", "v")).not.toThrow();
    expect(bad).toHaveBeenCalled();
    expect(ok).toHaveBeenCalled();
  });
});

// ─── readJSON / writeJSON ────────────────────────────────────────────

describe("readJSON / writeJSON", () => {
  it("parses round-tripped JSON", () => {
    const s = createMemoryKVStore();
    writeJSON(s, "k", { a: 1, b: [true, null] });
    expect(readJSON(s, "k")).toEqual({ a: 1, b: [true, null] });
  });

  it("returns null for missing slots", () => {
    expect(readJSON(createMemoryKVStore(), "missing")).toBeNull();
  });

  it("returns null for malformed JSON instead of throwing", () => {
    const s = createMemoryKVStore({ k: "{not-json" });
    expect(readJSON(s, "k")).toBeNull();
  });

  it("writeJSON silently no-ops on cyclic input", () => {
    const s = createMemoryKVStore();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => writeJSON(s, "k", cyclic)).not.toThrow();
    expect(s.getString("k")).toBeNull();
  });
});

// ─── createWebKVStore ────────────────────────────────────────────────

function createMockStorage(): StorageLike & { _map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    _map: map,
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

function createMockEventTarget(): StorageEventTargetLike & {
  _emit: (event: StorageEventLike) => void;
  _listenerCount: () => number;
} {
  const listeners = new Set<(event: StorageEventLike) => void>();
  return {
    addEventListener: (_type, listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener);
    },
    _emit: (event) => {
      for (const l of Array.from(listeners)) l(event);
    },
    _listenerCount: () => listeners.size,
  };
}

describe("createWebKVStore", () => {
  it("returns null for missing keys", () => {
    const store = createWebKVStore(createMockStorage());
    expect(store.getString("missing")).toBeNull();
  });

  it("round-trips strings through set/get", () => {
    const store = createWebKVStore(createMockStorage());
    store.setString("k", "v");
    expect(store.getString("k")).toBe("v");
  });

  it("removes keys", () => {
    const backing = createMockStorage();
    backing.setItem("k", "v");
    const store = createWebKVStore(backing);
    store.remove("k");
    expect(store.getString("k")).toBeNull();
  });

  it("swallows getItem throws (private mode, disabled storage)", () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error("disabled");
      },
      setItem: () => {},
      removeItem: () => {},
    };
    const store = createWebKVStore(throwing);
    expect(store.getString("k")).toBeNull();
  });

  it("swallows setItem throws (quota exceeded)", () => {
    const throwing: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
    };
    const store = createWebKVStore(throwing);
    expect(() => store.setString("k", "v")).not.toThrow();
  });

  it("swallows removeItem throws", () => {
    const throwing: StorageLike = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {
        throw new Error("disabled");
      },
    };
    const store = createWebKVStore(throwing);
    expect(() => store.remove("k")).not.toThrow();
  });

  it("getString coerces undefined to null", () => {
    const weird: StorageLike = {
      // Some shims return undefined instead of null for missing keys.
      getItem: () => undefined as unknown as string | null,
      setItem: () => {},
      removeItem: () => {},
    };
    expect(createWebKVStore(weird).getString("k")).toBeNull();
  });

  it("onChange with no eventTarget returns a no-op disposer", () => {
    const store = createWebKVStore(createMockStorage());
    const dispose = store.onChange("k", vi.fn());
    expect(() => dispose()).not.toThrow();
  });

  it("onChange fires for cross-tab writes to the watched key", () => {
    const target = createMockEventTarget();
    const store = createWebKVStore(createMockStorage(), target);
    const listener = vi.fn();
    store.onChange("k", listener);
    target._emit({ key: "k", newValue: "v" });
    expect(listener).toHaveBeenCalledWith("v");
  });

  it("onChange ignores writes to other keys", () => {
    const target = createMockEventTarget();
    const store = createWebKVStore(createMockStorage(), target);
    const listener = vi.fn();
    store.onChange("k", listener);
    target._emit({ key: "other", newValue: "v" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("onChange treats key=null (clear()) as removal", () => {
    const target = createMockEventTarget();
    const store = createWebKVStore(createMockStorage(), target);
    const listener = vi.fn();
    store.onChange("k", listener);
    target._emit({ key: null, newValue: null });
    expect(listener).toHaveBeenCalledWith(null);
  });

  it("disposer removes the underlying storage event listener", () => {
    const target = createMockEventTarget();
    const store = createWebKVStore(createMockStorage(), target);
    const dispose = store.onChange("k", vi.fn());
    expect(target._listenerCount()).toBe(1);
    dispose();
    expect(target._listenerCount()).toBe(0);
  });

  it("onChange returns no-op when addEventListener throws", () => {
    const broken: StorageEventTargetLike = {
      addEventListener: () => {
        throw new Error("not allowed");
      },
      removeEventListener: () => {},
    };
    const store = createWebKVStore(createMockStorage(), broken);
    const dispose = store.onChange("k", vi.fn());
    expect(() => dispose()).not.toThrow();
  });

  it("disposer swallows removeEventListener throws", () => {
    const target: StorageEventTargetLike = {
      addEventListener: () => {},
      removeEventListener: () => {
        throw new Error("boom");
      },
    };
    const store = createWebKVStore(createMockStorage(), target);
    const dispose = store.onChange("k", vi.fn());
    expect(() => dispose()).not.toThrow();
  });
});

// ─── createMmkvKVStore ───────────────────────────────────────────────

function createMockMmkv(): MmkvLike & {
  _map: Map<string, string>;
  _emit: (key: string) => void;
  _listenerCount: () => number;
} {
  const map = new Map<string, string>();
  const listeners = new Set<(changedKey: string) => void>();
  return {
    _map: map,
    getString: (k) => (map.has(k) ? map.get(k) : undefined),
    set: (k, v) => {
      map.set(k, v);
    },
    delete: (k) => {
      map.delete(k);
    },
    addOnValueChangedListener: (listener) => {
      listeners.add(listener);
      return {
        remove: () => {
          listeners.delete(listener);
        },
      };
    },
    _emit: (k) => {
      for (const l of Array.from(listeners)) l(k);
    },
    _listenerCount: () => listeners.size,
  };
}

describe("createMmkvKVStore", () => {
  it("returns null for missing keys", () => {
    const store = createMmkvKVStore(createMockMmkv());
    expect(store.getString("missing")).toBeNull();
  });

  it("round-trips strings through set/get", () => {
    const store = createMmkvKVStore(createMockMmkv());
    store.setString("k", "v");
    expect(store.getString("k")).toBe("v");
  });

  it("removes keys", () => {
    const mmkv = createMockMmkv();
    mmkv.set("k", "v");
    const store = createMmkvKVStore(mmkv);
    store.remove("k");
    expect(store.getString("k")).toBeNull();
  });

  it("supports a thunk-based provider (instance swap on bootstrap)", () => {
    const first = createMockMmkv();
    first.set("k", "first");
    const second = createMockMmkv();
    second.set("k", "second");
    let active = first;
    const store = createMmkvKVStore(() => active);
    expect(store.getString("k")).toBe("first");
    active = second;
    expect(store.getString("k")).toBe("second");
  });

  it("swallows getString throws", () => {
    const throwing: MmkvLike = {
      getString: () => {
        throw new Error("native");
      },
      set: () => {},
      delete: () => {},
      addOnValueChangedListener: () => ({ remove: () => {} }),
    };
    expect(createMmkvKVStore(throwing).getString("k")).toBeNull();
  });

  it("swallows set throws", () => {
    const throwing: MmkvLike = {
      getString: () => undefined,
      set: () => {
        throw new Error("native");
      },
      delete: () => {},
      addOnValueChangedListener: () => ({ remove: () => {} }),
    };
    const store = createMmkvKVStore(throwing);
    expect(() => store.setString("k", "v")).not.toThrow();
  });

  it("swallows delete throws", () => {
    const throwing: MmkvLike = {
      getString: () => undefined,
      set: () => {},
      delete: () => {
        throw new Error("native");
      },
      addOnValueChangedListener: () => ({ remove: () => {} }),
    };
    const store = createMmkvKVStore(throwing);
    expect(() => store.remove("k")).not.toThrow();
  });

  it("onChange filters by key and re-reads the latest value", () => {
    const mmkv = createMockMmkv();
    const store = createMmkvKVStore(mmkv);
    const listener = vi.fn();
    store.onChange("k", listener);
    mmkv.set("k", "v");
    mmkv._emit("k");
    expect(listener).toHaveBeenCalledWith("v");
  });

  it("onChange reports null when the key was deleted", () => {
    const mmkv = createMockMmkv();
    mmkv.set("k", "v");
    const store = createMmkvKVStore(mmkv);
    const listener = vi.fn();
    store.onChange("k", listener);
    mmkv.delete("k");
    mmkv._emit("k");
    expect(listener).toHaveBeenCalledWith(null);
  });

  it("onChange ignores changes for other keys", () => {
    const mmkv = createMockMmkv();
    const store = createMmkvKVStore(mmkv);
    const listener = vi.fn();
    store.onChange("k", listener);
    mmkv._emit("other");
    expect(listener).not.toHaveBeenCalled();
  });

  it("disposer removes the underlying MMKV listener", () => {
    const mmkv = createMockMmkv();
    const store = createMmkvKVStore(mmkv);
    const dispose = store.onChange("k", vi.fn());
    expect(mmkv._listenerCount()).toBe(1);
    dispose();
    expect(mmkv._listenerCount()).toBe(0);
  });

  it("onChange returns no-op when addOnValueChangedListener throws", () => {
    const broken: MmkvLike = {
      getString: () => undefined,
      set: () => {},
      delete: () => {},
      addOnValueChangedListener: () => {
        throw new Error("native");
      },
    };
    const store = createMmkvKVStore(broken);
    const dispose = store.onChange("k", vi.fn());
    expect(() => dispose()).not.toThrow();
  });

  it("disposer swallows sub.remove throws", () => {
    const flaky: MmkvLike = {
      getString: () => undefined,
      set: () => {},
      delete: () => {},
      addOnValueChangedListener: () => ({
        remove: () => {
          throw new Error("native");
        },
      }),
    };
    const store = createMmkvKVStore(flaky);
    const dispose = store.onChange("k", vi.fn());
    expect(() => dispose()).not.toThrow();
  });

  it("onChange swallows getString throws inside the handler", () => {
    let getStringShouldThrow = false;
    const flaky: MmkvLike & { _emit: (k: string) => void } = (() => {
      const listeners = new Set<(k: string) => void>();
      return {
        getString: () => {
          if (getStringShouldThrow) throw new Error("native");
          return "v";
        },
        set: () => {},
        delete: () => {},
        addOnValueChangedListener: (listener) => {
          listeners.add(listener);
          return {
            remove: () => {
              listeners.delete(listener);
            },
          };
        },
        _emit: (k) => {
          for (const l of Array.from(listeners)) l(k);
        },
      };
    })();
    const store = createMmkvKVStore(flaky);
    const listener = vi.fn();
    store.onChange("k", listener);
    getStringShouldThrow = true;
    flaky._emit("k");
    expect(listener).toHaveBeenCalledWith(null);
  });

  it("swallows listener errors during onChange dispatch", () => {
    const mmkv = createMockMmkv();
    const store = createMmkvKVStore(mmkv);
    store.onChange("k", () => {
      throw new Error("boom");
    });
    mmkv.set("k", "v");
    expect(() => mmkv._emit("k")).not.toThrow();
  });
});
