import { beforeEach, describe, expect, it } from "vitest";

import {
  ANON_PARTITION_STATE_KEY,
  CLEAN_REVERIFY_MS,
  __resetAnonPartitionStateForTests,
  markAnonPartitionCleanIfUnchanged,
  markAnonPartitionDirty,
  parseAnonPartitionState,
  readAnonPartitionState,
  readAnonPartitionToken,
  sqlMayWriteAnonData,
} from "./anonPartitionState";

const NOW = 1_800_000_000_000;

function memoryStore(
  opts: { failSet?: boolean; failRemove?: boolean; failGet?: boolean } = {},
) {
  const map = new Map<string, string>();
  return {
    map,
    getString(key: string) {
      if (opts.failGet) throw new Error("blocked");
      return map.get(key) ?? null;
    },
    setString(key: string, value: string) {
      if (opts.failSet) throw new Error("quota");
      map.set(key, value);
    },
    remove(key: string) {
      if (opts.failRemove) throw new Error("blocked");
      map.delete(key);
    },
  };
}

beforeEach(() => {
  __resetAnonPartitionStateForTests();
});

describe("parseAnonPartitionState", () => {
  it("treats missing, garbage and future-dated values as unknown", () => {
    expect(parseAnonPartitionState(null, NOW)).toBe("unknown");
    expect(parseAnonPartitionState("", NOW)).toBe("unknown");
    expect(parseAnonPartitionState("clean", NOW)).toBe("unknown");
    expect(parseAnonPartitionState("clean:abc:x", NOW)).toBe("unknown");
    expect(parseAnonPartitionState(`clean:${NOW + 1}:x`, NOW)).toBe("unknown");
    expect(parseAnonPartitionState("dirty:", NOW)).toBe("unknown");
  });

  it("expires CLEAN after the re-verify window (Q3)", () => {
    expect(parseAnonPartitionState(`clean:${NOW}:x`, NOW)).toBe("clean");
    expect(
      parseAnonPartitionState(`clean:${NOW}:x`, NOW + CLEAN_REVERIFY_MS - 1),
    ).toBe("clean");
    expect(
      parseAnonPartitionState(`clean:${NOW}:x`, NOW + CLEAN_REVERIFY_MS),
    ).toBe("unknown");
    expect(parseAnonPartitionState("dirty:x", NOW)).toBe("dirty");
  });
});

