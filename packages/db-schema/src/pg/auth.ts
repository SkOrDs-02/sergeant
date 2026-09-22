import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Postgres schema for Better Auth tables.
 *
 * Mirrors `apps/server/src/migrations/003_baseline_schema.sql` exactly:
 * column names are camelCase (quoted in SQL), and the table names
 * (`user`, `session`, `account`, `verification`) match the singular
 * defaults Better Auth uses for `model` lookups.
 *
 * Кepting these here lets `@better-auth/drizzle-adapter` resolve the
 * tables via `db._.fullSchema[model]` without us having to plumb a
 * separate schema object through `apps/server/src/auth.ts`.
 *
 * IMPORTANT: do not reorder or rename without coordinating with
 * Better Auth — it queries by `model === "user" | "session" | ...`
 * and field name (e.g. `userId`, `expiresAt`) as a direct key into
 * the table object.
 */

export const user = pgTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  /**
   * Мітка прохання видалити акаунт (ADR-0016 § ADR-6.1, міграція 145).
   * `NULL` = акаунт активний; заповнена — акаунт у 30-денному вікні, і
   * `modules/me/deletionPoller.ts` добиває його після
   * `ACCOUNT_DELETION_GRACE_DAYS`.
   *
   * Імʼя колонки задане ЯВНО і в snake_case, на відміну від сусідів: решта
   * полів цієї таблиці — quoted camelCase із baseline-міграції 003
   * (легасі-стиль Better Auth), а 145 писала вже в загальному для репо
   * snake_case. Не «вирівнюй» це під сусідів — розійдеться з реальною
   * колонкою.
   *
   * Поле оголошене тут не тому, що ним користується drizzle: увесь код
   * ходить до нього сирим SQL (`dataRights.ts`, `deletionPoller.ts`). Воно
   * потрібне, щоб гейт `pnpm --filter @sergeant/db-schema test` →
   * `drift.test.ts` бачив паритет схеми з міграціями. Колонка НАША, не
   * Better-Auth-ова, тож whitelist у `scripts/check-schema-drift.mjs`
   * (де лежать легасі-розбіжності auth) тут був би приховуванням.
   */
  deletionRequestedAt: timestamp("deletion_requested_at", {
    withTimezone: true,
  }),
});

export const session = pgTable("session", {
  id: text().primaryKey(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  token: text().notNull().unique(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  ipAddress: text(),
  userAgent: text(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text().primaryKey(),
  accountId: text().notNull(),
  providerId: text().notNull(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: timestamp({ withTimezone: true }),
  refreshTokenExpiresAt: timestamp({ withTimezone: true }),
  scope: text(),
  password: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: timestamp({ withTimezone: true }).defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).defaultNow(),
});
