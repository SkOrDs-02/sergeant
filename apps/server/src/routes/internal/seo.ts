import { Router } from "express";
import type { Pool } from "pg";
import { asyncHandler } from "../../http/index.js";

/**
 * SEO snapshot endpoints. Усі записи робить n8n (WF-50…WF-55) через
 * Bearer-token guard у `internal/index.ts`.
 *
 * Hard Rule #1: усі `bigint` із Postgres явно coerce-яться до `number`
 * у JSON-відповіді (див. `Number(...)` на кожному `id`).
 */

interface GscRow {
  dimension?: string;
  dimensionValue?: string;
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
  raw?: unknown;
}

interface BacklinkRow {
  sourceUrl?: string;
  targetUrl?: string;
  anchor?: string | null;
  domainRating?: number | null;
  urlRating?: number | null;
  isDofollow?: boolean;
  firstSeen?: string | null;
  lastSeen?: string | null;
  raw?: unknown;
}

interface SitemapRow {
  url?: string;
  statusCode?: number;
  inSitemap?: boolean;
  inIndex?: boolean | null;
  robotsBlocked?: boolean;
  lastModified?: string | null;
  raw?: unknown;
}

interface RankRow {
  keywordId?: number;
  locale?: string;
  market?: string;
  searchEngine?: string;
  position?: number | null;
  url?: string | null;
  hasFeaturedSnippet?: boolean;
  raw?: unknown;
}

