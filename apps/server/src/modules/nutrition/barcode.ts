import type { Request, Response } from "express";
import {
  BarcodeLookupSuccessSchema,
  type BarcodeProduct,
} from "@sergeant/shared/schemas";
import { env } from "../../env.js";
import { recordExternalHttp } from "../../lib/externalHttp.js";
import { elapsedMs } from "../../lib/timing.js";
import { BarcodeQuerySchema } from "../../http/schemas.js";
import { parseQuery } from "../../http/validate.js";
import { getSessionUser } from "../../auth.js";
import { barcodeLookupsTotal } from "../../obs/metrics.js";
import { logger } from "../../obs/logger.js";
import { lookupInCatalog, upsertIntoCatalog } from "./productCatalog.js";
import {
  normalizeOFFBarcode,
  normalizeUPCitemdb,
  normalizeUSDABarcode,
  type OFFProduct,
  type UPCitemdbResponse,
  type USDAFood,
} from "../../lib/normalizers/index.js";
import {
  isSilpoConnectedUser,
  lookupSilpoBarcode,
} from "../silpo/foodSource.js";

/**
 * Best-effort session peek. `/api/barcode` is deliberately session-less
 * (open, cached, PERF-007 scan flow) — this must NEVER turn it into an
 * auth-gated route. `getSessionUser` throws on a lookup failure (see its
 * docstring in `auth.ts`); catching here keeps that failure mode identical
 * to "no session" instead of a 500 on an endpoint that never required auth.
 */
async function resolveOptionalUserId(req: Request): Promise<string | null> {
  try {
    const user = await getSessionUser(req);
    return user?.id ?? null;
  } catch {
    return null;
  }
}

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

/**
 * Те саме для власного каталогу — але БЕЗ `recordExternalHttp`.
 *
 * `external_http_requests_total` описує виходи за периметр до третіх
 * сторін; запит до власного Postgres туди не належить і зіпсував би і
 * сенс метрики, і її кардинальність. Домену ж `barcode_lookups_total`
 * джерело `catalog` потрібне — саме воно дає hit-rate по ярусах, який
 * дослідження назвало метрикою для рішення «чи потрібен платний API»
 * (docs/90-work/planning/barcode-database-research.md § 4).
 */
