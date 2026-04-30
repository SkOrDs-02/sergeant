import type { Request, Response } from "express";
import {
  BarcodeLookupSuccessSchema,
  type BarcodeProduct,
} from "@sergeant/shared/schemas";
import { recordExternalHttp } from "../../lib/externalHttp.js";
import { elapsedMs } from "../../lib/timing.js";
import { BarcodeQuerySchema } from "../../http/schemas.js";
import { validateQuery } from "../../http/validate.js";
import { barcodeLookupsTotal } from "../../obs/metrics.js";
import {
  normalizeOFFBarcode,
  normalizeUPCitemdb,
  normalizeUSDABarcode,
  type OFFProduct,
  type UPCitemdbResponse,
  type USDAFood,
} from "../../lib/normalizers/index.js";

// SSOT for the barcode response shape lives in `@sergeant/shared/schemas`
// (AGENTS.md Hard Rule #3). The server derives its internal type via
// `z.infer<>` and asserts the outgoing payload against the schema before
// `res.json()` so drift from the api-client types becomes a test failure.
type NormalizedProduct = BarcodeProduct;

// ──────────────────────────────────────────────────────────────────────────────
// In-memory TTL cache for cascade results.
//
// Key: normalized barcode (digits only, 8–14). Value: either a found product
// or a "miss" sentinel (so 404-у не доводиться знов проганяти cascade на
// 3 upstream-и для популярних, але не існуючих штрихкодів).
//
// TTL-и розділено: hit живе довше (продукт майже не змінюється — 6 годин
// дефолт), miss — коротше (30 хв), бо upstream-и регулярно поповнюють бази.
//
// Bounded size: коли заповнено, evict-имо найстаріший вставлений ключ
// (Map зберігає insertion order — це FIFO, не справжній LRU, але для barcode
// lookup-у з 99% read-через-write патерном різниця не суттєва і простіше).
//
// Усі TTL/розмір env-overridable; `__barcodeTestHooks()` дозволяє юніт-тестам
// скидати стан і темпорально override-ити TTL для cache-expiry-сценаріїв.
// ──────────────────────────────────────────────────────────────────────────────

interface BarcodeCacheConfig {
  hitTtlMs: number;
  missTtlMs: number;
  maxSize: number;
}

interface BarcodeCacheEntry {
  product: NormalizedProduct | null; // null = "miss" sentinel
  expiresAt: number; // monotonic ms (Date.now())
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const DEFAULT_HIT_TTL_MS = 6 * 60 * 60 * 1000; // 6 годин
const DEFAULT_MISS_TTL_MS = 30 * 60 * 1000; // 30 хвилин
const DEFAULT_MAX_SIZE = 1000;

const cacheConfig: BarcodeCacheConfig = {
  hitTtlMs: readPositiveIntEnv("BARCODE_CACHE_HIT_TTL_MS", DEFAULT_HIT_TTL_MS),
  missTtlMs: readPositiveIntEnv(
    "BARCODE_CACHE_MISS_TTL_MS",
    DEFAULT_MISS_TTL_MS,
  ),
  maxSize: readPositiveIntEnv("BARCODE_CACHE_MAX_SIZE", DEFAULT_MAX_SIZE),
};

const cache = new Map<string, BarcodeCacheEntry>();

function cacheGet(key: string): BarcodeCacheEntry | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry;
}