function isYmd(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function nonNeg(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function toJsonbDefault(value: unknown): string {
  if (value == null) return "{}";
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

export function createSeoInternalRouter({ pool }: { pool: Pool }): Router {
  const r = Router();

  // ── GSC snapshot ───────────────────────────────────────────────────────────
  r.post(
    "/api/internal/seo/gsc-snapshot",
    asyncHandler(async (req, res) => {
      const body = req.body as { snapshotDate?: string; rows?: GscRow[] };
      if (!isYmd(body.snapshotDate)) {
        res.status(400).json({ error: "snapshotDate must be YYYY-MM-DD" });
        return;
      }
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (rows.length === 0) {
        res.json({ ok: true, inserted: 0 });
        return;
      }

      let inserted = 0;
      for (const row of rows) {
        if (!row.dimension) continue;
        const result = await pool.query<{ id: string }>(
          `INSERT INTO seo_gsc_daily (
             snapshot_date, dimension, dimension_value,
             clicks, impressions, ctr, position, raw
           )
           VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8::jsonb)
           ON CONFLICT (snapshot_date, dimension, dimension_value)
           DO UPDATE SET
             clicks = EXCLUDED.clicks,
             impressions = EXCLUDED.impressions,
             ctr = EXCLUDED.ctr,
             position = EXCLUDED.position,
             raw = EXCLUDED.raw
           RETURNING id`,
          [
            body.snapshotDate,
            row.dimension,
            row.dimensionValue ?? "",
            nonNeg(row.clicks),
            nonNeg(row.impressions),
            typeof row.ctr === "number" ? row.ctr : 0,
            typeof row.position === "number" ? row.position : 0,
            toJsonbDefault(row.raw),
          ],
        );
        if (result.rows.length > 0) inserted += 1;
      }

      res.json({ ok: true, inserted });
    }),
  );

  // ── Keyword rank snapshot ──────────────────────────────────────────────────
  r.post(
    "/api/internal/seo/rank-snapshot",
    asyncHandler(async (req, res) => {
      const body = req.body as { snapshotDate?: string; rows?: RankRow[] };
      if (!isYmd(body.snapshotDate)) {
        res.status(400).json({ error: "snapshotDate must be YYYY-MM-DD" });
        return;
      }
      const rows = Array.isArray(body.rows) ? body.rows : [];
      let inserted = 0;
      for (const row of rows) {
        if (
          typeof row.keywordId !== "number" ||
          !Number.isFinite(row.keywordId)
        ) {
          continue;
        }
        const result = await pool.query<{ id: string }>(
          `INSERT INTO seo_keyword_ranks (
             keyword_id, snapshot_date, locale, market, search_engine,
             position, url, has_featured_snippet, raw
           )
           VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9::jsonb)
           ON CONFLICT (keyword_id, snapshot_date, locale, market, search_engine)
           DO UPDATE SET
             position = EXCLUDED.position,
             url = EXCLUDED.url,
             has_featured_snippet = EXCLUDED.has_featured_snippet,
             raw = EXCLUDED.raw
           RETURNING id`,
          [
            Math.trunc(row.keywordId),
            body.snapshotDate,
            row.locale ?? "uk",
            row.market ?? "UA",
            row.searchEngine ?? "google",
            typeof row.position === "number" ? Math.trunc(row.position) : null,
            row.url ?? null,
            row.hasFeaturedSnippet === true,
            toJsonbDefault(row.raw),
          ],
        );
        if (result.rows.length > 0) inserted += 1;
      }
      res.json({ ok: true, inserted });
    }),
  );

  // ── Active keywords list ───────────────────────────────────────────────────
  r.get(
    "/api/internal/seo/keywords",
    asyncHandler(async (req, res) => {
      const onlyActive = req.query.onlyActive !== "0";
      const where = onlyActive ? "WHERE is_active = TRUE" : "";
      const { rows } = await pool.query<{
        id: string;
        term: string;
        locale: string;
        market: string;
        priority: number;
        target_url: string | null;
        cluster: string | null;
        is_active: boolean;
      }>(
        `SELECT id, term, locale, market, priority, target_url, cluster, is_active
           FROM seo_keywords ${where}
          ORDER BY priority DESC, term ASC`,
      );
      res.json({
        keywords: rows.map((row) => ({
          id: Number(row.id),
          term: row.term,
          locale: row.locale,
          market: row.market,
          priority: row.priority,
          targetUrl: row.target_url,
          cluster: row.cluster,
          isActive: row.is_active,
        })),
      });
    }),
  );

  // ── PageSpeed snapshot ─────────────────────────────────────────────────────
  r.post(
    "/api/internal/seo/pagespeed",
    asyncHandler(async (req, res) => {
      const body = req.body as {
        snapshotDate?: string;
        url?: string;
        strategy?: string;
        performanceScore?: number | null;
        accessibilityScore?: number | null;
        bestPracticesScore?: number | null;
        seoScore?: number | null;
        lcpMs?: number | null;
        inpMs?: number | null;
        clsScore?: number | null;
        ttfbMs?: number | null;
        raw?: unknown;
      };
      if (!isYmd(body.snapshotDate)) {
        res.status(400).json({ error: "snapshotDate must be YYYY-MM-DD" });
        return;
      }
      if (!body.url) {
        res.status(400).json({ error: "url is required" });
        return;
      }
      if (body.strategy !== "mobile" && body.strategy !== "desktop") {
        res.status(400).json({ error: "strategy must be mobile or desktop" });
        return;
      }

      const intOrNull = (v: number | null | undefined): number | null =>
        typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;

      const result = await pool.query<{ id: string }>(
        `INSERT INTO seo_pagespeed_daily (
           snapshot_date, url, strategy,
           performance_score, accessibility_score, best_practices_score, seo_score,
           lcp_ms, inp_ms, cls_score, ttfb_ms, raw
         )
         VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
         ON CONFLICT (snapshot_date, url, strategy)
         DO UPDATE SET
           performance_score = EXCLUDED.performance_score,
           accessibility_score = EXCLUDED.accessibility_score,
           best_practices_score = EXCLUDED.best_practices_score,
           seo_score = EXCLUDED.seo_score,
           lcp_ms = EXCLUDED.lcp_ms,
           inp_ms = EXCLUDED.inp_ms,
           cls_score = EXCLUDED.cls_score,
           ttfb_ms = EXCLUDED.ttfb_ms,
           raw = EXCLUDED.raw
         RETURNING id`,
        [
          body.snapshotDate,
          body.url,
          body.strategy,
          intOrNull(body.performanceScore),
          intOrNull(body.accessibilityScore),
          intOrNull(body.bestPracticesScore),
          intOrNull(body.seoScore),
          intOrNull(body.lcpMs),
          intOrNull(body.inpMs),
          typeof body.clsScore === "number" ? body.clsScore : null,
          intOrNull(body.ttfbMs),
          toJsonbDefault(body.raw),
        ],
      );

      res.json({ ok: true, id: Number(result.rows[0]?.id ?? 0) });
    }),
  );

  // ── Backlinks snapshot ─────────────────────────────────────────────────────
  r.post(
    "/api/internal/seo/backlinks",
    asyncHandler(async (req, res) => {
      const body = req.body as { snapshotDate?: string; links?: BacklinkRow[] };
      if (!isYmd(body.snapshotDate)) {
        res.status(400).json({ error: "snapshotDate must be YYYY-MM-DD" });
        return;
      }
      const links = Array.isArray(body.links) ? body.links : [];
      let inserted = 0;
      for (const link of links) {
        if (!link.sourceUrl || !link.targetUrl) continue;
        const result = await pool.query<{ id: string }>(
          `INSERT INTO seo_backlinks (
             snapshot_date, source_url, target_url, anchor,
             domain_rating, url_rating, is_dofollow, first_seen, last_seen, raw
           )
           VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8::date, $9::date, $10::jsonb)
           ON CONFLICT (snapshot_date, source_url, target_url)
           DO UPDATE SET
             anchor = EXCLUDED.anchor,
             domain_rating = EXCLUDED.domain_rating,
             url_rating = EXCLUDED.url_rating,
             is_dofollow = EXCLUDED.is_dofollow,
             first_seen = COALESCE(seo_backlinks.first_seen, EXCLUDED.first_seen),
             last_seen = EXCLUDED.last_seen,
             raw = EXCLUDED.raw
           RETURNING id`,
          [
            body.snapshotDate,
            link.sourceUrl,
            link.targetUrl,
            link.anchor ?? null,
            typeof link.domainRating === "number" ? link.domainRating : null,
            typeof link.urlRating === "number" ? link.urlRating : null,
            link.isDofollow !== false,
            isYmd(link.firstSeen) ? link.firstSeen : null,
            isYmd(link.lastSeen) ? link.lastSeen : null,
            toJsonbDefault(link.raw),
          ],
        );
        if (result.rows.length > 0) inserted += 1;
      }
      res.json({ ok: true, inserted });
    }),
  );

  // ── Sitemap health ─────────────────────────────────────────────────────────
  r.post(
    "/api/internal/seo/sitemap-health",
    asyncHandler(async (req, res) => {
      const body = req.body as { snapshotDate?: string; urls?: SitemapRow[] };
      if (!isYmd(body.snapshotDate)) {
        res.status(400).json({ error: "snapshotDate must be YYYY-MM-DD" });
        return;
      }
      const urls = Array.isArray(body.urls) ? body.urls : [];
      let inserted = 0;
      for (const u of urls) {
        if (!u.url || typeof u.statusCode !== "number") continue;
        const result = await pool.query<{ id: string }>(
          `INSERT INTO seo_sitemap_health (
             snapshot_date, url, status_code,
             in_sitemap, in_index, robots_blocked, last_modified, raw
           )
           VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8::jsonb)
           ON CONFLICT (snapshot_date, url)
           DO UPDATE SET
             status_code = EXCLUDED.status_code,
             in_sitemap = EXCLUDED.in_sitemap,
             in_index = EXCLUDED.in_index,
             robots_blocked = EXCLUDED.robots_blocked,
             last_modified = EXCLUDED.last_modified,
             raw = EXCLUDED.raw
           RETURNING id`,
          [
            body.snapshotDate,
            u.url,
            Math.trunc(u.statusCode),
            u.inSitemap === true,
            typeof u.inIndex === "boolean" ? u.inIndex : null,
            u.robotsBlocked === true,
            u.lastModified ?? null,
            toJsonbDefault(u.raw),
          ],
        );
        if (result.rows.length > 0) inserted += 1;
      }
      res.json({ ok: true, inserted });
    }),
  );

  // ── Competitor snapshot (UPSERT competitor + insert snapshot) ──────────────
  r.post(
    "/api/internal/seo/competitor-snapshot",
    asyncHandler(async (req, res) => {
      const body = req.body as {
        snapshotDate?: string;
        competitorDomain?: string;
        competitorName?: string;
        trafficEstimate?: number | null;
        topKeywords?: unknown;
        topPages?: unknown;
        backlinksCount?: number | null;
        domainRating?: number | null;
        raw?: unknown;
      };
      if (!isYmd(body.snapshotDate)) {
        res.status(400).json({ error: "snapshotDate must be YYYY-MM-DD" });
        return;
      }
      if (!body.competitorDomain) {
        res.status(400).json({ error: "competitorDomain is required" });
        return;
      }

      const competitor = await pool.query<{ id: string }>(
        `INSERT INTO seo_competitors (domain, name, is_active)
         VALUES ($1, $2, TRUE)
         ON CONFLICT (domain) DO UPDATE
           SET name = COALESCE(EXCLUDED.name, seo_competitors.name)
         RETURNING id`,
        [body.competitorDomain, body.competitorName ?? null],
      );
      const competitorId = Number(competitor.rows[0]?.id ?? 0);

      const snapshot = await pool.query<{ id: string }>(
        `INSERT INTO seo_competitor_snapshots (
           competitor_id, snapshot_date, traffic_estimate,
           top_keywords, top_pages, backlinks_count, domain_rating, raw
         )
         VALUES ($1, $2::date, $3, $4::jsonb, $5::jsonb, $6, $7, $8::jsonb)
         ON CONFLICT (competitor_id, snapshot_date)
         DO UPDATE SET
           traffic_estimate = EXCLUDED.traffic_estimate,
           top_keywords = EXCLUDED.top_keywords,
           top_pages = EXCLUDED.top_pages,
           backlinks_count = EXCLUDED.backlinks_count,
           domain_rating = EXCLUDED.domain_rating,
           raw = EXCLUDED.raw
         RETURNING id`,
        [
          competitorId,
          body.snapshotDate,
          typeof body.trafficEstimate === "number"
            ? body.trafficEstimate
            : null,
          JSON.stringify(body.topKeywords ?? []),
          JSON.stringify(body.topPages ?? []),
          typeof body.backlinksCount === "number" ? body.backlinksCount : null,
          typeof body.domainRating === "number" ? body.domainRating : null,
          toJsonbDefault(body.raw),
        ],
      );

      res.json({
        ok: true,
        id: Number(snapshot.rows[0]?.id ?? 0),
        competitorId,
      });
    }),
  );

  return r;
}
