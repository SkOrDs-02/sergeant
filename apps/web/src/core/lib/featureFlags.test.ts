import { describe, it, expect, beforeEach, vi } from "vitest";

function makeLS() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) ?? null) : null),
    setItem: (k: string, v: string) => map.set(k, String(v)),
    removeItem: (k: string) => map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}

async function loadFresh() {
  // Чистимо кеш модулів + LS, щоб кожен кейс отримав свіжий store.
  vi.resetModules();
  globalThis.localStorage = makeLS() as unknown as Storage;
  return await import("./featureFlags");
}

describe("featureFlags", () => {
  beforeEach(() => {
    globalThis.localStorage = makeLS() as unknown as Storage;
  });

  it("повертає defaultValue з реєстру, якщо флаг не встановлено", async () => {
    const { getFlag, FLAG_REGISTRY } = await loadFresh();
    const sub = FLAG_REGISTRY.find(
      (f) => f.id === "finyk_subscriptions_category",
    );
    expect(getFlag("finyk_subscriptions_category")).toBe(sub!.defaultValue);
  });

  it("Routine dual-write увімкнений за замовчуванням і може бути вимкнений користувачем", async () => {
    const { getFlag, setFlag } = await loadFresh();
    expect(getFlag("feature.routine.sqlite_v2.dual_write")).toBe(true);

    expect(setFlag("feature.routine.sqlite_v2.dual_write", false)).toBe(true);
    expect(getFlag("feature.routine.sqlite_v2.dual_write")).toBe(false);
  });

  it("Fizruk dual-write увімкнений за замовчуванням і може бути вимкнений користувачем", async () => {
    const { getFlag, setFlag } = await loadFresh();
    expect(getFlag("feature.fizruk.sqlite_v2.dual_write")).toBe(true);

    expect(setFlag("feature.fizruk.sqlite_v2.dual_write", false)).toBe(true);
    expect(getFlag("feature.fizruk.sqlite_v2.dual_write")).toBe(false);
  });

  it("flips Routine read_sqlite default-on for Stage 8 PR #055r2 re-rollout", async () => {
    const { getFlag, setFlag } = await loadFresh();
    expect(getFlag("feature.routine.sqlite_v2.read_sqlite")).toBe(true);

    expect(setFlag("feature.routine.sqlite_v2.read_sqlite", false)).toBe(true);
    expect(getFlag("feature.routine.sqlite_v2.read_sqlite")).toBe(false);
  });

  it("flips Fizruk read_sqlite default-on for Stage 8 PR #055f2 re-rollout", async () => {
    const { getFlag, setFlag } = await loadFresh();
    expect(getFlag("feature.fizruk.sqlite_v2.read_sqlite")).toBe(true);

    expect(setFlag("feature.fizruk.sqlite_v2.read_sqlite", false)).toBe(true);
    expect(getFlag("feature.fizruk.sqlite_v2.read_sqlite")).toBe(false);
  });

  it("Nutrition dual-write увімкнений за замовчуванням для Stage 8 PR #055n1", async () => {
    const { getFlag, setFlag } = await loadFresh();
    expect(getFlag("feature.nutrition.sqlite_v2.dual_write")).toBe(true);

    expect(setFlag("feature.nutrition.sqlite_v2.dual_write", false)).toBe(true);
    expect(getFlag("feature.nutrition.sqlite_v2.dual_write")).toBe(false);
  });

  it("Finyk dual-write і Mono mirror увімкнені за замовчуванням для Stage 8 PR #055k1", async () => {
    const { getFlag, setFlag } = await loadFresh();
    expect(getFlag("feature.finyk.sqlite_v2.dual_write")).toBe(true);
    expect(getFlag("feature.finyk.sqlite_v2.mono_mirror")).toBe(true);

    expect(setFlag("feature.finyk.sqlite_v2.dual_write", false)).toBe(true);
    expect(setFlag("feature.finyk.sqlite_v2.mono_mirror", false)).toBe(true);
    expect(getFlag("feature.finyk.sqlite_v2.dual_write")).toBe(false);
    expect(getFlag("feature.finyk.sqlite_v2.mono_mirror")).toBe(false);
  });

  it("flips Nutrition read_sqlite default-on for Stage 8 PR #055n2 re-rollout", async () => {
    const { getFlag, setFlag } = await loadFresh();
    expect(getFlag("feature.nutrition.sqlite_v2.read_sqlite")).toBe(true);

    expect(setFlag("feature.nutrition.sqlite_v2.read_sqlite", false)).toBe(
      true,
    );
    expect(getFlag("feature.nutrition.sqlite_v2.read_sqlite")).toBe(false);
  });

  it("keeps Finyk read_sqlite default-off while Stage 8 read rollout is paused", async () => {
    const { getFlag, setFlag } = await loadFresh();
    expect(getFlag("feature.finyk.sqlite_v2.read_sqlite")).toBe(false);

    expect(setFlag("feature.finyk.sqlite_v2.read_sqlite", true)).toBe(true);
    expect(getFlag("feature.finyk.sqlite_v2.read_sqlite")).toBe(true);
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
