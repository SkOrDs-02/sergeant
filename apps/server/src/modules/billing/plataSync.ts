/**
 * Plata (monobank) subscription reconciliation — `subscription/status` is
 * the arbiter of state (plata-recurring spec 2026-09-01, § Рішення дизайну).
 *
 * Жоден webhook не змінює `subscriptions` напряму: він лише тригерить
 * {@link reconcileBySubscriptionId}. Два темпи полінгу покривають той самий
 * шлях, коли webhook не доходить:
 *   - **швидкий тик** (5 хв) — `plata_subscription`-рядки без `confirmed_at`,
 *     створені менш ніж годину тому. Існує рівно для того, щоб активація Pro
 *     не чекала доби, якщо webhook не дійшов.
 *   - **повільний тик** (24 год) — усі `active`/`past_due` підписки, ловить
 *     `past_due`-грейс і дунінг-цикл довше години.
 *
 * Перелік значень `subscription.status` у доках monobank не наведено;
 * підтверджене прикладом лише `active`. Невідоме значення — безпечний
 * дефолт «нічого не змінюємо», не «скасовано» (spec § Ризики).
 *
 * Без `FOR UPDATE SKIP LOCKED`: звірка read-only й ідемпотентна (читає стан
 * у monobank, не рухає гроші сама), повторний прогін нешкідливий — на
 * відміну від видаленого `plataScheduler.ts`, який САМ списував гроші і
 * тому потребував claim-транзакції.
 *
 * Патерн поллера — той самий Tier-A in-process `setInterval` + `unref()`,
 * idempotent `start`/`stop`, що `GdprCleanupPoller` / `SilpoSyncPoller`
 * (ADR-0089: періодичний ідемпотентний скан → in-process timer).
 */
import type { Pool } from "pg";
import { env } from "../../env/env.js";
import { logger } from "../../obs/logger.js";
import { billingRecurringChargeTotal } from "../../obs/metrics.js";
import { BillingConfigurationError } from "./provider.js";

// `plata.ts` імпортує з цього модуля (`reconcileBySubscriptionId`) — власний
// маленький `getToken`/`MONOPAY_BASE` тут, а не імпорт із `plata.ts`, щоб не
// заводити циклічний import між двома файлами.
export const MONOPAY_BASE = "https://api.monobank.ua/api/merchant";

function getToken(): string {
  const token = env.PLATA_TOKEN;
  if (!token) {
    throw new BillingConfigurationError("PLATA_TOKEN is not set");
  }
  return token;
}

const FAST_TICK_MS = 5 * 60 * 1000;
const SLOW_TICK_MS = 24 * 60 * 60 * 1000;
const FAST_WINDOW_MS = 60 * 60 * 1000;
const GRACE_DAYS = 3;
const ACTIVE_STATUSES = new Set(["active"]);

interface SubscriptionStatusResponse {
  subscriptionId?: string;
  status?: string;
  nextChargeDate?: string;
  summary?: { totalPaid?: number; totalFailed?: number };
  walletData?: {
    cardToken?: string;
    walletId?: string;
    failureDescription?: string;
  };
}

interface PlataSubscriptionRow {
  user_id: string;
  subscription_id: string;
}

async function fetchSubscriptionStatus(
  subscriptionId: string,
): Promise<SubscriptionStatusResponse | null> {
  const token = getToken();
  const url = `${MONOPAY_BASE}/subscription/status?subscriptionId=${encodeURIComponent(subscriptionId)}`;
  const response = await fetch(url, { headers: { "X-Token": token } });
  if (!response.ok) {
    logger.warn({
      msg: "plata_sync_status_fetch_failed",
      status: response.status,
    });
    return null;
  }
  return (await response.json()) as SubscriptionStatusResponse;
}

