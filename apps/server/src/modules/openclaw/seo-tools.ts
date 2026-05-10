/**
 * SEO read-only env-stub tools (PR-C1b).
 *
 * Усі три tool-и мають graceful fallback `{ notConfigured: true }` коли
 * відповідні env-секрети не задано — це навмисно, щоб LLM міг чесно
 * сказати "SEO-data not configured" замість 500-ів. Production-instance
 * Gateway мав env-вари; локальний dev без них працює без crash-у.
 *
 * Контракт із plan-ом (`docs/planning/openclaw-migration-plan.md`
 * §C1b — code, SEO, reminders):
 *
 *   seo_gsc_query    — Google Search Console: запит метрик клік/impression
 *                      / position по dimension (query|page|country|device).
 *   seo_psi_audit    — Google PageSpeed Insights: lighthouse score
 *                      для одного URL (mobile|desktop).
 *   seo_serp_lookup  — Search-result snapshot (через SerpAPI або сумісний).
 */

import { env } from "../../env.js";
import { logger } from "../../obs/logger.js";

const USER_AGENT = "OpenClaw-Bot";

interface NotConfigured {
  notConfigured: true;
  missing: string[];
}

// ─── seo_gsc_query ─────────────────────────────────────────────────────

export type GscDimension = "query" | "page" | "country" | "device";

export interface SeoGscQueryInput {
  /** Lookback window in days. Default 7, max 90. */
  days?: number | undefined;
  /** Один з допустимих dimensions; default 'query'. */
  dimension?: GscDimension | undefined;
  /** Override site URL (default env.OPENCLAW_GSC_SITE_URL). */
  siteUrl?: string | undefined;
  /** Row limit. Default 25, max 100. */
  rowLimit?: number | undefined;
}

export interface SeoGscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SeoGscQueryOutput {
  notConfigured?: boolean;
  missing?: string[];
  siteUrl?: string;
  startDate?: string;
  endDate?: string;
  dimension?: GscDimension;
  rows?: SeoGscRow[];
}

function ymdDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function seoGscQuery(
  input: SeoGscQueryInput,
): Promise<SeoGscQueryOutput> {
  const missing: string[] = [];
  const apiKey = env.OPENCLAW_GSC_API_KEY;
  const siteUrl = input.siteUrl ?? env.OPENCLAW_GSC_SITE_URL;
  if (!apiKey) missing.push("OPENCLAW_GSC_API_KEY");
  if (!siteUrl) missing.push("OPENCLAW_GSC_SITE_URL");
  if (missing.length > 0) {
    logger.warn({ msg: "openclaw_seo_gsc_not_configured", missing });
    return { notConfigured: true, missing };
  }

  const days = Math.max(1, Math.min(90, input.days ?? 7));
  const dimension: GscDimension = input.dimension ?? "query";
  const rowLimit = Math.max(1, Math.min(100, input.rowLimit ?? 25));
  const startDate = ymdDaysAgo(days);
  const endDate = ymdDaysAgo(0);

  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: [dimension],
      rowLimit,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `seo_gsc_query: GSC API returned ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  }
  const raw = (await res.json()) as {
    rows?: Array<{
      keys?: string[];
      clicks?: number;
      impressions?: number;
      ctr?: number;
      position?: number;
    }>;
  };
  const rows: SeoGscRow[] = (raw.rows ?? []).map((r) => ({
    keys: Array.isArray(r.keys) ? r.keys : [],
    clicks: typeof r.clicks === "number" ? r.clicks : 0,
    impressions: typeof r.impressions === "number" ? r.impressions : 0,
    ctr: typeof r.ctr === "number" ? r.ctr : 0,
    position: typeof r.position === "number" ? r.position : 0,
  }));
  return { siteUrl, startDate, endDate, dimension, rows };
}

// ─── seo_psi_audit ────────────────────────────────────────────────────

export type PsiStrategy = "mobile" | "desktop";

export interface SeoPsiAuditInput {
  url: string;
  strategy?: PsiStrategy | undefined;
}

export interface SeoPsiAuditOutput {
  notConfigured?: boolean;
  missing?: string[];
  url?: string;
  strategy?: PsiStrategy;
  performance?: number | null;
  accessibility?: number | null;
  bestPractices?: number | null;
  seo?: number | null;
  fetchedAt?: string;
}

export async function seoPsiAudit(
  input: SeoPsiAuditInput,
): Promise<SeoPsiAuditOutput> {
  if (!input.url) throw new Error("seo_psi_audit: url required");
  const apiKey = env.OPENCLAW_PSI_API_KEY;
  if (!apiKey) {
    logger.warn({
      msg: "openclaw_seo_psi_not_configured",
      missing: ["OPENCLAW_PSI_API_KEY"],
    });
    return {
      notConfigured: true,
      missing: ["OPENCLAW_PSI_API_KEY"],
    };
  }
  const strategy: PsiStrategy = input.strategy ?? "mobile";
  const params = new URLSearchParams({
    url: input.url,
    strategy,
    key: apiKey,
  });
  // PSI returns four categories — request all so the LLM has a unified score.
  for (const cat of ["performance", "accessibility", "best-practices", "seo"]) {
    params.append("category", cat);
  }
  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`;
  const res = await fetch(endpoint, {
    method: "GET",
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(
      `seo_psi_audit: PSI API returned ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  }
  const raw = (await res.json()) as {
    lighthouseResult?: {
      categories?: Record<string, { score?: number | null } | undefined>;
    };
  };
  const cats = raw.lighthouseResult?.categories ?? {};
  const pickScore = (key: string): number | null => {
    const c = cats[key];
    return typeof c?.score === "number" ? c.score : null;
  };
  return {
    url: input.url,
    strategy,
    performance: pickScore("performance"),
    accessibility: pickScore("accessibility"),
    bestPractices: pickScore("best-practices"),
    seo: pickScore("seo"),
    fetchedAt: new Date().toISOString(),
  };
}

// ─── seo_serp_lookup ──────────────────────────────────────────────────

export interface SeoSerpLookupInput {
  query: string;
  hl?: string | undefined;
  gl?: string | undefined;
  /** 1..20 results. */
  num?: number | undefined;
}

export interface SeoSerpResult {
  position: number;
  title: string;
  link: string;
  snippet: string;
}

export interface SeoSerpLookupOutput {
  notConfigured?: boolean;
  missing?: string[];
  query?: string;
  results?: SeoSerpResult[];
  fetchedAt?: string;
}

export async function seoSerpLookup(
  input: SeoSerpLookupInput,
): Promise<SeoSerpLookupOutput> {
  if (!input.query) throw new Error("seo_serp_lookup: query required");
  const apiKey = env.OPENCLAW_SERP_API_KEY;
  if (!apiKey) {
    logger.warn({
      msg: "openclaw_seo_serp_not_configured",
      missing: ["OPENCLAW_SERP_API_KEY"],
    });
    return {
      notConfigured: true,
      missing: ["OPENCLAW_SERP_API_KEY"],
    };
  }
  const num = Math.max(1, Math.min(20, input.num ?? 10));
  const params = new URLSearchParams({
    api_key: apiKey,
    q: input.query,
    num: String(num),
    hl: input.hl ?? "en",
    gl: input.gl ?? "us",
  });
  const endpoint = `https://serpapi.com/search.json?${params.toString()}`;
  const res = await fetch(endpoint, {
    method: "GET",
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(
      `seo_serp_lookup: SerpAPI returned ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  }
  const raw = (await res.json()) as {
    organic_results?: Array<{
      position?: number;
      title?: string;
      link?: string;
      snippet?: string;
    }>;
  };
  const results: SeoSerpResult[] = (raw.organic_results ?? []).map((r, i) => ({
    position: typeof r.position === "number" ? r.position : i + 1,
    title: r.title ?? "",
    link: r.link ?? "",
    snippet: r.snippet ?? "",
  }));
  return {
    query: input.query,
    results,
    fetchedAt: new Date().toISOString(),
  };
}

// Export helper for `not_configured` discrimination in tests.
export function isNotConfigured(out: {
  notConfigured?: boolean;
}): out is NotConfigured {
  return out.notConfigured === true;
}
