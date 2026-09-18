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