async function applyActive(
  pool: Pool,
  row: PlataSubscriptionRow,
  statusResp: SubscriptionStatusResponse,
): Promise<void> {
  const nextChargeDate = statusResp.nextChargeDate
    ? new Date(statusResp.nextChargeDate)
    : null;
  await pool.query(
    `UPDATE plata_subscription
        SET confirmed_at = COALESCE(confirmed_at, NOW()), updated_at = NOW()
      WHERE user_id = $1`,
    [row.user_id],
  );
  await pool.query(
    `INSERT INTO subscriptions
       (user_id, provider, plan, status, provider_subscription_id, current_period_end)
     VALUES ($1, 'plata', 'pro', 'active', $2, $3)
     ON CONFLICT (user_id) WHERE status IN ('active', 'trialing', 'past_due') DO UPDATE SET
       plan = 'pro',
       status = 'active',
       provider = 'plata',
       provider_subscription_id = EXCLUDED.provider_subscription_id,
       current_period_end = EXCLUDED.current_period_end,
       updated_at = NOW()`,
    [row.user_id, row.subscription_id, nextChargeDate],
  );
  billingRecurringChargeTotal.inc({ provider: "plata", result: "charged" });
}

/**
 * Грейс — рівно один раз за цикл: якщо `current_period_end` уже в
 * майбутньому (попередній грейс ще не спливов), дату не зсуваємо вдруге.
 * Read-then-write (не одна CASE-UPDATE) навмисно: звірка сама read-only й
 * ідемпотентна (не рухає гроші), тож гонки тут нема — а два прогони з
 * ідентичним DB-станом дають ідентичний результат.
 */
async function applyPastDue(pool: Pool, userId: string): Promise<void> {
  const { rows } = await pool.query<{
    current_period_end: Date | string | null;
  }>(
    `SELECT current_period_end FROM subscriptions
      WHERE user_id = $1 AND provider = 'plata'`,
    [userId],
  );
  const currentPeriodEnd = rows[0]?.current_period_end
    ? new Date(rows[0].current_period_end)
    : null;
  const alreadyGraced =
    currentPeriodEnd !== null && currentPeriodEnd.getTime() > Date.now();
  if (alreadyGraced) {
    await pool.query(
      `UPDATE subscriptions
          SET status = 'past_due', updated_at = NOW()
        WHERE user_id = $1 AND provider = 'plata'`,
      [userId],
    );
  } else {
    const graceUntil = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000);
    await pool.query(
      `UPDATE subscriptions
          SET status = 'past_due', current_period_end = $2, updated_at = NOW()
        WHERE user_id = $1 AND provider = 'plata'`,
      [userId, graceUntil],
    );
  }
  billingRecurringChargeTotal.inc({ provider: "plata", result: "past_due" });
}

