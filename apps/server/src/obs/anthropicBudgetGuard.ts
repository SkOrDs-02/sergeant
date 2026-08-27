/**
 * PR-14 (48-plan) — Anthropic daily budget alert ($3 soft / $5 hard).
 *
 * Контракт:
 *   - Один раз на `ANTHROPIC_BUDGET_CHECK_INTERVAL_MS` (default 5 хв)
 *     читаємо суму витрат за поточну **київську** добу з
 *     `ai_usage_daily` (`subject_key = 'provider:anthropic'`), беручи
 *     `COALESCE(actual_cost_usd, est_cost_usd)` — факт списання, якщо
 *     шлюз його повернув, інакше оцінка за прайс-таблицею.
 *
 *     ── Чому не Prometheus-лічильник (як було до 2026-08-07) ──────────
 *
 *     Початкова версія рахувала `currentCounter - dailyBaseline` по
 *     `aiCostEstimateUsd{provider="anthropic"}`. Усередині одного процесу
 *     це правильно, але лічильник живе в його памʼяті: після рестарту
 *     `baseline = 0` і поточне значення теж 0, тобто **денна стеля
 *     починалась заново з кожного деплою**. Деплоїв тут кілька на добу
 *     (`deploy-api.yml` тригериться на `apps/server/**`), тож фактична
 *     стеля дорівнювала `$HARD × кількість рестартів`. Гірше того:
 *     `hardBreached` теж скидався, знімаючи вже ввімкнену деградацію, а
 *     прапорці ідемпотентності алертів лежать у Redis і рестарт
 *     переживають — тому друге пробиття тієї ж доби було ще й тихим.
 *
 *     Коментар вище колись пояснював вибір тим, що «`ai_usage_daily`
 *     (PR-12) ще не merged». PR-12 давно в main (міграція 059), а з
 *     2026-08-07 у леджер пише й нативний OpenRouter-шлях — тобто
 *     таблиця нарешті покриває ті самі виклики, що й лічильник.
 *
 *     ── Чому київська доба, а не UTC ──────────────────────────────────
 *
 *     Тут стояла помітка «UTC intentional — vendor billing day boundary».
 *     Вона поступається практиці: `ai_usage_daily.usage_day` агрегує по
 *     київській добі (`toLocalISODate`), окремих таймстемпів у таблиці
 *     немає, тож із неї UTC-добу не відновити. Для стелі безпеки це
 *     обмін неістотний — вона захищає від «спалили забагато за день», а
 *     не звіряє рахунок вендора; зсув межі на 3 години цього не міняє.
 *     Натомість збіг із рештою фінансових періодів (domain invariant —
 *     Europe/Kyiv) робить число зіставним із cost-дашбордом.
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

import { toLocalISODate } from "@sergeant/shared";

import { env } from "../env.js";
import { logger } from "./logger.js";
import { Sentry } from "../sentry.js";
import pool from "../db.js";
import { ANTHROPIC_PROVIDER_SUBJECT } from "../lib/anthropicUsageStore.js";
import { getRedis } from "../lib/redis.js";

/**
 * Тег `provider` у Sentry-алерті. Як і скрізь у цій схемі, позначає ПУЛ
 * витрат, а не вендора: під ним лежать і моделі шлюзу.
 */
const ANTHROPIC_PROVIDER_LABEL = "anthropic";
const ALERT_FLAG_TTL_SECONDS = 36 * 60 * 60;
const ALERT_FLAG_KEY_PREFIX = "anthropic_budget_alert_v1";

/**
 * Денна витрата за київську добу `day` з persistent-леджера.
 *
 * `COALESCE(actual_cost_usd, est_cost_usd)` стоїть **на рядку**, а не на
 * сумі: в одній добі співіснують виклики, за які шлюз повернув факт, і ті,
 * де є лише оцінка. Сума з `COALESCE` зовні взяла б одне з двох для всієї
 * доби й загубила б половину.
 *
 * `pg` віддає `NUMERIC` рядком, тож приводимо явно — мовчазний
 * `"12.5" > 15` порівнював би рядки, а не числа.
 */
