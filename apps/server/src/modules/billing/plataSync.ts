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
 *   - **повільний тик** (щогодини, модель «кому вже час») — `active`/
 *     `past_due` підписки, яких не звіряли понад 24 год
 *     (`plata_subscription.updated_at`; його проставляє кожна успішна
 *     звірка). Ловить `past_due`-грейс і дунінг-цикл довше години. Це НЕ
 *     24-годинний таймер процесу: контейнер рестартує на кожен деплой, і
 *     такий таймер ніколи б не спрацював (аудит 2026-10-01, rel-19) —
 *     годинний тік + стартовий тік із затримкою переживають рестарти.
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
import {
  billingRecurringChargeTotal,
  plataSyncLastSuccessTimestampSeconds,
} from "../../obs/metrics.js";
import {
  resolveStartupDelayMs,
  scheduleStartupTick,
} from "../../lib/pollerStartupTick.js";
import { MONOPAY_BASE, getPlataToken as getToken } from "./plataRemote.js";
import {
  findSupersededRecurrence,
  recordSupersededRecurrence,
  settleSupersededRecurrence,
  type PreviousRecurrence,
} from "./supersede.js";

// `plata.ts` імпортує з цього модуля (`reconcileBySubscriptionId`), тож
// спільні `getToken`/`MONOPAY_BASE` живуть у листку `plataRemote.ts`, а не в
// `plata.ts`: так між двома файлами не виникає циклічного import-у.

const FAST_TICK_MS = 5 * 60 * 1000;
/**
 * Як часто питати «кому вже час». Не частота звірки однієї підписки: та
 * визначається порогом `updated_at < NOW() - INTERVAL '24 hours'` у
 * {@link runSlowTick}.
 */
const SLOW_TICK_MS = 60 * 60 * 1000;
const FAST_WINDOW_MS = 60 * 60 * 1000;
/** Як довго повільний тік ще перезвіряє непідтверджений checkout (див. runSlowTick). */
const UNCONFIRMED_LOOKBACK_DAYS = 3;
const GRACE_DAYS = 3;
const ACTIVE_STATUSES = new Set(["active"]);

/**
 * ISO-час останнього успішного тіку ЦЬОГО процесу (module-level, як у
 * `GdprCleanupPoller`: `/health/workers` читає статус без доступу до
 * інстансу поллера). `null` після рестарту до першого успіху - очікувано.
 */
let lastFastRunAtIso: string | null = null;
let lastSlowRunAtIso: string | null = null;

/**
 * Snapshot для `/health/workers` (rel-19). Без нього факт «повільна звірка
 * не виконувалась тиждень» було не видно ніде, а саме вона продовжує
 * `current_period_end` і ставить `past_due`, коли вебхук загубився. Без БД:
 * стан лише в пам'яті процесу, тож `errorCode` тут не буває.
 */
export interface PlataSyncWorkerStatus {
  enabled: boolean;
  /** Інтервал повільного тіку («кому вже час»). */
  intervalMs: number;
  /** ISO-час останнього успішного повільного тіку; null до першого. */
  lastRunAt: string | null;
  fastIntervalMs: number;
  lastFastRunAt: string | null;
}

export function getPlataSyncWorkerStatus(): PlataSyncWorkerStatus {
  return {
    enabled: env.PLATA_ENABLED,
    intervalMs: SLOW_TICK_MS,
    lastRunAt: lastSlowRunAtIso,
    fastIntervalMs: FAST_TICK_MS,
    lastFastRunAt: lastFastRunAtIso,
  };
}

/** Для тестів: скидає module-level мітки останніх тіків. */
export const __testingResetPlataLastRunAt = (): void => {
  lastFastRunAtIso = null;
  lastSlowRunAtIso = null;
};