function cacheSet(key: string, product: NormalizedProduct | null): void {
  const ttlMs = product ? cacheConfig.hitTtlMs : cacheConfig.missTtlMs;
  // Refresh insertion order if updating an existing entry.
  if (cache.has(key)) cache.delete(key);
  cache.set(key, { product, expiresAt: Date.now() + ttlMs });
  while (cache.size > cacheConfig.maxSize) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export interface BarcodeTestHooks {
  configure(overrides: Partial<BarcodeCacheConfig>): void;
  reset(): void;
  cacheSize(): number;
  config(): Readonly<BarcodeCacheConfig>;
}

/**
 * Test-only hooks. Не використовуй у прод-коді.
 */
export function __barcodeTestHooks(): BarcodeTestHooks {
  return {
    configure(overrides) {
      if (overrides.hitTtlMs != null) cacheConfig.hitTtlMs = overrides.hitTtlMs;
      if (overrides.missTtlMs != null)
        cacheConfig.missTtlMs = overrides.missTtlMs;
      if (overrides.maxSize != null) cacheConfig.maxSize = overrides.maxSize;
    },
    reset() {
      cache.clear();
      cacheConfig.hitTtlMs = readPositiveIntEnv(
        "BARCODE_CACHE_HIT_TTL_MS",
        DEFAULT_HIT_TTL_MS,
      );
      cacheConfig.missTtlMs = readPositiveIntEnv(
        "BARCODE_CACHE_MISS_TTL_MS",
        DEFAULT_MISS_TTL_MS,
      );
      cacheConfig.maxSize = readPositiveIntEnv(
        "BARCODE_CACHE_MAX_SIZE",
        DEFAULT_MAX_SIZE,
      );
    },
    cacheSize: () => cache.size,
    config: () => ({ ...cacheConfig }),
  };
}

// Raw upstream types imported from ../lib/normalizers/index.js

function hasErrorName(e: unknown, name: string): boolean {
  return !!e && typeof e === "object" && (e as { name?: string }).name === name;
}

function isTransientHttpStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function transientHttpError(source: string, status: number): Error {
  const error = new Error(`${source} upstream HTTP ${status}`);
  error.name = "TransientUpstreamHttpError";
  return error;
}

function nonOkOutcome(status: number): "miss" | "rate_limited" | "error" {
  if (status === 429) return "rate_limited";
  if (status >= 500) return "error";
  return "miss";
}

/**
 * Record-helper одночасно емітить і domain-specific метрику
 * `barcode_lookups_total{source,outcome}` (читають існуючі дашборди), і
 * уніфіковану `external_http_requests_total{upstream=source,outcome}`.
 * Свідоме дублювання — знести domain-метрику лише після оновлення дашбордів.
 */
function recordLookup(source: string, outcome: string, ms: number): void {
  try {
    barcodeLookupsTotal.inc({ source, outcome });
  } catch {
    /* ignore */
  }
  recordExternalHttp(source, outcome, ms);
}

// ──────────────────────────────────────────────────────────────────────────────
// Source 1: Open Food Facts (no key, 100 req/min, global crowdsourced DB)
// ──────────────────────────────────────────────────────────────────────────────
const OFF_BASE = "https://world.openfoodfacts.org/api/v2/product";
const OFF_FIELDS =
  "product_name,product_name_uk,brands,nutriments,serving_size,serving_quantity";

function normalizeOFF(
  product: OFFProduct | null | undefined,
): NormalizedProduct | null {
  return normalizeOFFBarcode(product);
}

async function lookupOFF(barcode: string): Promise<NormalizedProduct | null> {
  const url = `${OFF_BASE}/${barcode}.json?fields=${OFF_FIELDS}`;
  const start = process.hrtime.bigint();
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent":
          "Sergeant-NutritionApp/1.0 (https://sergeant.2dmanager.com.ua)",
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!r.ok) {
      recordLookup("off", nonOkOutcome(r.status), elapsedMs(start));
      if (isTransientHttpStatus(r.status)) {
        throw transientHttpError("off", r.status);
      }
      return null;
    }
    const data = (await r.json()) as { status?: number; product?: OFFProduct };
    if (data?.status !== 1 || !data?.product) {
      recordLookup("off", "miss", elapsedMs(start));
      return null;
    }
    const product = normalizeOFF(data.product);
    recordLookup("off", product ? "hit" : "miss", elapsedMs(start));
    return product;
  } catch (e: unknown) {
    if (hasErrorName(e, "TransientUpstreamHttpError")) throw e;
    recordLookup(
      "off",
      hasErrorName(e, "TimeoutError") ? "timeout" : "error",
      elapsedMs(start),
    );
    throw e;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Source 2: USDA FoodData Central (Branded Foods with GTIN/UPC search)
// Free API key from https://api.data.gov/signup — set USDA_FDC_API_KEY env var.
// Falls back to DEMO_KEY (40 req/hr shared limit) if key is not set.
// ──────────────────────────────────────────────────────────────────────────────
const FDC_BASE = "https://api.nal.usda.gov/fdc/v1";

function normalizeUSDA(
  food: USDAFood | null | undefined,
): NormalizedProduct | null {
  return normalizeUSDABarcode(food);
}

async function lookupUSDA(barcode: string): Promise<NormalizedProduct | null> {
  const key = process.env.USDA_FDC_API_KEY || "DEMO_KEY";
  // Search Branded Foods by GTIN/UPC (barcode is stored in gtinUpc field)
  const url = `${FDC_BASE}/foods/search?query=${encodeURIComponent(barcode)}&dataType=Branded&pageSize=5&api_key=${key}`;
  const start = process.hrtime.bigint();
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Sergeant-NutritionApp/1.0" },
      signal: AbortSignal.timeout(7000),
    });
    if (!r.ok) {
      recordLookup("usda", nonOkOutcome(r.status), elapsedMs(start));
      if (isTransientHttpStatus(r.status)) {
        throw transientHttpError("usda", r.status);
      }
      return null;
    }
    const data = (await r.json()) as { foods?: USDAFood[] };
    const foods = data?.foods;
    if (!Array.isArray(foods) || foods.length === 0) {
      recordLookup("usda", "miss", elapsedMs(start));
      return null;
    }

    // Prefer exact gtinUpc match, fallback to first result
    const exact = foods.find(
      (f) =>
        String(f.gtinUpc || "").replace(/^0+/, "") ===
        barcode.replace(/^0+/, ""),
    );
    const food = exact || foods[0];
    const product = normalizeUSDA(food);
    recordLookup("usda", product ? "hit" : "miss", elapsedMs(start));
    return product;
  } catch (e: unknown) {
    if (hasErrorName(e, "TransientUpstreamHttpError")) throw e;
    recordLookup(
      "usda",
      hasErrorName(e, "TimeoutError") ? "timeout" : "error",
      elapsedMs(start),
    );
    throw e;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Source 3: UPCitemdb (no key, 100 req/day, 694M+ barcodes)
// Returns product name/brand but rarely has nutrition data for food items.
// We mark partial: true so the frontend can prompt the user to fill in macros.
// ──────────────────────────────────────────────────────────────────────────────
async function lookupUPCitemdb(
  barcode: string,
): Promise<NormalizedProduct | null> {
  const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`;
  const start = process.hrtime.bigint();
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Sergeant-NutritionApp/1.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) {
      recordLookup("upcitemdb", nonOkOutcome(r.status), elapsedMs(start));
      if (isTransientHttpStatus(r.status)) {
        throw transientHttpError("upcitemdb", r.status);
      }
      return null;
    }
    const data = (await r.json()) as UPCitemdbResponse;
    const product = normalizeUPCitemdb(data);
    if (!product) {
      recordLookup("upcitemdb", "miss", elapsedMs(start));
      return null;
    }

    recordLookup("upcitemdb", "hit", elapsedMs(start));
    return product;
  } catch (e: unknown) {
    if (hasErrorName(e, "TransientUpstreamHttpError")) throw e;
    recordLookup(
      "upcitemdb",
      hasErrorName(e, "TimeoutError") ? "timeout" : "error",
      elapsedMs(start),
    );
    throw e;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Handler
// ──────────────────────────────────────────────────────────────────────────────
/**
 * GET /api/barcode?barcode=... — каскадний lookup через OFF → USDA → UPCitemdb.
 * Middleware-и роутера (`setModule`, `rateLimitExpress`) забезпечують
 * module-tag і rate-limit; тут лише бізнес-логіка.
 */
export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = validateQuery(BarcodeQuerySchema, req, res);
  if (!parsed.ok) return;
  const barcode = parsed.data.barcode.replace(/\D/g, "");
  if (!/^\d{8,14}$/.test(barcode)) {
    res.status(400).json({ error: "Невірний штрихкод (8–14 цифр)" });
    return;
  }

  // Cache hit short-circuits the cascade entirely. Miss-sentinel returns the
  // same 404 без чергового round-trip-у на upstream-и.
  const cached = cacheGet(barcode);
  if (cached) {
    if (cached.product) {
      res
        .status(200)
        .json(BarcodeLookupSuccessSchema.parse({ product: cached.product }));
    } else {
      res.status(404).json({ error: "Продукт не знайдено" });
    }
    return;
  }

  try {
    // Cascade: OFF → USDA → UPCitemdb
    let product: NormalizedProduct | null = null;
    let upstreamThrew = false;

    try {
      product = await lookupOFF(barcode);
    } catch {
      upstreamThrew = true;
    }
    if (!product) {
      try {
        product = await lookupUSDA(barcode);
      } catch {
        upstreamThrew = true;
      }
    }
    if (!product) {
      try {
        product = await lookupUPCitemdb(barcode);
      } catch {
        upstreamThrew = true;
      }
    }

    if (!product) {
      // Кешуємо miss тільки якщо жоден upstream НЕ кинув: інакше це не
      // справжній miss, а transient failure — повторний запит має пройти
      // cascade знову.
      if (!upstreamThrew) cacheSet(barcode, null);
      res.status(404).json({ error: "Продукт не знайдено" });
      return;
    }

    cacheSet(barcode, product);
    res.status(200).json(BarcodeLookupSuccessSchema.parse({ product }));
  } catch (e: unknown) {
    if (hasErrorName(e, "TimeoutError") || hasErrorName(e, "AbortError")) {
      res
        .status(504)
        .json({ error: "Сервіс недоступний (таймаут). Спробуй пізніше." });
      return;
    }
    const message = e instanceof Error ? e.message : "Server error";
    res.status(500).json({ error: message });
  }
}
