import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Postgres schema for `user_profile` table.
 * Mirrors migration 115_user_profile.sql.
 *
 * Pre-beta schema-debt audit 2026-08-04 — minimal server-side
 * write-through store for the profile blob historically kept
 * client-only (`packages/shared/src/sync/modules.ts` →
 * `SYNC_MODULES.profile`: `USER_PROFILE` + `HUB_BIOMETRICS`
 * local-storage keys on web/mobile). One row per user, single JSONB
 * payload, LWW by `updated_at` — same shape as `routinePrefs` /
 * `nutritionPrefs` / `fizrukMonthlyPlan` singleton blobs.
 *
 * NOT an oplog-sync table (no `sync_op_log` involvement): the profile
 * blob is small and has no cross-module query benefit, so a plain
 * write-through upsert is sufficient. Endpoint wiring (GET/PUT +
 * web/mobile dual-write) is Stage 2/Stage 4 — this file only tracks the
 * schema shape.
 */
export const userProfile = pgTable("user_profile", {
  userId: text("user_id").primaryKey(),
  payload: jsonb().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
