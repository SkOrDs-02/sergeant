/**
 * PR-14 (48-plan) — Anthropic daily budget alert ($3 soft / $5 hard).
 *
 * Контракт:
 *   - Один раз на `ANTHROPIC_BUDGET_CHECK_INTERVAL_MS` (default 5 хв)
 *     рахуємо суму витрат на Anthropic за поточну **UTC**-добу:
 *     `currentCounter - dailyBaselineCounter` де `dailyBaselineCounter`
 *     — це snapshot `aiCostEstimateUsd{provider="anthropic"}` на
 *     початку поточної UTC-доби. Source-of-truth — Prometheus counter
 *     `ai_cost_estimate_usd_total` з PR-33 cost-monitoring (підтверджено
 *     merged 2026-05-06), а не `ai_usage_daily.est_cost_usd` (PR-12 ще
 *     не merged); це не блокує PR-14 — counter інкрементується у
 *     `lib/anthropic.ts::recordUsage` для всіх chat/coach/analyze
 *     endpoint-ів.
 *   - Поріг `soft` (default `$3`) → `Sentry.captureMessage(level="warning")`.
 *     Поріг `hard` (default `$5`) → `level="error"` + взводимо in-process
 *     `_hardBreached`-прапор. Не-критичні шляхи (mono enrichment,
 *     AI-memory ingest) можуть викликати `isAnthropicBudgetHardExceeded()`
 *     і самозатягнути горло, але AI-роути (`/api/chat`, voice, hubchat)
 *     лишаються відкритими — це alert, не circuit-breaker.
 *   - Idempotency: один alert на `(YYYY-MM-DD, threshold)`. KV-прапор
 *     зберігається у Redis (SET NX EX, TTL 36h щоб переживав DST-shift і
 *     розбіжності годинників) з фолбеком на in-memory `Set`, якщо Redis
 *     не сконфігурований (REDIS_URL=""). Анти-спам важливий, бо
 *     scheduler-tick кожні 5 хв инакше згенерує 288 однакових Sentry
 *     events за день після breach-у.
 *
 * Pattern мімікрує PR-05 (#2023): `aiQuotaCircuitBreaker.ts` теж викликає
 * `Sentry.captureMessage` всередині state-transition хука і не пропускає
 * exception назовні (fail-open: monitoring-збій ніколи не зупиняє сервіс).
 *
 * Чому окремий модуль, а не reuse Prometheus alert rule (як для Voyage у
 * `ops/prometheus/rules/voyage-cost.yml`): для Anthropic deployment-у
 * Prometheus → Alertmanager → Telegram ще не змонтований, а Sentry →
 * n8n WF-22 → Telegram pipeline вже live. Замість чекати на DevOps-роботу
 * — використовуємо існуючий transport.
 */

import { env } from "../env.js";
import { logger } from "./logger.js";
import { aiCostEstimateUsd } from "./metrics.js";
import { Sentry } from "../sentry.js";
import { getRedis } from "../lib/redis.js";

const ANTHROPIC_PROVIDER_LABEL = "anthropic";
const ALERT_FLAG_TTL_SECONDS = 36 * 60 * 60;
const ALERT_FLAG_KEY_PREFIX = "anthropic_budget_alert_v1";

export type AnthropicBudgetThreshold = "soft" | "hard";

export interface AnthropicBudgetGuardDeps {
  /** Source-of-time для тестів. Default — `Date.now`. */
  now?: () => number;
  /** Тестовий hook замість Sentry-captureMessage (для unit-тестів). */
  capture?: (input: AnthropicBudgetCaptureInput) => void;
  /**
   * Override Redis-клієнта (для тестів) щоб не залежати від `connectRedis()`-у.
   * `null` → forced in-memory fallback.
   */
  redis?: AnthropicBudgetRedisClient | null;
}

export interface AnthropicBudgetCaptureInput {
  threshold: AnthropicBudgetThreshold;
  spendUsd: number;
  thresholdUsd: number;
  day: string;
}

/**
 * Мінімальний інтерфейс Redis-клієнта, який треба guard-у. Не залежить
 * від конкретного типу `ioredis.Redis` — спрощує testing і дозволяє
 * пізніше підмінити upstash/keyv без caller-changes.
 */
export interface AnthropicBudgetRedisClient {
  set(
    key: string,
    value: string,
    mode: "EX",
    durationSeconds: number,
    nxFlag: "NX",
  ): Promise<"OK" | null>;
}

