/**
 * @sergeant/db-schema — cross-platform Drizzle schema source of truth.
 *
 * Re-exports dialect-specific schemas and shared constants. Consumers should
 * import from the dialect sub-path they need:
 *
 *   import { waitlistEntries } from "@sergeant/db-schema/pg";
 *   import { waitlistEntries } from "@sergeant/db-schema/sqlite";
 *   import { WAITLIST_TIERS } from "@sergeant/db-schema/shared";
 */
export * as pg from "./pg/index.js";
export * as sqlite from "./sqlite/index.js";
export * from "./shared/index.js";
