import { env } from "../../env.js";
import { logger } from "../../obs/logger.js";
import {
  aiQuotaCircuitOpenTotal,
  circuitBreakerState,
  circuitBreakerTripsTotal,
} from "../../obs/metrics.js";
import { Sentry } from "../../sentry.js";
import { CircuitState, CircuitOpenError } from "../../lib/circuitBreaker.js";
import {
  getDbErrorCount,
  recordDbError,
  resetDbErrorWindow,
} from "./aiQuotaHealth.js";

export { CircuitState, CircuitOpenError };

/**
 * AI-quota DB circuit-breaker (PR-04 у 180-day плані).
 *
 * Контракт:
 *   - У стані `CLOSED` aiQuota працює як раніше: DB-помилки реєструються
 *     у sliding-window-counter (PR-03). Якщо в `windowMs` накопичилось
 *     ≥ `threshold` помилок — breaker переходить у `OPEN`.
 *   - У `OPEN` aiQuota.assertAiQuota / consumeToolQuota fail-CLOSED:
 *     відмовляють у запиті з кодом `AI_QUOTA_DB_DOWN` замість fail-open.
 *     Так уникаємо лавини AI-викликів, поки DB-сховище недоступне
 *     (рятуємо Anthropic-budget і не дозволяємо безквотовий burst).
 *   - Через `openDurationMs` breaker сам пробує `HALF_OPEN` — перший
 *     запит стає probe. Успіх → `CLOSED`. Невдача → знову `OPEN`.
 *
 * Окремий клас (а не reuse `lib/circuitBreaker.ts`) тому, що:
 *   1) контракт failure-критерію — sliding-window-rate, а не "N
 *      consecutive failures" (як generic `execute(fn)`-обгортка);
 *   2) AI-quota хендлер сам розрулює fail-open / fail-closed і не
 *      хоче, щоб breaker кидав exceptions замість HTTP-відповіді.
 *
 * Перейменування в Prometheus: одна `circuit_breaker_state` /
 * `circuit_breaker_trips_total` — `name="ai_quota"`.
 */
export const AI_QUOTA_BREAKER_NAME = "ai_quota";

const STATE_NAMES = ["closed", "open", "half-open"] as const;

export interface AiQuotaCircuitBreakerOptions {
  /** Скільки DB-помилок у `windowMs` відкривають breaker. */
  threshold?: number;
  /** Вікно sliding-window-counter (ms). */
  windowMs?: number;
  /** Як довго breaker лишається у `OPEN` до HALF-OPEN-probe (ms). */
  openDurationMs?: number;
  /** Hook для тестів / SRE-інтеграцій (PR-05 викличе Sentry-капчу). */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
  /** Source-of-time для тестів (default — Date.now). */
  now?: () => number;
}

