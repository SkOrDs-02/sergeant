import { Router } from "express";
import type { Pool } from "pg";

/**
 * Email-кампанії та події (n8n WF-80, WF-81).
 *
 * `/api/internal/email/sent` — лог відправлень (idempotent per
 * `(campaignKey, recipientId)` — не дублюємо drip-листи).
 *
 * `/api/internal/email/event` видалено (фаза 1 two-phase видалення
 * `email_events`, міграція 152): Resend-webhook ніколи не був заведений.
 */

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
  r.post("/api/internal/email/sent", async (req, res) => {
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
  });

  return r;
}
