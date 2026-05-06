import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Postgres schema for `coach_memory` table.
 *
 * Coach AI memory store, single row per user. Створено у міграції
 * `045_coach_memory_table.sql` як заміна для row-у `module_data` з
 * `module='coach'` (Stage 7 cleanup precondition: щоб drop-нути
 * `module_data` column, треба було відлучити останнього read-and-write
 * консьюмера).
 *
 * Schema highlights:
 * - PK = `user_id` (не `serial`-ний `id`) — завжди одна пам'ять на юзера.
 * - `data` (JSONB, NOT NULL DEFAULT '{}') — структура у
 *   `apps/server/src/modules/chat/coach.ts` (`weeklyDigests[]`,
 *   `lastInsightDate`, `lastInsightText`).
 * - `version` — оптимістичний counter, інкрементується на `saveMemory`-у.
 * - `client_updated_at` / `server_updated_at` — NOT NULL DEFAULT NOW()
 *   (відрізняється від nullable-полів у `module_data`).
 * - FK `user_id → "user".id ON DELETE CASCADE` оголошений у міграції
 *   (drizzle-orm 1.x не expose-ить FK у `pgTable()` builder без зайвих
 *   обходів).
 */
export const coachMemory = pgTable("coach_memory", {
  userId: text("user_id").primaryKey(),
  data: jsonb().notNull().default({}),
  version: integer().notNull().default(1),
  clientUpdatedAt: timestamp("client_updated_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
  serverUpdatedAt: timestamp("server_updated_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
});
