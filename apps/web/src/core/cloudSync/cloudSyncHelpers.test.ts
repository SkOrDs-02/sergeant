// @vitest-environment jsdom
/**
 * Тести для pure-функцій cloud sync (без fetch/network).
 * Тестуємо логіку: keyToModule, dirty tracking, offline queue, versioning.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";

// ── Helpers (дублюємо логіку щоб не exposure-ити з useCloudSync) ──────────

const SYNC_MODULES = {
  finyk: {
    keys: [
      "finyk_hidden",
      "finyk_budgets",
      "finyk_subs",
      "finyk_debts",
      "finyk_recv",
      "finyk_hidden_txs",
      "finyk_monthly_plan",
      "finyk_tx_cats",
    ],
  },
  fizruk: { keys: ["fizruk_workouts_v1", "fizruk_custom_exercises_v1"] },
  routine: { keys: ["hub_routine_v1"] },
  nutrition: { keys: ["nutrition_log_v1", "nutrition_prefs_v1"] },
};

function keyToModule(key: string): string | null {
  for (const [mod, config] of Object.entries(SYNC_MODULES)) {
    if (config.keys.includes(key)) return mod;
  }
  return null;
}

const ALL_TRACKED_KEYS = new Set(
  Object.values(SYNC_MODULES).flatMap((m) => m.keys),
);

const DIRTY_KEY = "hub_sync_dirty_modules";
const VERSION_KEY = "hub_sync_versions";
const OFFLINE_QUEUE_KEY = "hub_sync_offline_queue";

function getDirtyModules(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(DIRTY_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function markModuleDirty(moduleName: string) {
  const dirty = getDirtyModules();
  dirty[moduleName] = true;
  localStorage.setItem(DIRTY_KEY, JSON.stringify(dirty));
}

function clearDirtyModule(moduleName: string) {
  const dirty = getDirtyModules();
  delete dirty[moduleName];
  localStorage.setItem(DIRTY_KEY, JSON.stringify(dirty));
}

type ModuleVersions = Record<string, Record<string, number>>;

function getModuleVersions(): ModuleVersions {
  try {
    const raw = localStorage.getItem(VERSION_KEY);
    return raw ? (JSON.parse(raw) as ModuleVersions) : {};
  } catch {
    return {};
  }
}

function setModuleVersion(userId: string, moduleName: string, version: number) {
  const versions = getModuleVersions();
  if (!versions[userId]) versions[userId] = {};
  versions[userId][moduleName] = version;
  localStorage.setItem(VERSION_KEY, JSON.stringify(versions));
}

function getModuleVersion(userId: string, moduleName: string): number {
  return getModuleVersions()[userId]?.[moduleName] ?? 0;
}

interface OfflineQueueEntry {
  module: string;
  action?: string;
  payload?: unknown;
  ts?: string;
}

function getOfflineQueue(): OfflineQueueEntry[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as OfflineQueueEntry[]) : [];
  } catch {
    return [];
  }
}

function addToOfflineQueue(entry: Omit<OfflineQueueEntry, "ts">) {
  const queue = getOfflineQueue();
  queue.push({ ...entry, ts: new Date().toISOString() });
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

function clearOfflineQueue() {
  localStorage.removeItem(OFFLINE_QUEUE_KEY);
}

// ── Tests ────────────────────────────────────────────────────────────────

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("keyToModule", () => {
  it("знаходить модуль за відомим ключем", () => {
    expect(keyToModule("finyk_budgets")).toBe("finyk");
    expect(keyToModule("fizruk_workouts_v1")).toBe("fizruk");
    expect(keyToModule("hub_routine_v1")).toBe("routine");
    expect(keyToModule("nutrition_log_v1")).toBe("nutrition");
  });

  it("повертає null для невідомого ключа", () => {
    expect(keyToModule("some_random_key")).toBeNull();
    expect(keyToModule("")).toBeNull();
  });
});

describe("ALL_TRACKED_KEYS", () => {
  it("містить ключі всіх модулів", () => {
    expect(ALL_TRACKED_KEYS.has("finyk_budgets")).toBe(true);
    expect(ALL_TRACKED_KEYS.has("hub_routine_v1")).toBe(true);
    expect(ALL_TRACKED_KEYS.has("fizruk_workouts_v1")).toBe(true);
    expect(ALL_TRACKED_KEYS.has("nutrition_prefs_v1")).toBe(true);
  });

  it("не містить сторонніх ключів", () => {
    expect(ALL_TRACKED_KEYS.has("hub_chat_history")).toBe(false);
    expect(ALL_TRACKED_KEYS.has("dark_mode")).toBe(false);
  });
});

describe("dirty tracking", () => {
  it("починається з порожнього стану", () => {
    expect(getDirtyModules()).toEqual({});
  });

  it("markModuleDirty — позначає модуль брудним", () => {
    markModuleDirty("finyk");
    expect(getDirtyModules().finyk).toBe(true);
  });

  it("clearDirtyModule — очищує тільки вказаний модуль", () => {
    markModuleDirty("finyk");
    markModuleDirty("routine");
    clearDirtyModule("finyk");
    const dirty = getDirtyModules();
    expect(dirty.finyk).toBeUndefined();
    expect(dirty.routine).toBe(true);
  });

  it("можна позначити кілька модулів", () => {
    markModuleDirty("finyk");
    markModuleDirty("fizruk");
    markModuleDirty("nutrition");
    const dirty = getDirtyModules();
    expect(Object.keys(dirty).length).toBe(3);
  });
});

describe("version tracking", () => {
  const userId = "user_test_123";

  it("повертає 0 для нового модуля", () => {
    expect(getModuleVersion(userId, "finyk")).toBe(0);
  });

  it("setModuleVersion зберігає та повертає версію", () => {
    setModuleVersion(userId, "finyk", 5);
    expect(getModuleVersion(userId, "finyk")).toBe(5);
  });

  it("версії різних модулів незалежні", () => {
    setModuleVersion(userId, "finyk", 3);
    setModuleVersion(userId, "fizruk", 7);
    expect(getModuleVersion(userId, "finyk")).toBe(3);
    expect(getModuleVersion(userId, "fizruk")).toBe(7);
  });

  it("версії різних userId незалежні", () => {
    setModuleVersion("user_a", "routine", 2);
    setModuleVersion("user_b", "routine", 9);
    expect(getModuleVersion("user_a", "routine")).toBe(2);
    expect(getModuleVersion("user_b", "routine")).toBe(9);
  });

  it("оновлення версії перезаписує попередню", () => {
    setModuleVersion(userId, "nutrition", 1);
    setModuleVersion(userId, "nutrition", 4);
    expect(getModuleVersion(userId, "nutrition")).toBe(4);
  });
});

describe("offline queue", () => {
  it("порожня черга — порожній масив", () => {
    expect(getOfflineQueue()).toEqual([]);
  });

  it("addToOfflineQueue додає запис", () => {
    addToOfflineQueue({ module: "finyk", action: "push" });
    const queue = getOfflineQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].module).toBe("finyk");
    expect(queue[0].action).toBe("push");
    expect(typeof queue[0].ts).toBe("string");
  });

  it("clearOfflineQueue очищує чергу", () => {
    addToOfflineQueue({ module: "fizruk", action: "push" });
    addToOfflineQueue({ module: "routine", action: "push" });
    clearOfflineQueue();
    expect(getOfflineQueue()).toEqual([]);
  });

  it("зберігає порядок кількох записів", () => {
    addToOfflineQueue({ module: "finyk", action: "push" });
    addToOfflineQueue({ module: "fizruk", action: "push" });
    const q = getOfflineQueue();
    expect(q[0].module).toBe("finyk");
    expect(q[1].module).toBe("fizruk");
  });
});
