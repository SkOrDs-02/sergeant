import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { storageManager } from "./storageManager";

// Minimal localStorage polyfill — vitest runs in node by default.
beforeAll(() => {
  if (typeof globalThis.localStorage === "undefined") {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    } as Storage;
  }
});

// Reset the "already ran" record before every test so migrations can re-run.
beforeEach(() => {
  storageManager.resetAll();
  localStorage.clear();
});

// ─── register() validation ────────────────────────────────────────────────────

describe("storageManager.register()", () => {
  it("throws when migration.id is empty", () => {
    expect(() =>
      storageManager.register({ id: "", description: "x", up: () => {} }),
    ).toThrow();
  });

  it("throws when migration.id is whitespace-only", () => {
    expect(() =>
      storageManager.register({ id: "   ", description: "x", up: () => {} }),
    ).toThrow();
  });

  it("throws when migration.up is not a function", () => {
    expect(() =>
      storageManager.register({
        id: "test_reg_invalid_up",
        description: "x",
        up: null as unknown as () => void,
      }),
    ).toThrow();
  });

  it("does not throw for a valid migration", () => {
    expect(() =>
      storageManager.register({
        id: "test_reg_valid_001",
        description: "Valid",
        up: () => {},
      }),
    ).not.toThrow();
  });

  it("silently ignores duplicate registration (same id)", () => {
    // test_reg_valid_001 was already registered in a previous test call on this
    // module — or we register it fresh here. Either way it must not throw.
    expect(() =>
      storageManager.register({
        id: "test_reg_valid_001",
        description: "Duplicate",
        up: () => {},
      }),
    ).not.toThrow();
  });
});

// ─── runAll() ─────────────────────────────────────────────────────────────────

describe("storageManager.runAll()", () => {
  it("runs a newly registered migration and reports it in result.ran", () => {
    let executed = false;
    storageManager.register({
      id: "test_run_001_basic",
      description: "Basic run test",
      up() {
        executed = true;
      },
    });

    const result = storageManager.runAll();
    expect(executed).toBe(true);
    expect(result.ran).toContain("test_run_001_basic");
  });

  it("skips migration on second runAll() call (already ran)", () => {
    let count = 0;
    storageManager.register({
      id: "test_run_002_skip",
      description: "Skip on second call",
      up() {
        count++;
      },
    });

    storageManager.runAll(); // first run — records it
    const countAfterFirst = count;
    const r2 = storageManager.runAll(); // second run — should skip

    expect(count).toBe(countAfterFirst); // not incremented
    expect(r2.skipped).toContain("test_run_002_skip");
  });

  it("reports migration errors in result.errors without throwing", () => {
    storageManager.register({
      id: "test_run_003_error",
      description: "Migration that throws",
      up() {
        throw new Error("intentional failure");
      },
    });

    const result = storageManager.runAll();
    const err = result.errors.find((e) => e.id === "test_run_003_error");
    expect(err).toBeDefined();
    expect(err!.error).toBeInstanceOf(Error);
    // A failed migration must NOT be recorded as ran
    expect(result.ran).not.toContain("test_run_003_error");
  });

  it("continues running subsequent migrations after one fails", () => {
    let secondRan = false;
    storageManager.register({
      id: "test_run_004_fail_first",
      description: "Fails",
      up() {
        throw new Error("boom");
      },
    });
    storageManager.register({
      id: "test_run_004_second",
      description: "Runs after failure",
      up() {
        secondRan = true;
      },
    });

    storageManager.runAll();
    expect(secondRan).toBe(true);
  });
});

// ─── resetMigration() ─────────────────────────────────────────────────────────

describe("storageManager.resetMigration()", () => {
  it("allows a migration to re-run after reset", () => {
    let count = 0;
    storageManager.register({
      id: "test_reset_001",
      description: "Re-run after reset",
      up() {
        count++;
      },
    });

    storageManager.runAll();
    expect(count).toBe(1);

    storageManager.resetMigration("test_reset_001");
    storageManager.runAll();
    expect(count).toBe(2);
  });

  it("does not affect other migrations when resetting one", () => {
    let countA = 0;
    let countB = 0;
    storageManager.register({
      id: "test_reset_002a",
      description: "Migration A",
      up() {
        countA++;
      },
    });
    storageManager.register({
      id: "test_reset_002b",
      description: "Migration B",
      up() {
        countB++;
      },
    });

    storageManager.runAll();
    const aAfterFirst = countA;
    const bAfterFirst = countB;

    storageManager.resetMigration("test_reset_002a");
    storageManager.runAll();

    expect(countA).toBe(aAfterFirst + 1); // re-ran
    expect(countB).toBe(bAfterFirst); // did not re-run
  });
});

// ─── resetAll() ───────────────────────────────────────────────────────────────

describe("storageManager.resetAll()", () => {
  it("causes all registered migrations to re-run on next runAll()", () => {
    let count = 0;
    storageManager.register({
      id: "test_resetall_001",
      description: "Reset all test",
      up() {
        count++;
      },
    });

    storageManager.runAll();
    const countAfterFirst = count;
    storageManager.resetAll();
    storageManager.runAll();

    expect(count).toBeGreaterThan(countAfterFirst);
  });
});
