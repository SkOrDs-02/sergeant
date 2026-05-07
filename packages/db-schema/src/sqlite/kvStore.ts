import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * SQLite schema for the per-device `kv_store` table.
 *
 * Stage 9 / PR #060 of `docs/planning/storage-roadmap.md`. Hosts the
 * SQLite-backed replacement for the LocalStorage-backed `webKVStore`
 * primitive that today serves typedStore (`hub_flags_v1`, hidden-account
 * blobs, etc.) on web, and the `react-native-mmkv`-backed mobile
 * counterpart. Schema-only — no consumers swap onto this table until
 * PR #061 (`createSqliteKVStore` + warm-cache), PR #062 (bootstrap +
 * one-time LS→`kv_store` migration), and PR #063 (`webKVStore` impl
 * swap) land.
 *
 * Why purely client-local: the contents are per-device key-value (UI
 * prefs, last-seen timestamps, expandable feature flags, …). For
 * cross-device prefs we rely on the normalized module tables
 * (`nutrition_prefs`, `finyk_prefs`); `kv_store` deliberately does NOT
 * round-trip through op-log push/pull, so there is no Postgres
 * counterpart in `apps/server/src/migrations/`.
 *
 * Differences from the routine/fizruk/nutrition/finyk pattern:
 *   - `updated_at` is INTEGER (Unix epoch milliseconds via Drizzle's
 *     `mode: "timestamp_ms"`) rather than TEXT ISO-8601. The warm-cache
 *     in PR #061 needs a sortable numeric timestamp for cache-eviction
 *     heuristics, and LWW comparisons happen entirely client-local —
 *     there is no server apply-path that needs offset-aware ISO-8601
 *     byte alignment.
 *   - No `_lite`-suffixed indexes: the table is not mirrored
 *     server-side, so there is no name-collision risk against PG
 *     migrations. The PRIMARY KEY on `key` is the only access path the
 *     warm-cache uses (full-table scan once at boot, point lookups
 *     thereafter).
 */
export const kvStore = sqliteTable("kv_store", {
  key: text().primaryKey(),
  value: text().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
