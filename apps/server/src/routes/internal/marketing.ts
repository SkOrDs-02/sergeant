import { Router } from "express";
import type { Pool } from "pg";
import { asyncHandler } from "../../http/index.js";

/**
 * Marketing endpoints (n8n WF-70…WF-76): brand mentions, social mentions,
 * channel growth, та app-store reviews.
 *
 * Hard Rule #1: усі `bigint` із Postgres явно coerce-яться до `number`
 * у JSON-відповіді.
 */

const SENTIMENTS = new Set(["positive", "neutral", "negative"]);

function isYmd(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function nonNeg(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function bigIntStr(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0";
  return Math.trunc(value).toString();
}

function toJsonbDefault(value: unknown): string {
  if (value == null) return "{}";
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

function normalizeSentiment(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.toLowerCase();
  return SENTIMENTS.has(v) ? v : null;
}

export function createMarketingInternalRouter({
  pool,
}: {
  pool: Pool;
}): Router {
  const r = Router();

  // ── Brand mention (Google Alerts / generic) ────────────────────────────────
  r.post(
    "/api/internal/marketing/mention",
    asyncHandler(async (req, res) => {
      const body = req.body as {
        source?: string;
        url?: string;
        title?: string;
        excerpt?: string;
        author?: string;
        sentiment?: string;
        relevanceScore?: number;
        mentionedAt?: string;
        platform?: string;
        postId?: string;
        authorHandle?: string;
        authorFollowers?: number;
        text?: string;
        engagement?: number;
        postedAt?: string;
        raw?: unknown;
      };

      // Two paths: brand_mentions (source+url) OR social_mentions (platform+postId).
      if (body.platform && body.postId) {
        if (!body.url) {
          res.status(400).json({ error: "url is required for social mention" });
          return;
        }
        const result = await pool.query<{ id: string; xmax: string }>(
          `INSERT INTO social_mentions (
             platform, post_id, url, author_handle, author_followers,
             text, engagement, sentiment, posted_at, raw
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
           ON CONFLICT (platform, post_id)
           DO UPDATE SET
             url = EXCLUDED.url,
             author_handle = EXCLUDED.author_handle,
             author_followers = EXCLUDED.author_followers,
             text = EXCLUDED.text,
             engagement = EXCLUDED.engagement,
             sentiment = EXCLUDED.sentiment,
             posted_at = EXCLUDED.posted_at,
             raw = EXCLUDED.raw
           RETURNING id, xmax::text`,
          [
            body.platform,
            body.postId,
            body.url,
            body.authorHandle ?? null,
            typeof body.authorFollowers === "number"
              ? Math.trunc(body.authorFollowers)
              : null,
            body.text ?? null,
            nonNeg(body.engagement),
            normalizeSentiment(body.sentiment),
            body.postedAt ?? null,
            toJsonbDefault(body.raw),
          ],
        );
        const row = result.rows[0];
        res.json({
          ok: true,
          kind: "social",
          id: Number(row?.id ?? 0),
          isNew: row?.xmax === "0",
        });
        return;
      }

      if (!body.source || !body.url) {
        res.status(400).json({ error: "source and url are required" });
        return;
      }
      const result = await pool.query<{ id: string; xmax: string }>(
        `INSERT INTO brand_mentions (
           source, url, title, excerpt, author, sentiment, relevance_score, mentioned_at, raw
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
         ON CONFLICT (source, url)
         DO UPDATE SET
           title = EXCLUDED.title,
           excerpt = EXCLUDED.excerpt,
           author = EXCLUDED.author,
           sentiment = EXCLUDED.sentiment,
           relevance_score = EXCLUDED.relevance_score,
           mentioned_at = EXCLUDED.mentioned_at,
           raw = EXCLUDED.raw
         RETURNING id, xmax::text`,
        [
          body.source,
          body.url,
          body.title ?? null,
          body.excerpt ?? null,
          body.author ?? null,
          normalizeSentiment(body.sentiment),
          typeof body.relevanceScore === "number" ? body.relevanceScore : null,
          body.mentionedAt ?? null,
          toJsonbDefault(body.raw),
        ],
      );
      const row = result.rows[0];
      res.json({
        ok: true,
        kind: "brand",
        id: Number(row?.id ?? 0),
        isNew: row?.xmax === "0",
      });
    }),
  );

  // ── App-store review ───────────────────────────────────────────────────────
  r.post(
    "/api/internal/marketing/review",
    asyncHandler(async (req, res) => {
      const body = req.body as {
        platform?: string;
        externalId?: string;
        rating?: number;
        title?: string;
        body?: string;
        locale?: string;
        author?: string;
        topic?: string;
        sentiment?: string;
        postedAt?: string;
        raw?: unknown;
      };
      if (body.platform !== "ios" && body.platform !== "android") {
        res.status(400).json({ error: "platform must be ios or android" });
        return;
      }
      if (!body.externalId) {
        res.status(400).json({ error: "externalId is required" });
        return;
      }
      if (
        typeof body.rating !== "number" ||
        body.rating < 1 ||
        body.rating > 5
      ) {
        res.status(400).json({ error: "rating must be 1..5" });
        return;
      }
      const result = await pool.query<{ id: string; xmax: string }>(
        `INSERT INTO app_store_reviews (
           platform, external_id, rating, title, body, locale, author, topic, sentiment, posted_at, raw
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
         ON CONFLICT (platform, external_id)
         DO UPDATE SET
           rating = EXCLUDED.rating,
           title = EXCLUDED.title,
           body = EXCLUDED.body,
           locale = EXCLUDED.locale,
           author = EXCLUDED.author,
           topic = EXCLUDED.topic,
           sentiment = EXCLUDED.sentiment,
           posted_at = EXCLUDED.posted_at,
           raw = EXCLUDED.raw
         RETURNING id, xmax::text`,
        [
          body.platform,
          body.externalId,
          Math.trunc(body.rating),
          body.title ?? null,
          body.body ?? null,
          body.locale ?? null,
          body.author ?? null,
          body.topic ?? null,
          normalizeSentiment(body.sentiment),
          body.postedAt ?? null,
          toJsonbDefault(body.raw),
        ],
      );
      const row = result.rows[0];
      res.json({
        ok: true,
        id: Number(row?.id ?? 0),
        isNew: row?.xmax === "0",
      });
    }),
  );

  // ── Social channel daily snapshot ──────────────────────────────────────────
  r.post(
    "/api/internal/marketing/social-channel",
    asyncHandler(async (req, res) => {
      const body = req.body as {
        snapshotDate?: string;
        platform?: string;
        channel?: string;
        followers?: number;
        newFollowers?: number;
        unsubs?: number;
        impressions?: number;
        engagements?: number;
        raw?: unknown;
      };
      if (!isYmd(body.snapshotDate)) {
        res.status(400).json({ error: "snapshotDate must be YYYY-MM-DD" });
        return;
      }
      if (!body.platform || !body.channel) {
        res.status(400).json({ error: "platform and channel are required" });
        return;
      }
      const result = await pool.query<{ id: string }>(
        `INSERT INTO social_channels_daily (
           snapshot_date, platform, channel, followers, new_followers, unsubs,
           impressions, engagements, raw
         )
         VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
         ON CONFLICT (snapshot_date, platform, channel)
         DO UPDATE SET
           followers = EXCLUDED.followers,
           new_followers = EXCLUDED.new_followers,
           unsubs = EXCLUDED.unsubs,
           impressions = EXCLUDED.impressions,
           engagements = EXCLUDED.engagements,
           raw = EXCLUDED.raw
         RETURNING id`,
        [
          body.snapshotDate,
          body.platform,
          body.channel,
          nonNeg(body.followers),
          nonNeg(body.newFollowers),
          nonNeg(body.unsubs),
          bigIntStr(body.impressions),
          bigIntStr(body.engagements),
          toJsonbDefault(body.raw),
        ],
      );
      res.json({ ok: true, id: Number(result.rows[0]?.id ?? 0) });
    }),
  );

  return r;
}
