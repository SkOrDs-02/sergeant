/**
 * Centralized localStorage migration manager.
 *
 * Usage:
 *   storageManager.register(migration)
 *   storageManager.runAll()
 *
 * Each migration runs at most once (tracked by its `id` in
 * `storageManager_ran_migrations` localStorage key).
 */

const MIGRATIONS_RAN_KEY = "storageManager_ran_migrations";

export interface Migration {
  /** Unique, stable migration identifier (never change). */
  id: string;
  /** Human-readable description of what is migrated. */
  description: string;
  /** Migration function; receives no arguments, runs synchronously. */
  up: () => void;
}

export interface MigrationError {
  id: string;
  error: unknown;
}

export interface MigrationRunResult {
  ran: string[];
  skipped: string[];
  errors: MigrationError[];
}

function loadRanSet(): Set<string> {
  try {
    const raw = localStorage.getItem(MIGRATIONS_RAN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set<string>(parsed) : new Set();
  } catch {
    return new Set();
  }
}

function saveRanSet(set: Set<string>): void {
  try {
    localStorage.setItem(MIGRATIONS_RAN_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore storage errors */
  }
}

const registry: Migration[] = [];

/**
 * Register a migration. Must be called before `runAll()`.
 */
function register(migration: Migration): void {
  if (!migration || typeof migration.id !== "string" || !migration.id.trim()) {
    throw new Error("storageManager.register: migration.id is required");
  }
  if (typeof migration.up !== "function") {
    throw new Error("storageManager.register: migration.up must be a function");
  }
  if (registry.some((m) => m.id === migration.id)) {
    return; // already registered (e.g. hot-reload)
  }
  registry.push(migration);
}

/**
 * Run all registered migrations that have not yet been executed.
 * Call once on app boot, after all migrations are registered.
 */
function runAll(): MigrationRunResult {
  const ran = loadRanSet();
  const result: MigrationRunResult = { ran: [], skipped: [], errors: [] };

  for (const migration of registry) {
    if (ran.has(migration.id)) {
      result.skipped.push(migration.id);
      continue;
    }
    try {
      migration.up();
      ran.add(migration.id);
      saveRanSet(ran);
      result.ran.push(migration.id);
    } catch (e) {
      result.errors.push({ id: migration.id, error: e });
      console.warn(`[storageManager] Migration "${migration.id}" failed:`, e);
    }
  }

  return result;
}

/**
 * Reset the "already ran" record for a specific migration id.
 * Useful in tests or manual data recovery.
 */
function resetMigration(id: string): void {
  const ran = loadRanSet();
  ran.delete(id);
  saveRanSet(ran);
}

/**
 * Clear all migration history (forces all migrations to re-run on next `runAll()`).
 * Use only for debugging or data recovery.
 */
function resetAll(): void {
  try {
    localStorage.removeItem(MIGRATIONS_RAN_KEY);
  } catch {
    /* ignore */
  }
}

export const storageManager = { register, runAll, resetMigration, resetAll };

// ─────────────────────────────────────────────────────────────────────────────
// Built-in migrations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Migrate Finyk tokens and tx-cache from legacy "finto_*" keys to "finyk_*" keys.
 * Previously this ran inline at module load in useMonobank.js.
 */
storageManager.register({
  id: "finyk_001_rename_finto_keys",
  description: 'Rename localStorage keys from "finto_*" prefix to "finyk_*".',
  up() {
    for (const [oldKey, newKey] of [
      ["finto_tx_cache", "finyk_tx_cache"],
      ["finto_info_cache", "finyk_info_cache"],
      ["finto_token", "finyk_token"],
    ] as const) {
      try {
        const v = localStorage.getItem(oldKey);
        if (v !== null && localStorage.getItem(newKey) === null) {
          localStorage.setItem(newKey, v);
        }
        if (v !== null) localStorage.removeItem(oldKey);
      } catch {
        /* ignore per-key errors */
      }
    }
    try {
      const oldLast = localStorage.getItem("finto_tx_cache_last_good");
      if (
        oldLast !== null &&
        localStorage.getItem("finyk_tx_cache_last_good") === null
      ) {
        localStorage.setItem("finyk_tx_cache_last_good", oldLast);
      }
      if (oldLast !== null) localStorage.removeItem("finto_tx_cache_last_good");
    } catch {
      /* ignore */
    }
  },
});

/**
 * Migrate nutrition pantry data from legacy v0 keys
 * ("nutrition_pantry_items_v0", "nutrition_pantry_text_v0") to the unified
 * pantries array under "nutrition_pantries_v1".
 */
storageManager.register({
  id: "nutrition_001_migrate_legacy_pantry",
  description: "Migrate v0 pantry items/text keys into the v1 pantries array.",
  up() {
    const PANTRIES_KEY = "nutrition_pantries_v1";
    const ACTIVE_KEY = "nutrition_active_pantry_v1";
    const LEGACY_ITEMS = "nutrition_pantry_items_v0";
    const LEGACY_TEXT = "nutrition_pantry_text_v0";

    // Skip if the new key already has data
    try {
      const existing = localStorage.getItem(PANTRIES_KEY);
      if (existing) {
        const parsed = JSON.parse(existing);
        if (Array.isArray(parsed) && parsed.length > 0) return;
      }
    } catch {
      /* continue with migration */
    }

    let items: unknown[] = [];
    let text = "";
    try {
      const rawItems = localStorage.getItem(LEGACY_ITEMS);
      if (rawItems) {
        const parsed = JSON.parse(rawItems);
        if (Array.isArray(parsed)) items = parsed;
      }
    } catch {
      /* ignore */
    }
    try {
      const rawText = localStorage.getItem(LEGACY_TEXT);
      if (rawText) text = String(rawText);
    } catch {
      /* ignore */
    }

    if (items.length === 0 && !text) return; // nothing to migrate

    const pantry = { id: "home", name: "Дім", items, text };
    // Let write errors throw so runAll() does not mark this migration as done
    localStorage.setItem(PANTRIES_KEY, JSON.stringify([pantry]));
    localStorage.setItem(ACTIVE_KEY, "home");
    try {
      localStorage.removeItem(LEGACY_ITEMS);
    } catch {
      /* best-effort */
    }
    try {
      localStorage.removeItem(LEGACY_TEXT);
    } catch {
      /* best-effort */
    }
  },
});

/**
 * Migrate Fizruk legacy pushup log ("fizruk_pushups_v1") into the routine
 * state's pushupsByDate field ("hub_routine_v1").
 */
storageManager.register({
  id: "routine_001_migrate_fizruk_pushups",
  description:
    'Migrate "fizruk_pushups_v1" pushup log into routine state pushupsByDate.',
  up() {
    const ROUTINE_KEY = "hub_routine_v1";
    const PUSHUPS_LEGACY = "fizruk_pushups_v1";

    let legacy: Record<string, unknown>;
    try {
      const raw = localStorage.getItem(PUSHUPS_LEGACY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        Object.keys(parsed).length === 0
      )
        return;
      legacy = parsed as Record<string, unknown>;
    } catch {
      return;
    }

    const routineRaw = localStorage.getItem(ROUTINE_KEY);
    let state: Record<string, unknown>;
    try {
      state = routineRaw
        ? (JSON.parse(routineRaw) as Record<string, unknown>)
        : {};
    } catch {
      state = {};
    }
    // Only migrate if pushupsByDate is empty
    const existing = state.pushupsByDate;
    if (
      existing &&
      typeof existing === "object" &&
      Object.keys(existing as Record<string, unknown>).length > 0
    ) {
      try {
        localStorage.removeItem(PUSHUPS_LEGACY);
      } catch {
        /* best-effort */
      }
      return;
    }
    state = { ...state, pushupsByDate: { ...legacy } };
    // Let write errors throw so runAll() does not mark this migration as done
    localStorage.setItem(ROUTINE_KEY, JSON.stringify(state));
    try {
      localStorage.removeItem(PUSHUPS_LEGACY);
    } catch {
      /* best-effort */
    }
  },
});