export async function readSpendFromLedger(day: string): Promise<number> {
  const { rows } = await pool.query<{ usd: string | null }>(
    `SELECT COALESCE(SUM(COALESCE(actual_cost_usd, est_cost_usd)), 0)::text AS usd
       FROM ai_usage_daily
      WHERE subject_key = $1
        AND usage_day = $2::date`,
    [ANTHROPIC_PROVIDER_SUBJECT, day],
  );
  const parsed = Number(rows[0]?.usd ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type AnthropicBudgetThreshold = "soft" | "hard" | "monthly";

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
  /**
   * Override монтлі-envelope (USD) для тестів. Default читає
   * `env.ANTHROPIC_MONTHLY_BUDGET_USD` (за замовчуванням `0` = projection
   * вимкнено). Винесено в dep, бо env читається at-load і не змінюється
   * без рестарту.
   */
  monthlyBudgetUsd?: () => number;
  /**
   * Джерело денної витрати. Default — `ai_usage_daily`. Винесено в dep,
   * щоб тести задавали суму напряму й не тягнули за собою Postgres:
   * предмет цих тестів — пороги й ідемпотентність алертів, а не SQL.
   */
  readSpendUsd?: (day: string) => Promise<number>;
}

export interface AnthropicBudgetCaptureInput {
  threshold: AnthropicBudgetThreshold;
  /** Денний spend (soft/hard) або today-spend (monthly projection). */
  spendUsd: number;
  /** Поріг: daily soft/hard USD, або monthly-envelope USD для projection. */
  thresholdUsd: number;
  /** `YYYY-MM-DD` для soft/hard; `YYYY-MM` для monthly. */
  day: string;
  /** Лише monthly: спроєктований місячний spend (`today × днів-у-місяці`). */
  projectedUsd?: number;
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
  /** Київський `YYYY-MM-DD`, за який зараз рахуємо. */
  day: string;
  /** In-memory backup, якщо Redis не сконфігурований. */
  firedAlerts: Set<string>;
  /** Чи перевищили hard поріг у поточному дні. Скидається на day-rollover. */
  hardBreached: boolean;
}

/**
 * Київський день — той самий ключ, під яким `anthropicUsageStore` пише
 * `usage_day`. Розійтись їм не можна: інакше гвард щодня читав би порожній
 * рядок і мовчав. Обґрунтування переходу з UTC — у шапці модуля.
 */
function spendDay(now: () => number): string {
  return toLocalISODate(new Date(now()));
}

function makeFlagKey(day: string, threshold: AnthropicBudgetThreshold): string {
  return `${ALERT_FLAG_KEY_PREFIX}:${day}:${threshold}`;
}

/** `YYYY-MM` поточної київської доби (monthly idempotency key). */
function spendMonth(now: () => number): string {
  return spendDay(now).slice(0, 7);
}

/** Скільки днів у місяці поточної київської доби (projection: today × днів). */
function daysInSpendMonth(now: () => number): number {
  const [y, m] = spendDay(now).split("-").map(Number);
  // `Date.UTC(y, m, 0)` — нульовий день наступного місяця, тобто останній
  // день поточного. `m` тут уже 1-based, тож зсув на -1 не потрібен.
  return new Date(Date.UTC(y ?? 1970, m ?? 1, 0)).getUTCDate();
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
  private readonly monthlyBudgetUsd: () => number;
  private readonly readSpendUsd: (day: string) => Promise<number>;
  private state: AnthropicBudgetState;
  private timer: NodeJS.Timeout | null = null;

  constructor(deps: AnthropicBudgetGuardDeps = {}) {
    this.now = deps.now ?? Date.now;
    this.capture = deps.capture ?? defaultCapture;
    this.redisOverride = deps.redis;
    this.monthlyBudgetUsd =
      deps.monthlyBudgetUsd ?? (() => env.ANTHROPIC_MONTHLY_BUDGET_USD);
    this.readSpendUsd = deps.readSpendUsd ?? readSpendFromLedger;
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
    if (spendDay(this.now) !== this.state.day) {
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
    monthlyFired: boolean;
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
        monthlyFired: false,
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

    // Monthly projection — окрема гілка (не залежить від soft/hard). Run-rate
    // `today × днів-у-місяці` ≥ envelope → 1 warning на місяць. Це краща за
    // фіксований денний поріг відповідь на «ліміт замалий на масштабі»: alert
    // привʼязаний до фактичного run-rate, тож не false-fire-ить, поки місячна
    // проекція реально не загрожує envelope-у.
    const monthlyFired = await this.fireMonthlyProjectionIfNeeded(spendUsd);

    return {
      spendUsd,
      softUsd,
      hardUsd,
      softFired,
      hardFired,
      monthlyFired,
      day,
    };
  }

  /**
   * Спроєктувати місячний spend з today-run-rate і fire-нути warning раз на
   * місяць, якщо проекція ≥ `ANTHROPIC_MONTHLY_BUDGET_USD`. Дзеркалить
   * `modules/ai-memory/voyageBudget.ts` (Voyage monthly projection). Вимкнено,
   * коли envelope `<= 0` або today-spend `<= 0`. Idempotency key — `YYYY-MM`
   * (переживає day-rollover, бо `rolloverIfDayChanged` зберігає `:monthly`).
   */
  private async fireMonthlyProjectionIfNeeded(
    todaySpendUsd: number,
  ): Promise<boolean> {
    const monthly = this.monthlyBudgetUsd();
    if (!Number.isFinite(monthly) || monthly <= 0 || todaySpendUsd <= 0) {
      return false;
    }
    const daysInMonth = daysInSpendMonth(this.now);
    const projected = todaySpendUsd * daysInMonth;
    if (projected < monthly) return false;
    const monthKey = spendMonth(this.now);
    return this.fireOnce("monthly", {
      spendUsd: todaySpendUsd,
      thresholdUsd: monthly,
      day: monthKey,
      projectedUsd: projected,
    });
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
      day: spendDay(this.now),
      firedAlerts: new Set<string>(),
      hardBreached: false,
    };
  }

  private async rolloverIfDayChanged(): Promise<void> {
    const today = spendDay(this.now);
    if (today === this.state.day) return;
    logger.info({
      msg: "anthropic_budget_guard_day_rollover",
      from: this.state.day,
      to: today,
    });
    // Зберігаємо `:monthly`-ключі через day-rollover, інакше monthly
    // projection re-fire-нувся б щодня (1×/день замість 1×/місяць). Daily
    // soft/hard-ключі скидаємо — новий день, нові пороги. (Дзеркалить
    // prune-логіку Voyage monthly projection.)
    const carriedMonthly = new Set<string>();
    for (const key of this.state.firedAlerts) {
      if (key.endsWith(":monthly")) carriedMonthly.add(key);
    }
    this.state = {
      day: today,
      firedAlerts: carriedMonthly,
      hardBreached: false,
    };
  }

  /**
   * Витрата за поточну добу. Читається цілком, а не як приріст від
   * baseline-у — тому рестарт процесу на неї не впливає. Кидає далі: у
   * `evaluateOnce` є catch, який на збій читання повертає «нічого не
   * спрацювало» і чекає наступного тіку. Fail-open навмисний — збій
   * моніторингу не має ані блокувати виклики, ані вигадувати алерт.
   */
  private async readTodaysSpendUsd(): Promise<number> {
    const spend = await this.readSpendUsd(this.state.day);
    // Відʼємне тут означало б зіпсований леджер, а не нульову витрату;
    // clamp лишає гвард у робочому стані, а слід — у логах.
    if (!(spend >= 0)) {
      logger.warn({ msg: "anthropic_budget_negative_spend", spend });
      return 0;
    }
    return spend;
  }

  private async fireOnce(
    threshold: AnthropicBudgetThreshold,
    payload: {
      spendUsd: number;
      thresholdUsd: number;
      day: string;
      projectedUsd?: number;
    },
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
        ...(payload.projectedUsd !== undefined
          ? { projectedUsd: payload.projectedUsd }
          : {}),
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
          this.flagTtlSeconds(threshold),
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

  /**
   * TTL Redis-прапора за threshold-ом. Daily (soft/hard) → 36h (переживає
   * DST/clock-skew у межах доби). Monthly → **до кінця поточного UTC-місяця
   * + 36h буфер**, інакше спільний 36h-TTL прострочився б усередині місяця і
   * на іншому поді / після рестарту (порожній in-memory `firedAlerts`)
   * monthly projection стрельнув би вдруге. Місячний ключ — `YYYY-MM`, тож
   * наступний місяць однаково отримує свіжий ключ.
   */
  private flagTtlSeconds(threshold: AnthropicBudgetThreshold): number {
    if (threshold !== "monthly") return ALERT_FLAG_TTL_SECONDS;
    const nowMs = this.now();
    const d = new Date(nowMs);
    const startOfNextMonthMs = Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth() + 1,
      1,
      0,
      0,
      0,
      0,
    );
    const untilMonthEnd = Math.ceil((startOfNextMonthMs - nowMs) / 1000);
    return Math.max(untilMonthEnd, 0) + ALERT_FLAG_TTL_SECONDS;
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
  const isMonthly = input.threshold === "monthly";
  // Monthly projection — warning-level (як soft): сигнал «run-rate загрожує
  // місячному envelope-у», не критичний breach.
  const level = isHard ? "error" : "warning";
  const message = isMonthly
    ? `anthropic_budget_monthly_projection: projected $${(input.projectedUsd ?? 0).toFixed(2)} ≥ $${input.thresholdUsd.toFixed(2)} (today $${input.spendUsd.toFixed(4)}, month ${input.day})`
    : isHard
      ? `anthropic_budget_hard_alert: spend $${input.spendUsd.toFixed(2)} ≥ $${input.thresholdUsd.toFixed(2)} (day ${input.day})`
      : `anthropic_budget_soft_alert: spend $${input.spendUsd.toFixed(2)} ≥ $${input.thresholdUsd.toFixed(2)} (day ${input.day})`;
  try {
    Sentry.captureMessage(message, {
      level,
      tags: {
        module: "obs",
        op: isMonthly
          ? "anthropic_monthly_projection_alert"
          : "anthropic_budget_alert",
        threshold: input.threshold,
        provider: ANTHROPIC_PROVIDER_LABEL,
        ...(isMonthly
          ? { error_signature: "anthropic-monthly-budget-projection" }
          : {}),
      },
      extra: {
        spendUsd: input.spendUsd,
        thresholdUsd: input.thresholdUsd,
        day: input.day,
        ...(input.projectedUsd !== undefined
          ? { projectedUsd: input.projectedUsd }
          : {}),
      },
    });
  } catch (err) {
    logger.warn({
      msg: "anthropic_budget_sentry_capture_failed",
      err: err instanceof Error ? err.message : String(err),
    });
  }
  logger.info({
    msg: isMonthly
      ? "anthropic_budget_monthly_projection_alert"
      : isHard
        ? "anthropic_budget_hard_alert"
        : "anthropic_budget_soft_alert",
    spendUsd: input.spendUsd,
    thresholdUsd: input.thresholdUsd,
    day: input.day,
    ...(input.projectedUsd !== undefined
      ? { projectedUsd: input.projectedUsd }
      : {}),
  });
}

/** Production singleton — використовується у `index.ts` startup-у. */
export const anthropicBudgetGuard = new AnthropicBudgetGuard();

/** Sync helper для не-критичних callsite-ів. */
export function isAnthropicBudgetHardExceeded(): boolean {
  return anthropicBudgetGuard.isHardBreached();
}
