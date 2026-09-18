/**
 * Drizzle ORM instance wired to the existing pg pool.
 *
 * This is additive — the raw `query()` function from `db.ts` stays untouched.
 * Drizzle sits alongside it and shares the same connection pool, so there is
 * zero overhead from maintaining two query paths during the migration period.
 *
 * Usage:
 *   import { db } from "./drizzle.js";
 *   import { waitlistEntries } from "@sergeant/db-schema/pg";
 *   const rows = await db.select().from(waitlistEntries);
 */
import { drizzle } from "drizzle-orm/node-postgres";
import pool from "./db.js";
import * as pgSchema from "@sergeant/db-schema/pg";

export const db = drizzle(pool, { schema: pgSchema });
