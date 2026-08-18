import { z } from "zod";
import { env } from "../../env/env.js";
import { query as defaultQuery } from "../../db.js";
import { logger } from "../../obs/logger.js";
import { callMcpTool, type McpResult } from "./mcpClient.js";
import { callWithFreshAccessToken, type QueryFn } from "./tokenStore.js";

/**
 * Silpo as the FOURTH source in the food-search / barcode cascades (spec
 * `docs/90-work/planning/specs/silpo-mcp-integration.md` § Рішення дизайну,
 * "Продуктові дані — четверте джерело каскаду"). Narrowed per spec §0's open
 * question ("Відкрите питання авторизаційного контексту"): there is no
 * service-level Silpo credential, only per-user OAuth tokens obtained via
 * `/api/silpo/connect`. Proxying product lookups through one user's token on
 * behalf of a DIFFERENT (unconnected) user would be legally dubious (offer/
 * ToS gate) and technically fragile, so this source activates ONLY for the
 * requesting user's OWN linked account — never as a shared/service fallback.
 *
 * `apps/server/src/routes/food-search.ts` and `apps/server/src/routes/
 * barcode.ts` are SESSION-LESS endpoints (open to anonymous callers,
 * PERF-007 typeahead). This module never requires a session — callers pass
 * whatever `userId` they resolved best-effort (or `null`/`undefined`), and
 * every entry point degrades to "contribute nothing" when there's no user,
 * no connection, `SILPO_ENABLED=false`, or any MCP-layer failure. Silpo is a
 * bonus source, never an authoritative one — its failure must NEVER surface
 * as a cascade-level error (unlike OFF/USDA/UPCitemdb `upstreamThrew`).
 *
 * PROVISIONAL (spike §0 not run yet, same caveat as `receipts.ts` /
 * `mcpClient.ts`): tool names (`silpo_find_products_batch`,
 * `silpo_get_product_details`) and field names below are best guesses.
 * Every raw schema is `.passthrough()`; a product that doesn't parse is
 * DROPPED with a `logger.warn` (search: per-element; barcode: the single
 * result), mirroring `receipts.ts`'s per-order parsing. If the spike shows
 * no KBJU fields exist at all, every product still normalizes fine — macro
 * fields are optional/nullable throughout and a search hit with zero macros
 * is simply filtered out (see `toSearchProduct`), matching the OFF/USDA
 * search normalizers' existing `hasSomeMacro` convention.
 *
 * Metrics: `callMcpTool` → `mcpRpcCall` already calls
 * `recordExternalHttp("silpo", outcome, ms)` for every real HTTP attempt
 * (`apps/server/src/modules/silpo/mcpClient.ts`). Do NOT call
 * `recordExternalHttp` again here — that would double-count the same
 * `upstream="silpo"` series. The cheap DB guard below (`hasSilpoConnection`)
 * intentionally makes ZERO external calls for the common case (no
 * connection), so no external-http metric is expected there either.
 */

// ─────────────────────────── Cheap connection guard ─────────────────────────

/**
 * `SELECT 1 … LIMIT 1` — no decrypt, no MCP round-trip. Runs on every
 * food-search/barcode request from a user with `userId` set, so it MUST stay
 * cheap: food-search alone allows 40 req/min per caller (PERF-007). The full
 * `callWithFreshAccessToken` path (decrypt + `initialize` + `tools/call`)
 * only runs once this guard confirms a `connected` row exists.
 */
export async function hasSilpoConnection(
  userId: string,
  queryFn: QueryFn = defaultQuery,
): Promise<boolean> {
  const { rows } = await queryFn(
    `SELECT 1 FROM silpo_connection WHERE user_id = $1 AND status = 'connected' LIMIT 1`,
    [userId],
    { op: "silpo_food_source_connection_probe" },
  );
  return rows.length > 0;
}