describe("state transitions", () => {
  it("starts unknown and becomes clean only through compare-and-set", () => {
    const store = memoryStore();
    expect(readAnonPartitionState(NOW, store)).toBe("unknown");
    const token = readAnonPartitionToken(store);
    expect(markAnonPartitionCleanIfUnchanged(token, NOW, store)).toBe(true);
    expect(readAnonPartitionState(NOW, store)).toBe("clean");
  });

  it("dirty overrides clean", () => {
    const store = memoryStore();
    markAnonPartitionCleanIfUnchanged(null, NOW, store);
    markAnonPartitionDirty(store);
    expect(readAnonPartitionState(NOW, store)).toBe("dirty");
  });

  it("does not overwrite a DIRTY written during the proof (peek -> write)", () => {
    const store = memoryStore();
    const token = readAnonPartitionToken(store);
    markAnonPartitionDirty(store);
    expect(markAnonPartitionCleanIfUnchanged(token, NOW, store)).toBe(false);
    expect(readAnonPartitionState(NOW, store)).toBe("dirty");
  });

  it("every dirty write changes the token, so an already-dirty proof is also invalidated", () => {
    const store = memoryStore();
    markAnonPartitionDirty(store);
    const token = readAnonPartitionToken(store);
    markAnonPartitionDirty(store);
    expect(readAnonPartitionToken(store)).not.toBe(token);
    expect(markAnonPartitionCleanIfUnchanged(token, NOW, store)).toBe(false);
  });

  it("a proof taken after the last dirty write may clean (write -> peek)", () => {
    const store = memoryStore();
    markAnonPartitionDirty(store);
    const token = readAnonPartitionToken(store);
    expect(markAnonPartitionCleanIfUnchanged(token, NOW, store)).toBe(true);
    expect(readAnonPartitionState(NOW, store)).toBe("clean");
  });

  it("failed dirty write removes the key: unknown, never stale clean", () => {
    const store = memoryStore();
    markAnonPartitionCleanIfUnchanged(null, NOW, store);
    const failing = {
      ...store,
      setString: () => {
        throw new Error("quota");
      },
    };
    markAnonPartitionDirty(failing);
    expect(store.map.has(ANON_PARTITION_STATE_KEY)).toBe(false);
    // Памʼять сесії тримає DIRTY, доки вкладка жива.
    expect(readAnonPartitionState(NOW, store)).toBe("dirty");
    expect(markAnonPartitionCleanIfUnchanged(null, NOW, store)).toBe(false);
  });

  it("dirty survives in session memory when the store refuses both write and remove", () => {
    const store = memoryStore({ failSet: true, failRemove: true });
    markAnonPartitionDirty(store);
    expect(readAnonPartitionState(NOW, store)).toBe("dirty");
  });

  it("unreadable storage reads as unknown and cannot be cleaned", () => {
    const store = memoryStore({ failGet: true });
    expect(readAnonPartitionState(NOW, store)).toBe("unknown");
    expect(markAnonPartitionCleanIfUnchanged(null, NOW, store)).toBe(false);
    expect(markAnonPartitionCleanIfUnchanged(null, NOW, null)).toBe(false);
  });

  it("invariant 1: no sequence of events yields clean while an anonymous row exists", () => {
    // Модель: анонімний файл (рядки) + прапорець. Доказ CLEAN = токен до
    // перевірки + 0 рядків на момент перевірки, запис рядка = DIRTY перед ним.
    const events = ["write", "proofStart", "proofEnd", "delete"] as const;
    for (let mask = 0; mask < 4 ** 6; mask++) {
      __resetAnonPartitionStateForTests();
      const store = memoryStore();
      let rows = 0;
      let proof: { token: string | null; empty: boolean } | null = null;
      let m = mask;
      for (let step = 0; step < 6; step++) {
        const event = events[m % 4];
        m = Math.floor(m / 4);
        if (event === "write") {
          markAnonPartitionDirty(store);
          rows += 1;
        } else if (event === "proofStart") {
          proof = { token: readAnonPartitionToken(store), empty: rows === 0 };
        } else if (event === "proofEnd" && proof) {
          if (proof.empty)
            markAnonPartitionCleanIfUnchanged(proof.token, NOW, store);
          proof = null;
        } else if (event === "delete") {
          rows = 0;
        }
        if (readAnonPartitionState(NOW, store) === "clean") {
          expect(rows).toBe(0);
        }
      }
    }
  });
});

describe("sqlMayWriteAnonData", () => {
  it.each([
    'insert into "routine_habits" ("id") values (?)',
    "INSERT OR REPLACE INTO fizruk_workouts (id) VALUES (?)",
    "REPLACE INTO finyk_tx_notes (id) VALUES (?)",
    'update "nutrition_meals" set "deleted_at" = ? where "id" = ?',
    "UPDATE OR IGNORE routine_habits SET name = ?",
    "INSERT INTO fizruk_workouts (id) SELECT id FROM fizruk_pushups",
    "INSERT INTO some_future_table (id) VALUES (?)",
    "WITH x AS (SELECT 1) INSERT INTO routine_habits SELECT * FROM x",
    "CREATE TABLE a (id TEXT); UPDATE routine_habits SET x = 1;",
  ])("dirty: %s", (sql) => {
    expect(sqlMayWriteAnonData(sql)).toBe(true);
  });

  it.each([
    "SELECT * FROM routine_habits WHERE user_id = ?",
    "SELECT updated_at FROM routine_habits",
    "DELETE FROM routine_habits WHERE user_id = ? AND id = ?",
    'insert into "kv_store" ("k", "v") values (?, ?) on conflict ("k") do update set "v" = excluded."v"',
    "INSERT INTO __fizruk_migrations (name) VALUES (?)",
    "INSERT INTO anonymous_profile_migrations (source_user_id) VALUES (?)",
    "UPDATE anonymous_profile_migrations SET status = 'completed'",
    "CREATE TABLE IF NOT EXISTS routine_habits (id TEXT PRIMARY KEY)",
    "BEGIN IMMEDIATE",
  ])("clean: %s", (sql) => {
    expect(sqlMayWriteAnonData(sql)).toBe(false);
  });
});