export class AiQuotaCircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private openedAt = 0;
  private readonly name = AI_QUOTA_BREAKER_NAME;
  private readonly threshold: number;
  private readonly windowMs: number;
  private readonly openDurationMs: number;
  private readonly onStateChange?: (
    from: CircuitState,
    to: CircuitState,
  ) => void;
  private readonly now: () => number;

  constructor(opts: AiQuotaCircuitBreakerOptions = {}) {
    this.threshold = opts.threshold ?? env.AI_QUOTA_CIRCUIT_THRESHOLD;
    this.windowMs = opts.windowMs ?? env.AI_QUOTA_CIRCUIT_WINDOW_MS;
    this.openDurationMs = opts.openDurationMs ?? env.AI_QUOTA_CIRCUIT_OPEN_MS;
    if (opts.onStateChange) this.onStateChange = opts.onStateChange;
    this.now = opts.now ?? Date.now;
    this.updateMetrics();
  }

  /**
   * Пускати запит чи ні. Single-source-of-truth для виклика-перевірки —
   * лізе у time-based перехід `OPEN → HALF_OPEN` ліниво, без таймера.
   */
  isAllowing(): boolean {
    if (this.threshold <= 0) return true; // kill-switch: breaker disabled
    if (this.state === CircuitState.OPEN) {
      if (this.now() - this.openedAt >= this.openDurationMs) {
        this.transitionTo(CircuitState.HALF_OPEN);
        return true; // дозволяємо probe-запит
      }
      return false;
    }
    return true;
  }

  /**
   * Зафіксувати DB-помилку. Може відкрити breaker (якщо threshold
   * перевищено) або переоткрити з `HALF_OPEN`.
   */
  recordFailure(err?: unknown): void {
    if (this.threshold <= 0) return;
    recordDbError(err, this.windowMs);
    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
      return;
    }
    if (this.state === CircuitState.CLOSED) {
      const count = getDbErrorCount(this.windowMs);
      if (count >= this.threshold) this.transitionTo(CircuitState.OPEN);
    }
  }

  /**
   * Зафіксувати успіх. У `HALF_OPEN` достатньо одного успіху, щоб
   * закритися — це дешеве `INSERT … ON CONFLICT` повертає достовірний
   * sigchk DB-сховища.
   */
  recordSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.CLOSED);
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  /** Скільки ms лишилося до HALF-OPEN-probe (0 якщо breaker не open). */
  getRetryAfterMs(): number {
    if (this.state !== CircuitState.OPEN) return 0;
    const elapsed = this.now() - this.openedAt;
    return Math.max(0, this.openDurationMs - elapsed);
  }

  /** Force CLOSED — для ручного recovery (operator runbook) і тестів. */
  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
  }

  getStats(): {
    name: string;
    state: (typeof STATE_NAMES)[number];
    openedAt: number;
    threshold: number;
    windowMs: number;
    openDurationMs: number;
  } {
    return {
      name: this.name,
      state: STATE_NAMES[this.state],
      openedAt: this.openedAt,
      threshold: this.threshold,
      windowMs: this.windowMs,
      openDurationMs: this.openDurationMs,
    };
  }

  private transitionTo(next: CircuitState): void {
    const prev = this.state;
    if (prev === next) return;

    this.state = next;
    if (next === CircuitState.OPEN) {
      this.openedAt = this.now();
    }
    if (next === CircuitState.CLOSED) {
      // sliding-window більше не потрібен — recovery is clean.
      resetDbErrorWindow();
      this.openedAt = 0;
    }

    logger.info({
      msg: "ai_quota_circuit_transition",
      name: this.name,
      from: STATE_NAMES[prev],
      to: STATE_NAMES[next],
      openDurationMs:
        next === CircuitState.OPEN ? this.openDurationMs : undefined,
    });

    try {
      circuitBreakerTripsTotal.inc({
        name: this.name,
        from: STATE_NAMES[prev],
        to: STATE_NAMES[next],
      });
    } catch {
      /* metrics never break breaker */
    }
    if (next === CircuitState.OPEN) {
      try {
        aiQuotaCircuitOpenTotal.inc({ from: STATE_NAMES[prev] });
      } catch {
        /* metrics never break breaker */
      }
      // PR-05 — Sentry alert. Single capture per OPEN-trip; we deliberately
      // do NOT capture during HALF-OPEN→OPEN flap differently — Sentry
      // group-by-message will fold flap-storms into one issue, while the
      // `from` tag still tells SRE whether it's a fresh outage or recovery
      // failure. `level=error` so this routes to the on-call channel.
      try {
        Sentry.captureMessage(
          `AI-quota DB circuit-breaker opened (${STATE_NAMES[prev]}→open)`,
          {
            level: "error",
            tags: {
              module: "chat",
              op: "ai_quota_circuit_open",
              breaker: this.name,
              from: STATE_NAMES[prev],
            },
            extra: {
              threshold: this.threshold,
              windowMs: this.windowMs,
              openDurationMs: this.openDurationMs,
            },
          },
        );
      } catch (e) {
        logger.warn({
          msg: "ai_quota_circuit_sentry_capture_failed",
          err: { message: (e as Error)?.message || String(e) },
        });
      }
    }
    this.updateMetrics();
    try {
      this.onStateChange?.(prev, next);
    } catch (e) {
      logger.warn({
        msg: "ai_quota_circuit_callback_failed",
        err: { message: (e as Error)?.message || String(e) },
      });
    }
  }

  private updateMetrics(): void {
    try {
      circuitBreakerState.set({ name: this.name }, this.state);
    } catch {
      /* ignore */
    }
  }
}

/** Singleton, який споживає aiQuota.ts. */
export const aiQuotaCircuitBreaker = new AiQuotaCircuitBreaker();