/**
 * Combines the `SILPO_ENABLED` kill switch + "has a user at all" + the cheap
 * connection guard. Exported so route handlers can make a SINGLE guard call
 * to decide both "should I fan the Silpo source into the cascade" and
 * "should this specific response skip the shared public cache" (a
 * Silpo-augmented response is per-user and must never be served from a
 * CDN/browser cache to a different, unconnected caller).
 */
export async function isSilpoConnectedUser(
  userId: string | null | undefined,
  deps: { query?: QueryFn } = {},
): Promise<boolean> {
  if (!env.SILPO_ENABLED || !userId) return false;
  try {
    return await hasSilpoConnection(userId, deps.query ?? defaultQuery);
  } catch (err) {
    logger.warn({
      msg: "silpo_food_source_connection_probe_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// ─────────────────────────── Provisional raw shapes ─────────────────────────

const RawProductSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    sku: z.union([z.string(), z.number()]).optional(),
    name: z.string().optional(),
    title: z.string().optional(),
    brand: z.string().optional(),
    brandName: z.string().optional(),
    barcode: z.string().optional(),
    ean: z.string().optional(),
    gtin: z.string().optional(),
    kcal100g: z.number().optional(),
    kcalPer100g: z.number().optional(),
    energyKcal100g: z.number().optional(),
    calories100g: z.number().optional(),
    protein100g: z.number().optional(),
    proteins100g: z.number().optional(),
    fat100g: z.number().optional(),
    fats100g: z.number().optional(),
    carbs100g: z.number().optional(),
    carbohydrates100g: z.number().optional(),
    weight: z.number().optional(),
    weightUnit: z.string().optional(),
    unit: z.string().optional(),
  })
  .passthrough();
type RawProduct = z.infer<typeof RawProductSchema>;

function firstDefined<T>(
  ...values: Array<T | undefined | null>
): T | undefined {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

/**
 * Envelope shape is unverified (spike §0), so `callMcpTool` is handed
 * `z.unknown()` and this module extracts + validates per element itself —
 * same rationale as `receipts.ts`'s `RawOrdersEnvelopeSchema` comment: a
 * schema-level failure on ONE malformed product must not fail the whole
 * `tools/call` result as `schema_drift`.
 */
function extractRawProductArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["products", "results", "items"]) {
      const v = obj[key];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

function extractRawProduct(payload: unknown): unknown {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const obj = payload as Record<string, unknown>;
    for (const key of ["product", "item", "data"]) {
      const v = obj[key];
      if (v && typeof v === "object") return v;
    }
  }
  return payload;
}

// ─────────────────────────── Normalization (provisional) ────────────────────

interface NormalizedSilpoProduct {
  name: string;
  brand: string | null;
  barcode: string | null;
  kcal_100g: number | null;
  protein_100g: number | null;
  fat_100g: number | null;
  carbs_100g: number | null;
  servingGrams: number | null;
  servingUnit: string | null;
  hasMacro: boolean;
}

function normalizeRawProduct(raw: RawProduct): NormalizedSilpoProduct | null {
  const name = firstDefined(raw.name, raw.title);
  if (!name) return null;

  const kcal = firstDefined(
    raw.kcal100g,
    raw.kcalPer100g,
    raw.energyKcal100g,
    raw.calories100g,
  );
  const protein = firstDefined(raw.protein100g, raw.proteins100g);
  const fat = firstDefined(raw.fat100g, raw.fats100g);
  const carbs = firstDefined(raw.carbs100g, raw.carbohydrates100g);

  return {
    name,
    brand: firstDefined(raw.brand, raw.brandName) ?? null,
    barcode: firstDefined(raw.barcode, raw.ean, raw.gtin) ?? null,
    kcal_100g: kcal ?? null,
    protein_100g: protein ?? null,
    fat_100g: fat ?? null,
    carbs_100g: carbs ?? null,
    servingGrams: raw.weight ?? null,
    servingUnit: firstDefined(raw.weightUnit, raw.unit) ?? null,
    hasMacro:
      kcal !== undefined ||
      protein !== undefined ||
      fat !== undefined ||
      carbs !== undefined,
  };
}

/** Same deterministic-hash algorithm as `modules/nutrition/food-search.ts::stableId` — reimplemented locally to avoid a `silpo → nutrition` module dependency (nutrition already depends on `silpo`, not the other way around). */
function stableSilpoId(parts: Array<string | null | undefined>): string {
  const canonical = parts
    .map((p) => (p ? String(p).trim().toLowerCase() : ""))
    .join("|");
  let hash = 0;
  for (let i = 0; i < canonical.length; i++) {
    hash = ((hash << 5) - hash + canonical.charCodeAt(i)) | 0;
  }
  return `silpo_${(hash >>> 0).toString(36)}`;
}

// ─────────────────────────── Cascade output shapes ───────────────────────────

/** Structurally matches `FoodSearchProduct` (`@sergeant/shared/schemas`) once `"silpo"` is a valid `source` literal there. */
export interface SilpoSearchProduct {
  id: string;
  name: string;
  brand: string | null;
  source: "silpo";
  per100: {
    kcal: number;
    protein_g: number;
    fat_g: number;
    carbs_g: number;
  };
  defaultGrams: number;
}

/** Structurally matches `BarcodeProduct` (`@sergeant/shared/schemas`) once `"silpo"` is a valid `source` literal there. */
export interface SilpoBarcodeProduct {
  name: string;
  brand: string | null;
  kcal_100g: number | null;
  protein_100g: number | null;
  fat_100g: number | null;
  carbs_100g: number | null;
  servingSize: string | null;
  servingGrams: number | null;
  source: "silpo";
  partial?: true;
}

/**
 * A search hit without ANY macro is dropped, not zero-filled — matches
 * `normalizeOFFSearch`/`normalizeUSDASearch`'s `hasSomeMacro` gate
 * (`apps/server/src/lib/normalizers/{off,usda}.ts`). `FoodSearchProductSchema`
 * has no `partial` escape hatch (unlike barcode), so a macro-less hit here
 * would otherwise lie as "0 kcal".
 */
function toSearchProduct(p: NormalizedSilpoProduct): SilpoSearchProduct | null {
  if (!p.hasMacro) return null;
  return {
    id: p.barcode
      ? `silpo_${p.barcode.replace(/^0+/, "") || "0"}`
      : stableSilpoId([p.name, p.brand]),
    name: p.name,
    brand: p.brand,
    source: "silpo",
    per100: {
      kcal: p.kcal_100g ?? 0,
      protein_g: p.protein_100g ?? 0,
      fat_g: p.fat_100g ?? 0,
      carbs_g: p.carbs_100g ?? 0,
    },
    defaultGrams: p.servingGrams ?? 100,
  };
}

/**
 * Unlike search, a barcode lookup always resolves to at most ONE product —
 * dropping a macro-less hit would just make the cascade re-fall-through to
 * "not found", which is worse than the UPCitemdb `partial: true` convention
 * (`apps/server/src/lib/normalizers/upcitemdb.ts`) this mirrors: return the
 * name/brand we DO have and let the client prompt for macros.
 */
function toBarcodeProduct(p: NormalizedSilpoProduct): SilpoBarcodeProduct {
  const servingSize =
    p.servingGrams != null
      ? `${p.servingGrams}${p.servingUnit ? ` ${p.servingUnit}` : " г"}`
      : null;
  return {
    name: p.name,
    brand: p.brand,
    kcal_100g: p.kcal_100g,
    protein_100g: p.protein_100g,
    fat_100g: p.fat_100g,
    carbs_100g: p.carbs_100g,
    servingSize,
    servingGrams: p.servingGrams,
    source: "silpo",
    ...(p.hasMacro ? {} : { partial: true as const }),
  };
}

// ─────────────────────────────── MCP fetch step ─────────────────────────────

async function fetchSilpoSearch(
  accessToken: string,
  query: string,
): Promise<McpResult<SilpoSearchProduct[]>> {
  const result = await callMcpTool({
    accessToken,
    toolName: "silpo_find_products_batch",
    args: { queries: [query] },
    schema: z.unknown(),
  });
  if (!result.ok) return result;

  const products: SilpoSearchProduct[] = [];
  extractRawProductArray(result.data).forEach((raw, index) => {
    const parsed = RawProductSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn({
        msg: "silpo_food_search_raw_product_unparseable",
        index,
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          code: i.code,
        })),
      });
      return;
    }
    const normalized = normalizeRawProduct(parsed.data);
    const product = normalized ? toSearchProduct(normalized) : null;
    if (product) products.push(product);
  });

  return { ok: true, data: products };
}