interface AnthropicBudgetState {
  /** UTC `YYYY-MM-DD` для якого ми тримаємо baseline. */
  day: string;
  /**
   * Значення counter-а на початок `day` (process-lifetime cumulative). На boot-і
   * процесу = 0, бо prom-client `Counter` виходить з module-init-у
   * зі станом «порожній hashMap, sum=0». Скидається на current-counter
   * при кожному UTC day-rollover, щоб відраховувати «спалене сьогодні»,
   * а не «спалене від початку процесу». При mid-day-restart-і база
   * «забуває» pre-restart spend в межах тих нескількох хвилин — fail-safe
   * бік (можемо втратити alert; не даємо false-positive).
   */
  dailyBaseline: number;
  /** In-memory backup, якщо Redis не сконфігурований. */
  firedAlerts: Set<string>;
  /** Чи перевищили hard поріг у поточному дні. Скидається на day-rollover. */
  hardBreached: boolean;
}

function utcDay(now: () => number): string {
  return new Date(now()).toISOString().slice(0, 10);
}

function makeFlagKey(day: string, threshold: AnthropicBudgetThreshold): string {
  return `${ALERT_FLAG_KEY_PREFIX}:${day}:${threshold}`;
}

/**
 * Окремий клас (а не модуль-singleton зі стейтом) щоб:
 *   1) тести створювали independent instance-и через `new` без global-reset;
 *   2) майбутні мульти-провайдер варіанти (Voyage, OpenAI) могли інстанціюватись
 *      по тому ж шаблону без копіювання boilerplate-у.
 *
 * Module-level singleton (`anthropicBudgetGuard`) — для production callsite-ів.
 */
export class AnthropicBudgetGuard {
  private readonly now: () => number;
  private readonly capture: (input: AnthropicBudgetCaptureInput) => void;
  private readonly redisOverride: AnthropicBudgetRedisClient | null | undefined;
  private state: AnthropicBudgetState;
  private timer: NodeJS.Timeout | null = null;

  constructor(deps: AnthropicBudgetGuardDeps = {}) {
    this.now = deps.now ?? Date.now;
    this.capture = deps.capture ?? defaultCapture;
    this.redisOverride = deps.redis;
    this.state = this.makeInitialState();
  }

  /**
   * Hard-breach throttle прапор для не-критичних шляхів (batch worker-ів,
   * AI-memory ingest-ів). Sync щоб не вимагати `await` у hot-path-і.
   * Скидається natural-ly на day-rollover у `runBudgetCheckTick()`.
   */
  isHardBreached(): boolean {
    // Sync-check — обережно: якщо rollover у цей момент відбудеться через
    // tick (async), state.hardBreached буде скинутий тоді. Sync-перевірка
    // тут просто читає last-known стан без await-у на rollover.
    if (utcDay(this.now) !== this.state.day) {
      // Day змінився — попередній breach уже неактуальний. Скидаємо лінько,
      // повний rollover відбудеться у наступному tick-у.
      this.state.hardBreached = false;
    }
    return this.state.hardBreached;
  }

  /**
   * Async tick: рахує today-spend, порівнює з порогами, кидає Sentry-події.
   * Fail-open — будь-яка помилка лишає alert-логіку у відомому стані
   * (counter інкременти продовжуються, breaker-stat-фактично не змінюється).
   *
   * Експортовано публічно (а не private + setInterval-only) щоб
   * admin-endpoint `/internal/budget/anthropic/tick` міг ручно запустити
   * перевірку (runbook-flow), і щоб тести не ганяли таймери.
   */
  async runBudgetCheckTick(): Promise<{
    spendUsd: number;
    softUsd: number;
    hardUsd: number;
    softFired: boolean;
    hardFired: boolean;
    day: string;
  }> {
    const softUsd = Number.isFinite(env.ANTHROPIC_BUDGET_SOFT_USD)
      ? env.ANTHROPIC_BUDGET_SOFT_USD
      : 0;
    const hardUsd = Number.isFinite(env.ANTHROPIC_BUDGET_HARD_USD)
      ? env.ANTHROPIC_BUDGET_HARD_USD
      : 0;

    await this.rolloverIfDayChanged();
    const day = this.state.day;

    let spendUsd = 0;
    try {
      spendUsd = await this.readTodaysSpendUsd();
    } catch (err) {
      logger.warn({
        msg: "anthropic_budget_read_spend_failed",
        err: err instanceof Error ? err.message : String(err),
      });
      return {
        spendUsd: 0,
        softUsd,
        hardUsd,
        softFired: false,
        hardFired: false,
        day,
      };
    }

    let softFired = false;
    let hardFired = false;

    // Hard перевіряємо ПЕРШИМ, бо якщо ми вже у hard — soft alert уже
    // не дає корисної інформації (Sentry-route однаковий, ще один
    // event тільки сплутає on-call). Тому при hard-firing виставляємо
    // soft-флаг також — заявляємо "soft вже неактуальний, не алертимо".
    if (hardUsd > 0 && spendUsd >= hardUsd) {
      hardFired = await this.fireOnce("hard", {
        spendUsd,
        thresholdUsd: hardUsd,
        day,
      });
      if (hardFired) {
        this.state.hardBreached = true;
      }
      // Заразом блокуємо soft на сьогодні щоб не дублювати.
      await this.markFlag(day, "soft");
    } else if (softUsd > 0 && spendUsd >= softUsd) {
      softFired = await this.fireOnce("soft", {
        spendUsd,
        thresholdUsd: softUsd,
        day,
      });
    }

    return { spendUsd, softUsd, hardUsd, softFired, hardFired, day };
  }