function markTickSucceeded(tick: "fast" | "slow"): void {
  const now = new Date();
  if (tick === "fast") lastFastRunAtIso = now.toISOString();
  else lastSlowRunAtIso = now.toISOString();
  plataSyncLastSuccessTimestampSeconds.set({ tick }, now.getTime() / 1000);
}

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
  // Одна транзакція: якщо в користувача вже є ІНША жива рекурентка (інший
  // провайдер чи інший subscriptionId Plata), намір скасувати її пишеться в
  // ту саму транзакцію, а сам виклик провайдера йде ПІСЛЯ COMMIT і активацію
  // не відкочує: підписка оплачена, а стара могла вже бути мертвою (аудит
  // data-21, supersede.ts).
  let toCancel: PreviousRecurrence | null = null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const previous = await findSupersededRecurrence(client, row.user_id, {
      provider: "plata",
      subscriptionId: row.subscription_id,
    });
    await client.query(
      `UPDATE plata_subscription
          SET confirmed_at = COALESCE(confirmed_at, NOW()), updated_at = NOW()
        WHERE subscription_id = $1`,
      [row.subscription_id],
    );
    // `cancel_at_period_end` скидаємо, коли `provider_subscription_id`
    // змінився: прапорець належав СТАРІЙ підписці (аудит data-20). Той самий
    // id (поновлення) прапорець зберігає - скасована підписка не оживає.
    await client.query(
      `INSERT INTO subscriptions
         (user_id, provider, plan, status, provider_subscription_id, current_period_end)
       VALUES ($1, 'plata', 'pro', 'active', $2, $3)
       ON CONFLICT (user_id) WHERE status IN ('active', 'trialing', 'past_due') DO UPDATE SET
         plan = 'pro',
         status = 'active',
         cancel_at_period_end = CASE
           WHEN subscriptions.provider = 'plata'
            AND subscriptions.provider_subscription_id IS NOT DISTINCT FROM
                EXCLUDED.provider_subscription_id
           THEN subscriptions.cancel_at_period_end
           ELSE FALSE
         END,
         provider = 'plata',
         provider_subscription_id = EXCLUDED.provider_subscription_id,
         current_period_end = EXCLUDED.current_period_end,
         updated_at = NOW()`,
      [row.user_id, row.subscription_id, nextChargeDate],
    );
    if (previous) {
      toCancel = await recordSupersededRecurrence(
        client,
        row.user_id,
        previous,
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore rollback error */
    }
    throw err;
  } finally {
    client.release();
  }
  if (toCancel) await settleSupersededRecurrence(pool, toCancel);
  billingRecurringChargeTotal.inc({ provider: "plata", result: "charged" });
}

/**
 * Грейс — рівно один раз за цикл: якщо `current_period_end` уже в
 * майбутньому (попередній грейс ще не спливов), дату не зсуваємо вдруге.
 * Read-then-write (не одна CASE-UPDATE) навмисно: звірка сама read-only й
 * ідемпотентна (не рухає гроші), тож гонки тут нема — а два прогони з
 * ідентичним DB-станом дають ідентичний результат.
 *
 * Кілька plata-рядків у одного юзера — норма: скасовані нікуди не діваються
 * (частковий унікальний індекс `subscriptions_user_active_idx` стереже лише
 * активний набір). Тому і SELECT, і обидва UPDATE фільтрують саме той рядок,
 * що зараз тримає ентайтлмент. Без фільтра дунінг бив по ВСІХ рядках юзера і
 * давав одне з двох: або воскрешав скасований рядок у `past_due` (для
 * `getUserPlan` = активний доступ), або штовхав два рядки одночасно в
 * частковий унікальний індекс → 23505, який `reconcileSubscription` ковтає
 * своїм catch — і дунінг тихо не застосовувався взагалі.
 */
