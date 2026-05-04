import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { BetterAuthOptions } from "better-auth";
import type {
  DBAdapter,
  DBAdapterInstance,
} from "@better-auth/core/db/adapter";
import { db } from "../drizzle.js";
import {
  decryptString,
  encryptString,
  isEncrypted,
  readKeyVersion,
} from "./tokenCrypto.js";
import type { KeyRing } from "../lib/keyRing.js";
import { logger } from "../obs/logger.js";
import { authTokenLazyReencryptTotal } from "../obs/metrics.js";

/**
 * Wraps the built-in Better Auth Drizzle adapter so that the OAuth token
 * fields on the `account` model are stored encrypted at rest. Plaintext
 * `accessToken` / `refreshToken` / `idToken` columns are the C1 issue from
 * the security review (`migrations/003_baseline_schema.sql:30-34`).
 *
 * Strategy:
 *   - on `create` / `update` / `updateMany` for `model === "account"`, any
 *     of the three token fields present in the payload are passed through
 *     `encryptString` before reaching the database.
 *   - on `findOne` / `findMany`, results from the same model are walked
 *     once and any value with the `enc:v1:` prefix is decrypted in-place
 *     so Better Auth's refresh path keeps seeing plaintext.
 *   - everything else (count/delete/transaction/createSchema/...) is
 *     forwarded verbatim — there is nothing user-facing to transform.
 *
 * Schema is unchanged: tokens stay in the same `TEXT` columns and rows
 * written before this code shipped continue to deserialize correctly
 * (decrypt is a no-op when the prefix is absent). The natural rollover
 * happens on the next OAuth refresh — those code paths go through
 * `update`, which encrypts.
 *
 * Failure mode: encryption errors throw and surface as a 5xx (Better Auth
 * already wraps adapter errors). A decryption failure on a row that DOES
 * carry the `enc:v1:` prefix also throws — that means the on-disk data was
 * tampered with or the key rotated incorrectly, and silently returning a
 * useless string would be worse than failing loudly.
 */
const ACCOUNT_MODEL = "account" as const;
const TOKEN_FIELDS = ["accessToken", "refreshToken", "idToken"] as const;

type TokenField = (typeof TOKEN_FIELDS)[number];

function encryptTokenFields(
  data: Record<string, unknown>,
  ring: KeyRing,
): Record<string, unknown> {
  let cloned: Record<string, unknown> | null = null;
  for (const field of TOKEN_FIELDS) {
    if (!(field in data)) continue;
    const value = data[field];
    if (typeof value !== "string" || value.length === 0) continue;
    if (isEncrypted(value)) continue;
    if (!cloned) cloned = { ...data };
    cloned[field] = encryptString(value, ring);
  }
  return cloned ?? data;
}

function decryptTokenFields<T>(row: T, ring: KeyRing): T {
  if (!row || typeof row !== "object") return row;
  const obj = row as Record<string, unknown>;
  let cloned: Record<string, unknown> | null = null;
  for (const field of TOKEN_FIELDS) {
    const value = obj[field];
    if (typeof value !== "string" || value.length === 0) continue;
    if (!isEncrypted(value)) continue;
    if (!cloned) cloned = { ...obj };
    try {
      cloned[field] = decryptString(value, ring);
      // H4: warn-log stale key versions so ops can confirm rotation progress
      // before retiring the old key. Better Auth refreshes OAuth tokens via
      // `update`, which rewrites under `ring.current.version` — so the next
      // refresh after rotation naturally re-encrypts. No DB touch here.
      try {
        const rowVersion = readKeyVersion(value);
        if (rowVersion !== null && rowVersion !== ring.current.version) {
          logger.warn({
            event: "auth.token.stale_key_version",
            field,
            row_version: rowVersion,
            current_version: ring.current.version,
          });
          authTokenLazyReencryptTotal.inc({
            field,
            row_version: String(rowVersion),
          });
        }
      } catch {
        // readKeyVersion can throw on malformed prefix; ignore — decrypt above already succeeded
      }
    } catch (err) {
      logger.error({
        msg: "auth_token_decrypt_failed",
        field,
        err: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
  return (cloned ?? obj) as T;
}

/**
 * Build a Better Auth `DBAdapterInstance` (factory) that encrypts OAuth
 * token columns at rest. Hands off all heavy lifting to the upstream
 * Drizzle adapter — the wrapper only intercepts the four methods that
 * touch `account` rows.
 *
 * Schema lookup:
 *   The Drizzle instance imported from `../drizzle.js` is constructed
 *   with `{ schema: pgSchema }`, so `db._.fullSchema` already exposes
 *   `user` / `session` / `account` / `verification` table objects. The
 *   adapter walks those by `model` name — no extra wiring needed.
 */
export function createEncryptingAdapter(ring: KeyRing): DBAdapterInstance {
  const inner = drizzleAdapter(db, { provider: "pg" });

  return (options: BetterAuthOptions): DBAdapter => {
    const base = inner(options);

    const wrapped: DBAdapter = {
      ...base,
      id: base.id,
      async create<T extends Record<string, unknown>, R = T>(args: {
        model: string;
        data: Omit<T, "id">;
        select?: string[];
        forceAllowId?: boolean;
      }): Promise<R> {
        const transformed =
          args.model === ACCOUNT_MODEL
            ? (encryptTokenFields(
                args.data as Record<string, unknown>,
                ring,
              ) as Omit<T, "id">)
            : args.data;
        const result = await base.create<T, R>({ ...args, data: transformed });
        return args.model === ACCOUNT_MODEL
          ? decryptTokenFields(result, ring)
          : result;
      },
      async findOne<T>(
        args: Parameters<DBAdapter["findOne"]>[0],
      ): Promise<T | null> {
        const result = await base.findOne<T>(args);
        if (result === null || args.model !== ACCOUNT_MODEL) return result;
        return decryptTokenFields(result, ring);
      },
      async findMany<T>(
        args: Parameters<DBAdapter["findMany"]>[0],
      ): Promise<T[]> {
        const result = await base.findMany<T>(args);
        if (args.model !== ACCOUNT_MODEL) return result;
        return result.map((row) => decryptTokenFields(row, ring));
      },
      async update<T>(
        args: Parameters<DBAdapter["update"]>[0],
      ): Promise<T | null> {
        const transformed =
          args.model === ACCOUNT_MODEL
            ? encryptTokenFields(args.update as Record<string, unknown>, ring)
            : args.update;
        const result = await base.update<T>({
          ...args,
          update: transformed,
        });
        if (result === null || args.model !== ACCOUNT_MODEL) return result;
        return decryptTokenFields(result, ring);
      },
      async updateMany(
        args: Parameters<DBAdapter["updateMany"]>[0],
      ): Promise<number> {
        const transformed =
          args.model === ACCOUNT_MODEL
            ? encryptTokenFields(args.update as Record<string, unknown>, ring)
            : args.update;
        return base.updateMany({ ...args, update: transformed });
      },
    };
    return wrapped;
  };
}

// re-exported for tests
export const __test__ = {
  ACCOUNT_MODEL,
  TOKEN_FIELDS: TOKEN_FIELDS as readonly TokenField[],
  encryptTokenFields,
  decryptTokenFields,
};