  /** Start setInterval-loop. Idempotent — повторні виклики no-op. */
  start(): void {
    if (this.timer) return;
    if (!env.ANTHROPIC_BUDGET_ALERT_ENABLED) {
      logger.info({
        msg: "anthropic_budget_guard_disabled",
        reason: "ANTHROPIC_BUDGET_ALERT_ENABLED=false",
      });
      return;
    }
    const intervalMs = env.ANTHROPIC_BUDGET_CHECK_INTERVAL_MS;
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      logger.warn({
        msg: "anthropic_budget_guard_invalid_interval",
        intervalMs,
      });
      return;
    }
    logger.info({
      msg: "anthropic_budget_guard_started",
      intervalMs,
      softUsd: env.ANTHROPIC_BUDGET_SOFT_USD,
      hardUsd: env.ANTHROPIC_BUDGET_HARD_USD,
    });
    this.timer = setInterval(() => {
      void this.runBudgetCheckTick().catch((err: unknown) => {
        logger.error({
          msg: "anthropic_budget_guard_tick_failed",
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }, intervalMs);
    // unref щоб не блокувати graceful shutdown — guard це best-effort
    // observability, не критичний шлях.
    this.timer.unref?.();
  }

  /** Stop loop. Idempotent. */
  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    logger.info({ msg: "anthropic_budget_guard_stopped" });
  }

  /** Test-only — скинути стан між it-блоками. */
  resetForTests(): void {
    this.stop();
    this.state = this.makeInitialState();
  }

  private makeInitialState(): AnthropicBudgetState {
    return {
      day: utcDay(this.now),
      // Counter є process-memory зі starting hashMap={}, сума = 0. При будь-якому
      // restart-і baseline=0 є правильним, бо всі прирости по цьому instance-у
      // відбуваються після бооту — є «спаленими в межах цього процесу». На
      // першому UTC day-rollover після boot-у baseline перевиставиться
      // на current counter value, і день-N буде правильно рахуватись.
      dailyBaseline: 0,
      firedAlerts: new Set<string>(),
      hardBreached: false,
    };
  }

  private async rolloverIfDayChanged(): Promise<void> {
    const today = utcDay(this.now);
    if (today === this.state.day) return;
    logger.info({
      msg: "anthropic_budget_guard_day_rollover",
      from: this.state.day,
      to: today,
    });
    this.state = {
      day: today,
      dailyBaseline: await this.readCounterSnapshot(),
      firedAlerts: new Set<string>(),
      hardBreached: false,
    };
  }

  /**
   * Sum counter-а тільки для `provider="anthropic"`. Чому sum-of-labels
   * замість conditional-фільтрації: counter має labels
   * `{provider, model, endpoint}` — Anthropic spend розкладений по
   * багатьох model×endpoint комбінаціях, і ми хочемо total за провайдером,
   * не «top model». `.get()` повертає `Promise<MetricObjectWithValues>`,
   * але prom-client-counter `.get()` synchronous → ми обгортаємо у
   * `Promise.resolve` для майбутньої compat-сумісності.
   */
  private async readTodaysSpendUsd(): Promise<number> {
    const current = await this.readCounterSnapshot();
    const delta = current - this.state.dailyBaseline;
    // Clamp щоб counter-reset (restart-window race) не дав від-ємний
    // spend і false-clear hardBreached. У такому разі рестартуємо
    // baseline на поточне значення — наступний tick рахуватиме правильно.
    if (delta < 0) {
      logger.warn({
        msg: "anthropic_budget_baseline_drift",
        baseline: this.state.dailyBaseline,
        current,
      });
      this.state.dailyBaseline = current;
      return 0;
    }
    return delta;
  }

  private async readCounterSnapshot(): Promise<number> {
    try {
      // `aiCostEstimateUsd.get()` повертає Promise з агрегованим snapshot-ом
      // (`{values: [{value, labels}]}`). У prom-client v15+ це Promise навіть
      // якщо реальна реалізація synchronous — щоб залишити open-door для
      // async-collector-ів. Тому await.
      const data = await aiCostEstimateUsd.get();
      const values = data?.values ?? [];
      let total = 0;
      for (const sample of values) {
        if (sample.labels["provider"] === ANTHROPIC_PROVIDER_LABEL) {
          total += sample.value;
        }
      }
      return total;
    } catch (err) {
      logger.warn({
        msg: "anthropic_budget_counter_read_failed",
        err: err instanceof Error ? err.message : String(err),
      });
      return 0;
    }
  }

  private async fireOnce(
    threshold: AnthropicBudgetThreshold,
    payload: { spendUsd: number; thresholdUsd: number; day: string },
  ): Promise<boolean> {
    const flagKey = makeFlagKey(payload.day, threshold);
    if (this.state.firedAlerts.has(flagKey)) return false;
    const ok = await this.markFlag(payload.day, threshold);
    if (!ok) return false;
    try {
      this.capture({
        threshold,
        spendUsd: payload.spendUsd,
        thresholdUsd: payload.thresholdUsd,
        day: payload.day,
      });
    } catch (err) {
      logger.warn({
        msg: "anthropic_budget_capture_failed",
        threshold,
        err: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  /**
   * Атомарно ставить (day, threshold)-прапор. У Redis — `SET NX EX 36h`,
   * у in-memory fallback — `Set.add`. Return:
   *   - `true` — прапор виставлений ВПЕРШЕ; caller повинен викликати alert.
   *   - `false` — вже стояв (інший pod / попередній tick цього процесу
   *     уже відстрелявся) ⇒ no-op.
   * Помилки Redis → fallback на in-memory: краще duplicate alert на
   * рестарті, ніж пропущений alert при transient-Redis-аварії.
   */
  private async markFlag(
    day: string,
    threshold: AnthropicBudgetThreshold,
  ): Promise<boolean> {
    const key = makeFlagKey(day, threshold);
    if (this.state.firedAlerts.has(key)) return false;

    const client = this.resolveRedisClient();
    if (client) {
      try {
        const result = await client.set(
          key,
          "1",
          "EX",
          ALERT_FLAG_TTL_SECONDS,
          "NX",
        );
        if (result === "OK") {
          this.state.firedAlerts.add(key);
          return true;
        }
        // Уже стояв у Redis (мульти-pod scenario). Локальний Set
        // оновлюємо щоб не stay-ганяти Redis на кожен tick цього процесу.
        this.state.firedAlerts.add(key);
        return false;
      } catch (err) {
        logger.warn({
          msg: "anthropic_budget_redis_flag_failed",
          err: err instanceof Error ? err.message : String(err),
        });
        // Fall-through до in-memory.
      }
    }
    this.state.firedAlerts.add(key);
    return true;
  }

  private resolveRedisClient(): AnthropicBudgetRedisClient | null {
    if (this.redisOverride !== undefined) return this.redisOverride;
    const client = getRedis();
    if (!client) return null;
    // Адаптуємо ioredis-клієнт під наш мінімальний інтерфейс через
    // wrapper-функцію — це безпечніше за double-cast, бо TS перевірить
    // signature виклику `.set(...)` на real ioredis-Redis-і. Якщо
    // upstream API change-не — typecheck впаде тут, а не в run-time.
    return {
      async set(key, value, mode, ttlSeconds, nxFlag): Promise<"OK" | null> {
        const result = await client.set(key, value, mode, ttlSeconds, nxFlag);
        return result;
      },
    };
  }
}

function defaultCapture(input: AnthropicBudgetCaptureInput): void {
  const isHard = input.threshold === "hard";
  const level = isHard ? "error" : "warning";
  const message = isHard
    ? `anthropic_budget_hard_alert: spend $${input.spendUsd.toFixed(2)} ≥ $${input.thresholdUsd.toFixed(2)} (day ${input.day})`
    : `anthropic_budget_soft_alert: spend $${input.spendUsd.toFixed(2)} ≥ $${input.thresholdUsd.toFixed(2)} (day ${input.day})`;
  try {
    Sentry.captureMessage(message, {
      level,
      tags: {
        module: "obs",
        op: "anthropic_budget_alert",
        threshold: input.threshold,
        provider: ANTHROPIC_PROVIDER_LABEL,
      },
      extra: {
        spendUsd: input.spendUsd,
        thresholdUsd: input.thresholdUsd,
        day: input.day,
      },
    });
  } catch (err) {
    logger.warn({
      msg: "anthropic_budget_sentry_capture_failed",
      err: err instanceof Error ? err.message : String(err),
    });
  }
  logger.info({
    msg: isHard ? "anthropic_budget_hard_alert" : "anthropic_budget_soft_alert",
    spendUsd: input.spendUsd,
    thresholdUsd: input.thresholdUsd,
    day: input.day,
  });
}

/** Production singleton — використовується у `index.ts` startup-у. */
export const anthropicBudgetGuard = new AnthropicBudgetGuard();

/** Sync helper для не-критичних callsite-ів. */
export function isAnthropicBudgetHardExceeded(): boolean {
  return anthropicBudgetGuard.isHardBreached();
}