function recordCatalogLookup(outcome: "hit" | "miss" | "error"): void {
  try {
    barcodeLookupsTotal.inc({ source: "catalog", outcome });
  } catch {
    /* ignore */
  }
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
        "User-Agent": "Sergeant-NutritionApp/1.0 (https://sergeant.com.ua)",
      },
      signal: AbortSignal.timeout(4000),
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
  const key =
    process.env["USDA_FDC_API_KEY"] ||
    process.env["USDA_API_KEY"] ||
    "DEMO_KEY";
  // Search Branded Foods by GTIN/UPC (barcode is stored in gtinUpc field)
  const url = `${FDC_BASE}/foods/search?query=${encodeURIComponent(barcode)}&dataType=Branded&pageSize=5&api_key=${key}`;
  const start = process.hrtime.bigint();
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Sergeant-NutritionApp/1.0" },
      signal: AbortSignal.timeout(4000),
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
// Source 3: UPCitemdb (694M+ barcodes)
// Returns product name/brand but rarely has nutrition data for food items.
// We mark partial: true so the frontend can prompt the user to fill in macros.
//
// AI-DANGER: дефолтний endpoint — `prod/trial`, тобто **100 запитів на добу
// на весь продукт**, а не на користувача. Перший же день із десятком людей
// вимикає третє джерело каскаду. До 2026-07-25 URL був захардкоджений і
// змінити його без релізу було неможливо; тепер він в `UPCITEMDB_BASE_URL`.
// Заміна тріалу на платний план або на інше джерело — крок 2 у
// `docs/90-work/research/2026-07-25-barcode-sources-and-moderation.md`.
// ──────────────────────────────────────────────────────────────────────────────
async function lookupUPCitemdb(
  barcode: string,
): Promise<NormalizedProduct | null> {
  const base = env.UPCITEMDB_BASE_URL.replace(/\/+$/, "");
  const url = `${base}/lookup?upc=${encodeURIComponent(barcode)}`;
  const start = process.hrtime.bigint();
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Sergeant-NutritionApp/1.0",
        // Платні плани UPCitemdb автентифікуються заголовком `user_key`;
        // тріал його ігнорує, тож заголовок додається лише за наявності
        // ключа — інакше тріальний запит отримав би зайвий заголовок.
        ...(env.UPCITEMDB_API_KEY ? { user_key: env.UPCITEMDB_API_KEY } : {}),
      },
      signal: AbortSignal.timeout(3000),
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
 * GET /api/barcode?barcode=... — каскадний lookup через OFF → USDA →
 * UPCitemdb → Silpo (четверте джерело, лише для юзера зі звʼязаним акаунтом
 * — `modules/silpo/foodSource.ts`). Middleware-и роутера (`setModule`,
 * `rateLimitExpress`) забезпечують module-tag і rate-limit; тут лише
 * бізнес-логіка.
 *
 * Кроки послідовні (не паралельні) навмисно — hit на ранньому джерелі не
 * повинен витрачати квоту наступних (особливо UPCitemdb: 100 req/day trial).
 * Тому per-source timeout тримаємо невеликим (4с/4с/3с = 11с worst-case),
 * а не 7с/7с/6с — повний miss-cascade інакше тягнеться до ~20с. Silpo не має
 * per-source HTTP-timeout тут — `mcpClient.ts` вже несе власний
 * `SILPO_MCP_TIMEOUT_MS` + retry/backoff.
 *
 * KNOWN LIMITATION (acceptable for the narrowed, experimental track D): a
 * miss-sentinel cached by an EARLIER, non-connected caller (OFF/USDA/
 * UPCitemdb all missed) short-circuits below WITHOUT ever trying Silpo for
 * a LATER connected caller on the same barcode, until the 30-min miss TTL
 * expires. Fixing this would require bypassing the shared cache whenever
 * `silpoConnected`, which adds meaningful complexity for a walking-skeleton
 * source — deferred, not a correctness/security issue (worst case: a
 * connected user occasionally sees "not found" for up to 30 minutes).
 */
