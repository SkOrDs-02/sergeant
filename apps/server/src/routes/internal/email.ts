import { Router } from "express";
import type { Pool } from "pg";
import { asyncHandler } from "../../http/index.js";

/**
 * Email-кампанії та події (n8n WF-80, WF-81).
 *
 * `/api/internal/email/sent` — лог відправлень (idempotent per
 * `(campaignKey, recipientId)` — не дублюємо drip-листи).
 * `/api/internal/email/event` — append-only події з webhook-у провайдера
 * (Resend / Postmark / SES).
 */

const EVENT_TYPES = new Set([
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "unsubscribed",
  "failed",
]);

function toJsonbDefault(value: unknown): string {
  if (value == null) return "{}";
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

export function createEmailInternalRouter({ pool }: { pool: Pool }): Router {
  const r = Router();

  // ── Email sent (drip-кампанії) ─────────────────────────────────────────────
  r.post(
    "/api/internal/email/sent",
    asyncHandler(async (req, res) => {
      const body = req.body as {
        campaignKey?: string;
        recipientId?: string;
        recipientEmailHash?: string;
        provider?: string;
        providerMessageId?: string;
        variant?: string;
        raw?: unknown;
      };
      if (!body.campaignKey || !body.recipientId || !body.recipientEmailHash) {
        res.status(400).json({
          error: "campaignKey, recipientId and recipientEmailHash are required",
        });
        return;
      }

      const result = await pool.query<{ id: string; xmax: string }>(
        `INSERT INTO email_campaigns_log (
           campaign_key, recipient_id, recipient_email_hash,
           provider, provider_message_id, variant, raw
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         ON CONFLICT (campaign_key, recipient_id)
         DO UPDATE SET
           provider = EXCLUDED.provider,
           provider_message_id = COALESCE(EXCLUDED.provider_message_id, email_campaigns_log.provider_message_id),
           variant = EXCLUDED.variant,
           raw = EXCLUDED.raw
         RETURNING id, xmax::text`,
        [
          body.campaignKey,
          body.recipientId,
          body.recipientEmailHash,
          body.provider ?? "resend",
          body.providerMessageId ?? null,
          body.variant ?? null,
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

  // ── Email event (open / click / bounce / etc.) ─────────────────────────────
  r.post(
    "/api/internal/email/event",
    asyncHandler(async (req, res) => {
      const body = req.body as {
        provider?: string;
        providerMessageId?: string;
        eventType?: string;
        occurredAt?: string;
        recipientEmailHash?: string;
        url?: string;
        raw?: unknown;
      };
      if (!body.providerMessageId) {
        res.status(400).json({ error: "providerMessageId is required" });
        return;
      }
      if (!body.eventType || !EVENT_TYPES.has(body.eventType)) {
        res.status(400).json({ error: "invalid eventType" });
        return;
      }
      const occurredAt =
        body.occurredAt && !Number.isNaN(Date.parse(body.occurredAt))
          ? body.occurredAt
          : new Date().toISOString();

      const result = await pool.query<{ id: string }>(
        `INSERT INTO email_events (
           provider, provider_message_id, event_type, occurred_at,
           recipient_email_hash, url, raw
         )
         VALUES ($1, $2, $3, $4::timestamptz, $5, $6, $7::jsonb)
         RETURNING id`,
        [
          body.provider ?? "resend",
          body.providerMessageId,
          body.eventType,
          occurredAt,
          body.recipientEmailHash ?? null,
          body.url ?? null,
          toJsonbDefault(body.raw),
        ],
      );

      res.json({ ok: true, id: Number(result.rows[0]?.id ?? 0) });
    }),
  );

  return r;
}
