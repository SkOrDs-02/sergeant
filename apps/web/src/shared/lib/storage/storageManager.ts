/**
 * Centralized localStorage migration manager.
 *
 * Usage:
 *   storageManager.register(migration)
 *   storageManager.runAll()
 *
 * Each migration runs at most once (tracked by its `id` in
 * `storageManager_ran_migrations` localStorage key).
 *
 * Implementation: every read/write goes through `webKVStore` (best-effort,
 * silent on quota / private-mode errors) or, where a migration must
 * abort on write failure to stay re-runnable, through `safeJsonSet`
 * which surfaces the exception. No direct `localStorage.*` access
 * remains in this file (PR #054 final, eslint allowlist = []).
 */

// eslint-disable-next-line sergeant-design/no-flat-shared-lib -- log/ is a real subdir; consumed by storage/ for warn-level error reporting.
import { logger } from "../log";
import { webKVStore } from "./storage";
import { safeJsonSet, safeSetItem } from "./storageQuota";

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
  const raw = webKVStore.getString(MIGRATIONS_RAN_KEY);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set<string>(parsed) : new Set();
  } catch {
    return new Set();
  }
}

function saveRanSet(set: Set<string>): void {
  try {
    webKVStore.setString(MIGRATIONS_RAN_KEY, JSON.stringify([...set]));
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
      logger.warn(`[storageManager] Migration "${migration.id}" failed:`, e);
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
  webKVStore.remove(MIGRATIONS_RAN_KEY);
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
        const v = webKVStore.getString(oldKey);
        if (v !== null && webKVStore.getString(newKey) === null) {
          webKVStore.setString(newKey, v);
        }
        if (v !== null) webKVStore.remove(oldKey);
      } catch {
        /* ignore per-key errors */
      }
    }
    try {
      const oldLast = webKVStore.getString("finto_tx_cache_last_good");
      if (
        oldLast !== null &&
        webKVStore.getString("finyk_tx_cache_last_good") === null
      ) {
        webKVStore.setString("finyk_tx_cache_last_good", oldLast);
      }
      if (oldLast !== null) webKVStore.remove("finto_tx_cache_last_good");
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
      const existing = webKVStore.getString(PANTRIES_KEY);
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
      const rawItems = webKVStore.getString(LEGACY_ITEMS);
      if (rawItems) {
        const parsed = JSON.parse(rawItems);
        if (Array.isArray(parsed)) items = parsed;
      }
    } catch {
      /* ignore */
    }
    try {
      const rawText = webKVStore.getString(LEGACY_TEXT);
      if (rawText) text = String(rawText);
    } catch {
      /* ignore */
    }

    if (items.length === 0 && !text) return; // nothing to migrate

    const pantry = { id: "home", name: "Дім", items, text };
    // Throw on write failure so runAll() does not mark this migration as done.
    // `safeJsonSet` returns `{ ok: false, reason: "exception", error }` on
    // setItem failure; we surface it as a thrown error to preserve the
    // re-runnable contract.
    const pantriesWrite = safeJsonSet(PANTRIES_KEY, [pantry]);
    if (!pantriesWrite.ok) {
      throw pantriesWrite.error ?? new Error(pantriesWrite.reason ?? "write");
    }
    // ACTIVE_KEY stores a raw string (`"home"`), NOT a JSON-encoded
    // value — historical readers (`loadActivePantryId`) call
    // `localStorage.getItem(ACTIVE_KEY)` and expect the literal id
    // back, not `'"home"'`. Use `safeSetItem` so quota / private-mode
    // failures still throw and keep the migration re-runnable, but
    // skip the JSON.stringify wrapper that `safeJsonSet` adds.
    const activeWrite = safeSetItem(ACTIVE_KEY, "home");
    if (!activeWrite.ok) {
      throw activeWrite.error ?? new Error(activeWrite.reason ?? "write");
    }
    webKVStore.remove(LEGACY_ITEMS);
    webKVStore.remove(LEGACY_TEXT);
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
      const raw = webKVStore.getString(PUSHUPS_LEGACY);
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

    const routineRaw = webKVStore.getString(ROUTINE_KEY);
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
      webKVStore.remove(PUSHUPS_LEGACY);
      return;
    }
    state = { ...state, pushupsByDate: { ...legacy } };
    // Throw on write failure so runAll() does not mark this migration as done
    // (mirrors the legacy `localStorage.setItem` semantics that surfaced
    // QuotaExceededError to the caller).
    const stateWrite = safeJsonSet(ROUTINE_KEY, state);
    if (!stateWrite.ok) {
      throw stateWrite.error ?? new Error(stateWrite.reason ?? "write");
    }
    webKVStore.remove(PUSHUPS_LEGACY);
  },
});