async function fetchSilpoBarcode(
  accessToken: string,
  barcode: string,
): Promise<McpResult<SilpoBarcodeProduct | null>> {
  const result = await callMcpTool({
    accessToken,
    toolName: "silpo_get_product_details",
    args: { barcode },
    schema: z.unknown(),
  });
  if (!result.ok) return result;

  const raw = extractRawProduct(result.data);
  if (raw === undefined || raw === null) return { ok: true, data: null };

  const parsed = RawProductSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn({
      msg: "silpo_barcode_raw_product_unparseable",
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        code: i.code,
      })),
    });
    return { ok: true, data: null };
  }

  const normalized = normalizeRawProduct(parsed.data);
  return { ok: true, data: normalized ? toBarcodeProduct(normalized) : null };
}

// ────────────────────────────────── Orchestration ────────────────────────────

/**
 * `GET /api/food-search` — Silpo as the last cascade source, ONLY for a
 * connected `userId`. Never throws: any guard/MCP failure logs a
 * `logger.warn` and resolves to `[]`, exactly like the existing
 * `fetchOFF(...).catch(() => [])` / `fetchUSDA(...).catch(() => [])`
 * fallbacks in `modules/nutrition/food-search.ts`.
 */
export async function searchSilpoProducts(
  userId: string | null | undefined,
  query: string,
  deps: { query?: QueryFn } = {},
): Promise<SilpoSearchProduct[]> {
  try {
    if (!userId) return [];
    if (!(await isSilpoConnectedUser(userId, deps))) return [];

    const call = await callWithFreshAccessToken(
      userId,
      (accessToken) => fetchSilpoSearch(accessToken, query),
      { query: deps.query ?? defaultQuery },
    );
    if (!call.ok) {
      logger.warn({
        msg: "silpo_food_search_source_skipped",
        kind: call.error.kind,
      });
      return [];
    }
    return call.data;
  } catch (err) {
    logger.warn({
      msg: "silpo_food_search_source_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * `GET /api/barcode` — Silpo as the last cascade step (after OFF → USDA →
 * UPCitemdb), ONLY for a connected `userId`. Never throws — `null` covers
 * BOTH "not connected/disabled" and "connected but genuinely not found",
 * which is fine: the caller (`modules/nutrition/barcode.ts`) treats them
 * identically (fall through / 404), and Silpo failures must NEVER flip the
 * cascade's `upstreamThrew` flag (that's reserved for the three
 * authoritative sources — Silpo is a best-effort bonus for connected
 * users only).
 */
export async function lookupSilpoBarcode(
  userId: string | null | undefined,
  barcode: string,
  deps: { query?: QueryFn } = {},
): Promise<SilpoBarcodeProduct | null> {
  try {
    if (!userId) return null;
    if (!(await isSilpoConnectedUser(userId, deps))) return null;

    const call = await callWithFreshAccessToken(
      userId,
      (accessToken) => fetchSilpoBarcode(accessToken, barcode),
      { query: deps.query ?? defaultQuery },
    );
    if (!call.ok) {
      logger.warn({
        msg: "silpo_barcode_source_skipped",
        kind: call.error.kind,
      });
      return null;
    }
    return call.data;
  } catch (err) {
    logger.warn({
      msg: "silpo_barcode_source_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// Re-exported for tests exercising internals without a live MCP call.
export const __test__ = {
  normalizeRawProduct,
  toSearchProduct,
  toBarcodeProduct,
  extractRawProductArray,
  extractRawProduct,
};
