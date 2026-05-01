import { describe, it, expect, beforeEach, vi } from "vitest";

function makeLS() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}

async function loadFresh() {
  // Чистимо кеш модулів + LS, щоб кожен кейс отримав свіжий store.
  vi.resetModules();
  globalThis.localStorage = makeLS();
  return await import("./featureFlags");
}

describe("featureFlags", () => {
  beforeEach(() => {
    globalThis.localStorage = makeLS();
  });

  it("повертає defaultValue з реєстру, якщо флаг не встановлено", async () => {
    const { getFlag, FLAG_REGISTRY } = await loadFresh();
    const sub = FLAG_REGISTRY.find(
      (f) => f.id === "finyk_subscriptions_category",
    );
    expect(getFlag("finyk_subscriptions_category")).toBe(sub!.defaultValue);
  });

  it("setFlag зберігає boolean і getFlag його повертає", async () => {
    const { getFlag, setFlag } = await loadFresh();
    expect(setFlag("finyk_subscriptions_category", true)).toBe(true);
    expect(getFlag("finyk_subscriptions_category")).toBe(true);
  });

  it("ігнорує невідомі id (getFlag→false, setFlag→false)", async () => {
    const { getFlag, setFlag } = await loadFresh();
    expect(setFlag("does_not_exist", true)).toBe(false);
    expect(getFlag("does_not_exist")).toBe(false);
  });

  it("resetFlags знімає користувацькі значення", async () => {
    const { getFlag, setFlag, resetFlags } = await loadFresh();
    setFlag("finyk_subscriptions_category", true);
    resetFlags();
    expect(getFlag("finyk_subscriptions_category")).toBe(false);
  });

  it("getAllFlags підставляє defaults для відсутніх ключів", async () => {
    const { getAllFlags, FLAG_REGISTRY } = await loadFresh();
    const all = getAllFlags();
    for (const f of FLAG_REGISTRY) {
      expect(all[f.id]).toBe(f.defaultValue);
    }
  });

  it("getAllFlags повертає ту саму ref до зміни (useSyncExternalStore contract)", async () => {
    const { getAllFlags, setFlag } = await loadFresh();
    const a = getAllFlags();
    const b = getAllFlags();
    expect(a).toBe(b);
    setFlag("finyk_subscriptions_category", true);
    const c = getAllFlags();
    expect(c).not.toBe(a);
    const d = getAllFlags();
    expect(d).toBe(c);
  });
});