/** Один прогін звірки для однієї підписки. Ніколи не кидає. */
export async function reconcileSubscription(
  pool: Pool,
  row: PlataSubscriptionRow,
): Promise<void> {
  try {
    const statusResp = await fetchSubscriptionStatus(row.subscription_id);
    if (!statusResp) return;
    const failureDescription = statusResp.walletData?.failureDescription;
    if (failureDescription) {
      await applyPastDue(pool, row.user_id);
      return;
    }
    if (statusResp.status && ACTIVE_STATUSES.has(statusResp.status)) {
      await applyActive(pool, row, statusResp);
      return;
    }
    // Невідомий/порожній статус, без ознаки невдачі — безпечний дефолт:
    // нічого не міняємо (spec § Ризики).
    logger.info({
      msg: "plata_sync_unknown_status",
      subscriptionId: row.subscription_id,
      status: statusResp.status ?? null,
    });
  } catch (err) {
    logger.error({
      msg: "plata_sync_reconcile_error",
      subscriptionId: row.subscription_id,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Webhook-тригер: підписка відома лише за `subscriptionId`. */
export async function reconcileBySubscriptionId(
  pool: Pool,
  subscriptionId: string,
): Promise<void> {
  const { rows } = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM plata_subscription WHERE subscription_id = $1`,
    [subscriptionId],
  );
  const row = rows[0];
  if (!row) {
    logger.warn({ msg: "plata_webhook_unresolved", subscriptionId });
    return;
  }
  await reconcileSubscription(pool, {
    user_id: row.user_id,
    subscription_id: subscriptionId,
  });
}

export interface PlataSyncResult {
  processed: number;
}

/** Швидкий тик: непідтверджені рядки, молодші за годину. */
export async function runFastTick(pool: Pool): Promise<PlataSyncResult> {
  const { rows } = await pool.query<PlataSubscriptionRow>(
    `SELECT user_id, subscription_id
       FROM plata_subscription
      WHERE confirmed_at IS NULL
        AND created_at > NOW() - make_interval(secs => $1)`,
    [FAST_WINDOW_MS / 1000],
  );
  for (const row of rows) await reconcileSubscription(pool, row);
  return { processed: rows.length };
}

/** Повільний тик: усі активні й past_due Plata-підписки. */
export async function runSlowTick(pool: Pool): Promise<PlataSyncResult> {
  const { rows } = await pool.query<PlataSubscriptionRow>(
    `SELECT ps.user_id, ps.subscription_id
       FROM plata_subscription ps
       JOIN subscriptions s ON s.user_id = ps.user_id AND s.provider = 'plata'
      WHERE s.status IN ('active', 'past_due')`,
  );
  for (const row of rows) await reconcileSubscription(pool, row);
  return { processed: rows.length };
}

export interface PlataSyncPollerOptions {
  pool: Pool;
  /** Інтервал швидкого тику (мс). Default 5 хв. */
  fastTickMs?: number;
  /** Інтервал повільного тику (мс). Default 24 год. */
  slowTickMs?: number;
  /** Явний enable. Default `env.PLATA_ENABLED`. */
  enabled?: boolean;
}

/** In-process поллер із двома таймерами. Idempotent start/stop, unref. */
export class PlataSyncPoller {
  private readonly pool: Pool;
  private readonly fastTickMs: number;
  private readonly slowTickMs: number;
  private readonly enabled: boolean;
  private fastTimer: NodeJS.Timeout | null = null;
  private slowTimer: NodeJS.Timeout | null = null;
  private runningFast = false;
  private runningSlow = false;
  private stopping = false;

  constructor(options: PlataSyncPollerOptions) {
    this.pool = options.pool;
    this.fastTickMs = options.fastTickMs ?? FAST_TICK_MS;
    this.slowTickMs = options.slowTickMs ?? SLOW_TICK_MS;
    this.enabled = options.enabled ?? env.PLATA_ENABLED;
  }

  start(): void {
    if (this.fastTimer || this.slowTimer) return;
    if (!this.enabled || this.fastTickMs <= 0 || this.slowTickMs <= 0) {
      logger.info({
        msg: "plata_sync_poller_disabled",
        enabled: this.enabled,
      });
      return;
    }
    logger.info({
      msg: "plata_sync_poller_started",
      fastTickMs: this.fastTickMs,
      slowTickMs: this.slowTickMs,
    });
    this.fastTimer = setInterval(() => {
      void this.runFast();
    }, this.fastTickMs);
    this.fastTimer.unref?.();
    this.slowTimer = setInterval(() => {
      void this.runSlow();
    }, this.slowTickMs);
    this.slowTimer.unref?.();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.fastTimer) {
      clearInterval(this.fastTimer);
      this.fastTimer = null;
    }
    if (this.slowTimer) {
      clearInterval(this.slowTimer);
      this.slowTimer = null;
    }
    while (this.runningFast || this.runningSlow) {
      await new Promise((r) => setTimeout(r, 20));
    }
    this.stopping = false;
    logger.info({ msg: "plata_sync_poller_stopped" });
  }

  async runFast(): Promise<PlataSyncResult> {
    if (this.runningFast || this.stopping) return { processed: 0 };
    this.runningFast = true;
    try {
      return await runFastTick(this.pool);
    } catch (err) {
      logger.error({
        msg: "plata_sync_fast_tick_failed",
        err: err instanceof Error ? err.message : String(err),
      });
      return { processed: 0 };
    } finally {
      this.runningFast = false;
    }
  }

  async runSlow(): Promise<PlataSyncResult> {
    if (this.runningSlow || this.stopping) return { processed: 0 };
    this.runningSlow = true;
    try {
      return await runSlowTick(this.pool);
    } catch (err) {
      logger.error({
        msg: "plata_sync_slow_tick_failed",
        err: err instanceof Error ? err.message : String(err),
      });
      return { processed: 0 };
    } finally {
      this.runningSlow = false;
    }
  }
}