async function applyPastDue(
  pool: Pool,
  userId: string,
  subscriptionId: string,
): Promise<void> {
  // Скоуп - ЛИШЕ рядок, що тримає саме цю підписку: у користувача може бути
  // кілька plata-підписок (1:N, data-21), і невдача НЕоплаченого другого
  // checkout-у не має переводити в дунінг живу першу.
  const { rows } = await pool.query<{
    current_period_end: Date | string | null;
  }>(
    `SELECT current_period_end FROM subscriptions
      WHERE user_id = $1 AND provider = 'plata'
        AND provider_subscription_id = $2
        AND status IN ('active', 'trialing', 'past_due')
      ORDER BY updated_at DESC
      LIMIT 1`,
    [userId, subscriptionId],
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
        WHERE user_id = $1 AND provider = 'plata'
          AND provider_subscription_id = $2
          AND status IN ('active', 'trialing', 'past_due')`,
      [userId, subscriptionId],
    );
  } else {
    const graceUntil = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000);
    await pool.query(
      `UPDATE subscriptions
          SET status = 'past_due', current_period_end = $3, updated_at = NOW()
        WHERE user_id = $1 AND provider = 'plata'
          AND provider_subscription_id = $2
          AND status IN ('active', 'trialing', 'past_due')`,
      [userId, subscriptionId, graceUntil],
    );
  }
  billingRecurringChargeTotal.inc({ provider: "plata", result: "past_due" });
}

/**
 * Позначити, що `subscription/status` успішно прочитано й застосовано, -
 * незалежно від гілки (active / past_due / невідомий статус). Годинний
 * повільний тик за цим штампом вирішує, кому вже час (rel-19), тож без
 * нього невідомий статус перезвірявся б щогодини. Викликається ЛИШЕ після
 * успішної відповіді й застосування: якщо fetch чи запис впали, штампа
 * немає і рядок буде перезвірено наступним годинним тіком.
 */
async function markReconciled(
  pool: Pool,
  subscriptionId: string,
): Promise<void> {
  await pool.query(
    `UPDATE plata_subscription SET updated_at = NOW() WHERE subscription_id = $1`,
    [subscriptionId],
  );
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
      await applyPastDue(pool, row.user_id, row.subscription_id);
      await markReconciled(pool, row.subscription_id);
      return;
    }
    if (statusResp.status && ACTIVE_STATUSES.has(statusResp.status)) {
      await applyActive(pool, row, statusResp);
      await markReconciled(pool, row.subscription_id);
      return;
    }
    // Невідомий/порожній статус, без ознаки невдачі — безпечний дефолт:
    // нічого не міняємо (spec § Ризики).
    logger.info({
      msg: "plata_sync_unknown_status",
      subscriptionId: row.subscription_id,
      status: statusResp.status ?? null,
    });
    await markReconciled(pool, row.subscription_id);
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
  const { rows } = await pool.query<{
    user_id: string;
    superseded_at: Date | string | null;
  }>(
    `SELECT user_id, superseded_at FROM plata_subscription WHERE subscription_id = $1`,
    [subscriptionId],
  );
  const row = rows[0];
  if (!row) {
    logger.warn({ msg: "plata_webhook_unresolved", subscriptionId });
    return;
  }
  // Підписку ми самі скасували як замінену новою: вона не має ані
  // активуватись, ані переоцінюватись (monobank міг ще показувати `active`).
  if (row.superseded_at) {
    logger.info({ msg: "plata_webhook_superseded_ignored", subscriptionId });
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
        AND superseded_at IS NULL
        AND created_at > NOW() - make_interval(secs => $1)`,
    [FAST_WINDOW_MS / 1000],
  );
  for (const row of rows) await reconcileSubscription(pool, row);
  return { processed: rows.length };
}

/**
 * Повільний тик, модель «кому вже час»: активні й past_due Plata-підписки,
 * яких не звіряли понад 24 год. Штамп - `plata_subscription.updated_at`
 * (ставить `markReconciled`/`applyActive`), тому тік можна запускати
 * щогодини й після кожного рестарту: свіжозвірені рядки він пропускає.
 *
 * Друга гілка - ОПЛАЧЕНІ, але непідтверджені checkout-и поза вікном
 * швидкого тіку (`confirmed_at IS NULL`, старші за годину, молодші за
 * {@link UNCONFIRMED_LOOKBACK_DAYS}). Без неї підписка B, яку не вдалось
 * активувати за першу годину (monobank віддав 5xx на `subscription/status`,
 * процес перезапустили), лишалась би сиротою: у `subscriptions` тримається
 * інший рядок, джойн першої гілки B не бачить, а гроші вже списуються.
 * Покинуті (неоплачені) checkout-и теж потрапляють сюди, але лише на цей
 * термін; їх відсікає сам `subscription/status`, а `superseded_at` знімає
 * вже замінені.
 */
