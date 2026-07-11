/**
 * Plata (monobank) self-managed recurring — in-process poller (Phase 7 UA
 * billing).
 *
 * monopay не має auto-subscribe, тож рекурентку тримаємо самі: щодня
 * знаходимо `provider='plata'` підписки, у яких `current_period_end` уже
 * настав, і списуємо через `wallet/payment` по збереженому card-token-у.
 * Успіх → зсуваємо період на місяць; невдача → `past_due` (dunning, ADR-1.12).
 *
 * Патерн — той самий in-process setInterval-воркер, що
 * `WebhookEventsRetentionPoller` / `enrichmentWorker` (Tier-A, без BullMQ,
 * idempotent, `unref()` не блокує shutdown). НЕ n8n (paused у проді).
 */
import type { Pool } from "pg";
import { env } from "../../env/env.js";
import { logger } from "../../obs/logger.js";
import { billingRecurringChargeTotal } from "../../obs/metrics.js";
import { decryptToken } from "../mono/crypto.js";

const MONOPAY_WALLET_PAYMENT_URL =
  "https://api.monobank.ua/api/merchant/wallet/payment";
const CCY_UAH = 980;
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // добовий tick

export interface PlataChargeResult {
  /** Підписок оброблено (спроба списання). */
  processed: number;
  /** Успішних списань. */
  charged: number;
  /** Переведено у past_due. */
  pastDue: number;
}

interface DueRow {
  user_id: string;
  wallet_id: string;
  card_token_ciphertext: Buffer;
  card_token_iv: Buffer;
  card_token_tag: Buffer;
}

function getEncKey(): string {
  const key = process.env["MONO_TOKEN_ENC_KEY"];
  if (!key) {
    throw new Error(
      "MONO_TOKEN_ENC_KEY is required to decrypt Plata card tokens",
    );
  }
  return key;
}

async function chargeByToken(cardToken: string): Promise<boolean> {
  const token = env.PLATA_TOKEN;
  if (!token) return false;
  const response = await fetch(MONOPAY_WALLET_PAYMENT_URL, {
    method: "POST",
    headers: { "X-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({
      cardToken,
      amount: env.PRO_MONTHLY_UAH_KOPIYKAS,
      ccy: CCY_UAH,
      initiationKind: "merchant",
    }),
  });
  if (!response.ok) return false;
  const payload = (await response.json()) as { status?: string };
  // monopay wallet/payment повертає статус платежу; `success` = списано.
  // `created`/`processing` трактуємо як ще-не-успіх (наступний tick повторить).
  return payload.status === "success";
}

/**
 * Один прогін рекурентки. Експортовано для тестів і ручного прогону
 * (click-through: виставити current_period_end у минуле → викликати це).
 */
export async function chargeDuePlataSubscriptions(
  pool: Pool,
): Promise<PlataChargeResult> {
  const { rows } = await pool.query<DueRow>(
    `SELECT t.user_id, t.wallet_id,
            t.card_token_ciphertext, t.card_token_iv, t.card_token_tag
       FROM subscriptions s
       JOIN plata_card_token t ON t.user_id = s.user_id
      WHERE s.provider = 'plata'
        AND s.status = 'active'
        AND s.cancel_at_period_end = FALSE
        AND s.current_period_end <= NOW()`,
  );

  const key = getEncKey();
  let charged = 0;
  let pastDue = 0;
  for (const row of rows) {
    let ok = false;
    try {
      const cardToken = decryptToken(
        {
          ciphertext: row.card_token_ciphertext,
          iv: row.card_token_iv,
          tag: row.card_token_tag,
        },
        key,
      );
      ok = await chargeByToken(cardToken);
    } catch (err) {
      logger.error({
        msg: "plata_recurring_charge_error",
        userId: row.user_id,
        err: err instanceof Error ? err.message : String(err),
      });
    }

    if (ok) {
      await pool.query(
        `UPDATE subscriptions
            SET status = 'active',
                current_period_end = current_period_end + INTERVAL '1 month',
                updated_at = NOW()
          WHERE user_id = $1 AND provider = 'plata'`,
        [row.user_id],
      );
      billingRecurringChargeTotal.inc({ provider: "plata", result: "charged" });
      charged += 1;
    } else {
      await pool.query(
        `UPDATE subscriptions
            SET status = 'past_due', updated_at = NOW()
          WHERE user_id = $1 AND provider = 'plata' AND status = 'active'`,
        [row.user_id],
      );
      billingRecurringChargeTotal.inc({
        provider: "plata",
        result: "past_due",
      });
      pastDue += 1;
    }
  }

  const result: PlataChargeResult = {
    processed: rows.length,
    charged,
    pastDue,
  };
  if (rows.length > 0) {
    logger.info({ msg: "plata_recurring_tick", ...result });
  }
  return result;
}

export interface PlataSchedulerOptions {
  pool: Pool;
  /** Інтервал (мс). Default 24 год. 0 → off. */
  intervalMs?: number;
  /** Явний enable. Default `env.PLATA_ENABLED`. */
  enabled?: boolean;
}

/** In-process poller. Idempotent start/stop, `unref()` не блокує shutdown. */
export class PlataRecurringPoller {
  private readonly pool: Pool;
  private readonly intervalMs: number;
  private readonly enabled: boolean;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopping = false;

  constructor(options: PlataSchedulerOptions) {
    this.pool = options.pool;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.enabled = options.enabled ?? env.PLATA_ENABLED;
  }

  start(): void {
    if (this.timer) return;
    if (!this.enabled || this.intervalMs <= 0) {
      logger.info({
        msg: "plata_recurring_poller_disabled",
        enabled: this.enabled,
        intervalMs: this.intervalMs,
      });
      return;
    }
    logger.info({
      msg: "plata_recurring_poller_started",
      intervalMs: this.intervalMs,
    });
    this.timer = setInterval(() => {
      void this.runOnce().catch((err: unknown) => {
        logger.error({
          msg: "plata_recurring_tick_failed",
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }, this.intervalMs);
    this.timer.unref?.();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    while (this.running) {
      await new Promise((r) => setTimeout(r, 20));
    }
    this.stopping = false;
    logger.info({ msg: "plata_recurring_poller_stopped" });
  }

  async runOnce(): Promise<PlataChargeResult> {
    if (this.running || this.stopping) {
      return { processed: 0, charged: 0, pastDue: 0 };
    }
    this.running = true;
    try {
      return await chargeDuePlataSubscriptions(this.pool);
    } finally {
      this.running = false;
    }
  }
}