export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  const barcode = parseQuery(BarcodeQuerySchema, req).barcode.replace(
    /\D/g,
    "",
  );
  if (!/^\d{8,14}$/.test(barcode)) {
    res.status(400).json({ error: "Невірний штрихкод (8–14 цифр)" });
    return;
  }

  // Cache hit short-circuits the cascade entirely. Miss-sentinel returns the
  // same 404 без чергового round-trip-у на upstream-и. Safe regardless of
  // Silpo connection status — Silpo-sourced hits are NEVER written to this
  // shared cache (see the `product.source === "silpo"` guard around
  // `cacheSet` below), so anything found here is public OFF/USDA/UPCitemdb
  // data, not scoped to any one user.
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

  // ── Tier-1: власний каталог (міграція 123) ────────────────────────────────
  //
  // Стоїть ПЕРЕД зовнішніми джерелами. Сенс не в латентності, а в квотах:
  // USDA на DEMO_KEY дає 40 запитів/год НА ВЕСЬ ПРОДУКТ, UPCitemdb trial —
  // 100/добу. Каталог перетворює це з «ліміт на кожен скан» на «ліміт на
  // кожен НОВИЙ товар».
  //
  // Помилка БД тут НЕ фатальна: каталог — прискорювач, а не єдине джерело
  // істини. Якщо Postgres недоступний, скан має працювати через upstream-и
  // рівно як до цієї зміни, а не падати.
  try {
    const fromCatalog = await lookupInCatalog(barcode);
    if (fromCatalog) {
      // Валідація СТРОГО перед кешуванням. Якщо в каталозі колись
      // опиниться рядок, що не лягає в контракт (напр. джерело, ще не
      // заведене в `BarcodeProductSchema.source`), `parse` кидає — і ми
      // мусимо піти в upstream, а не покласти биту відповідь у кеш.
      // Зворотний порядок був би підступним: сам запит віддав би 200, а
      // НАСТУПНИЙ ліг би на тій самій валідації вже в cache-hit-гілці, де
      // її ніхто не ловить, тобто 500 на ровному місці.
      const payload = BarcodeLookupSuccessSchema.parse({
        product: fromCatalog,
      });
      recordCatalogLookup("hit");
      cacheSet(barcode, fromCatalog);
      res.status(200).json(payload);
      return;
    }
    recordCatalogLookup("miss");
  } catch (e) {
    recordCatalogLookup("error");
    logger.warn(
      { err: e instanceof Error ? e.message : String(e), barcode },
      "product_catalog lookup failed, falling through to upstreams",
    );
  }

  // Cheap guard (single indexed SELECT, zero cost for the anonymous
  // majority) — decides whether to try Silpo as the last cascade step AND
  // whether a Silpo-sourced hit below must skip the shared cache / public
  // `Cache-Control`. Gated on the kill switch FIRST: with `SILPO_ENABLED`
  // off (the default) this session-less endpoint must not pay a per-request
  // session lookup for a source that can never activate.
  //
  // Стоїть ПІСЛЯ каталогу навмисно: хіт у власному каталозі повертається
  // одразу, тож найдешевший шлях узагалі не платить за резолв сесії.
  const userId = env.SILPO_ENABLED ? await resolveOptionalUserId(req) : null;
  const silpoConnected = userId ? await isSilpoConnectedUser(userId) : false;

  try {
    // Cascade: OFF → USDA → UPCitemdb → Silpo
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
    if (!product && silpoConnected) {
      // `lookupSilpoBarcode` never throws (see its docstring) — Silpo is a
      // best-effort bonus source, so its failure must NEVER set
      // `upstreamThrew` (that flag exists to distinguish "genuinely not in
      // any database" from "an authoritative source didn't respond", and
      // Silpo is neither authoritative nor required).
      product = await lookupSilpoBarcode(userId, barcode);
    }

    if (!product) {
      // AI-CONTEXT (аудит nutrition § G5): «немає в базі» і «база лежить» —
      // це РІЗНІ відповіді, і плутати їх не можна. Прапорець `upstreamThrew`
      // існував і раніше, але впливав лише на кешування: користувач в обох
      // випадках бачив 404 «Продукт не знайдено» і не мав як зрозуміти, що
      // продукт, можливо, у базі є, а просто не відповіло джерело. Наслідок —
      // людина вручну заводить те, що система вміє знайти, або вважає скан
      // зламаним.
      if (upstreamThrew) {
        // 503, а не 404: відповідь неавторитетна. Не кешуємо — повторний
        // запит має пройти cascade знову. (504 поруч лишається за
        // таймаутом, піднятим ПОЗА per-source try/catch.)
        res.status(503).json({
          error:
            "Бази продуктів зараз не відповідають, це не означає, що продукту немає. Спробуй ще раз за хвилину або введи вручну.",
        });
        return;
      }
      // Справжній all-miss: усі джерела відповіли, і в жодного немає такого
      // штрихкоду. Лише це кешуємо як miss-sentinel.
      cacheSet(barcode, null);
      res.status(404).json({ error: "Продукт не знайдено" });
      return;
    }

    if (product.source === "silpo") {
      // Never share a Silpo-sourced hit — it was resolved via THIS user's
      // linked account, not a global public catalog lookup all callers are
      // equally entitled to. Skip the shared in-process cache AND override
      // the router's public `Cache-Control` (PERF-007) for this response.
      res.setHeader(
        "Cache-Control",
        "private, no-store, no-cache, must-revalidate",
      );
    } else {
      cacheSet(barcode, product);
    }
    res.status(200).json(BarcodeLookupSuccessSchema.parse({ product }));

    // Write-through ПІСЛЯ відповіді: користувач не має чекати на наш запис.
    // `upsertIntoCatalog` сам ковтає власні помилки, тож `void` тут не ховає
    // необроблений reject — він лише знімає await.
    void upsertIntoCatalog(barcode, product);
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