export async function runSlowTick(pool: Pool): Promise<PlataSyncResult> {
  const { rows } = await pool.query<PlataSubscriptionRow>(
    `SELECT ps.user_id, ps.subscription_id
       FROM plata_subscription ps
       JOIN subscriptions s
         ON s.user_id = ps.user_id
        AND s.provider = 'plata'
        AND s.provider_subscription_id = ps.subscription_id
      WHERE s.status IN ('active', 'past_due')
        AND ps.superseded_at IS NULL
        AND ps.updated_at < NOW() - INTERVAL '24 hours'
     UNION
     SELECT ps.user_id, ps.subscription_id
       FROM plata_subscription ps
      WHERE ps.confirmed_at IS NULL
        AND ps.superseded_at IS NULL
        AND ps.created_at <= NOW() - make_interval(secs => $1)
        AND ps.created_at > NOW() - make_interval(days => $2)`,
    [FAST_WINDOW_MS / 1000, UNCONFIRMED_LOOKBACK_DAYS],
  );
  for (const row of rows) await reconcileSubscription(pool, row);
  return { processed: rows.length };
}

export interface PlataSyncPollerOptions {
  pool: Pool;
  /** Інтервал швидкого тику (мс). Default 5 хв. */
  fastTickMs?: number;
  /**
   * Інтервал повільного тику (мс) - як часто питати «кому вже час».
   * Default 1 год; поріг давності звірки (24 год) зашитий у SQL.
   */
  slowTickMs?: number;
  /**
   * Затримка одноразового стартового тіку (мс). Default - jitter 30-90 с;
   * 0 або від'ємне вимикає (rel-19).
   */
  startDelayMs?: number | undefined;
  /** Явний enable. Default `env.PLATA_ENABLED`. */
  enabled?: boolean;
}

/** In-process поллер із двома таймерами. Idempotent start/stop, unref. */
export class PlataSyncPoller {
  private readonly pool: Pool;
  private readonly fastTickMs: number;
  private readonly slowTickMs: number;
  private readonly enabled: boolean;
  private readonly startDelayMs: number;
  private fastTimer: NodeJS.Timeout | null = null;
  private slowTimer: NodeJS.Timeout | null = null;
  private startTimer: NodeJS.Timeout | null = null;
  private runningFast = false;
  private runningSlow = false;
  private stopping = false;

  constructor(options: PlataSyncPollerOptions) {
    this.pool = options.pool;
    this.fastTickMs = options.fastTickMs ?? FAST_TICK_MS;
    this.slowTickMs = options.slowTickMs ?? SLOW_TICK_MS;
    this.enabled = options.enabled ?? env.PLATA_ENABLED;
    this.startDelayMs = resolveStartupDelayMs(options.startDelayMs);
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
    // Засів gauge часом старту (див. `plataSyncLastSuccessTimestampSeconds`):
    // інакше поллер, що падає з першого тіку, не мав би серії й не алертив.
    const startedAtSec = Date.now() / 1000;
    if (lastFastRunAtIso === null) {
      plataSyncLastSuccessTimestampSeconds.set({ tick: "fast" }, startedAtSec);
    }
    if (lastSlowRunAtIso === null) {
      plataSyncLastSuccessTimestampSeconds.set({ tick: "slow" }, startedAtSec);
    }
    this.fastTimer = setInterval(() => {
      void this.runFast();
    }, this.fastTickMs);
    this.fastTimer.unref?.();
    this.slowTimer = setInterval(() => {
      void this.runSlow();
    }, this.slowTickMs);
    this.slowTimer.unref?.();
    // Одноразовий стартовий тік (rel-19): інтервали рахуються від старту
    // процесу, а контейнер рестартує на кожен деплой. Slow-тік сам відсіює
    // свіжозвірених, тож зайвого навантаження на monobank немає.
    this.startTimer = scheduleStartupTick(
      this.startDelayMs,
      () => Promise.all([this.runFast(), this.runSlow()]),
      (err) => {
        logger.error({
          msg: "plata_sync_startup_tick_failed",
          err: err instanceof Error ? err.message : String(err),
        });
      },
    );
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.startTimer) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }
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
      const result = await runFastTick(this.pool);
      markTickSucceeded("fast");
      return result;
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
      const result = await runSlowTick(this.pool);
      markTickSucceeded("slow");
      return result;
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
