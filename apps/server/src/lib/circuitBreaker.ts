import { logger } from "../obs/logger.js";
import { env } from "../env.js";
import {
  circuitBreakerState,
  circuitBreakerTripsTotal,
} from "../obs/metrics.js";

/**
 * Circuit Breaker States
 */
export enum CircuitState {
  CLOSED = 0, // Normal operation, requests pass through
  OPEN = 1, // Circuit is open, requests fail fast
  HALF_OPEN = 2, // Testing if service is healthy
}

export interface CircuitBreakerOptions {
  /** Name for logging/metrics */
  name: string;
  /** Number of failures before opening circuit */
  threshold?: number;
  /** Time in ms before trying half-open state */
  resetTimeoutMs?: number;
  /** Number of successful requests in half-open to close circuit */
  successThreshold?: number;
  /** Optional callback when state changes */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

/**
 * Circuit Breaker implementation for external service calls.
 *
 * States:
 * - CLOSED: Normal operation. Failures increment counter.
 * - OPEN: All calls fail immediately. After resetTimeout, moves to HALF_OPEN.
 * - HALF_OPEN: Limited calls allowed. Success closes circuit, failure reopens.
 *
 * Usage:
 * ```ts
 * const breaker = new CircuitBreaker({ name: "anthropic" });
 *
 * async function callAnthropic() {
 *   return breaker.execute(async () => {
 *     return await anthropicClient.messages.create(...);
 *   });
 * }
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private readonly name: string;
  private readonly threshold: number;
  private readonly resetTimeoutMs: number;
  private readonly successThreshold: number;
  private readonly onStateChange?: (
    from: CircuitState,
    to: CircuitState,
  ) => void;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.threshold = options.threshold ?? env.AI_CIRCUIT_BREAKER_THRESHOLD;
    this.resetTimeoutMs =
      options.resetTimeoutMs ?? env.AI_CIRCUIT_BREAKER_RESET_MS;
    this.successThreshold = options.successThreshold ?? 2;
    this.onStateChange = options.onStateChange;

    // Initialize metrics
    this.updateMetrics();
  }

  /**
   * Execute a function through the circuit breaker.
   * Throws CircuitOpenError if circuit is open.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should move from OPEN to HALF_OPEN
    if (this.state === CircuitState.OPEN) {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure >= this.resetTimeoutMs) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        throw new CircuitOpenError(
          this.name,
          this.resetTimeoutMs - timeSinceFailure,
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Record a successful call.
   */
  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success
      this.failures = 0;
    }
  }

  /**
   * Record a failed call.
   */
  private onFailure(): void {
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open reopens the circuit
      this.transitionTo(CircuitState.OPEN);
    } else if (this.state === CircuitState.CLOSED) {
      this.failures++;
      if (this.failures >= this.threshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    }
  }

  /**
   * Transition to a new state.
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    if (oldState === newState) return;

    this.state = newState;
    this.failures = 0;
    this.successes = 0;

    const stateNames = ["closed", "open", "half-open"] as const;

    logger.info({
      msg: "circuit_breaker_transition",
      name: this.name,
      from: stateNames[oldState],
      to: stateNames[newState],
    });

    try {
      circuitBreakerTripsTotal.inc({
        name: this.name,
        from: stateNames[oldState],
        to: stateNames[newState],
      });
    } catch {
      /* ignore metric errors */
    }

    this.updateMetrics();
    this.onStateChange?.(oldState, newState);
  }

  /**
   * Update Prometheus gauge for current state.
   */
  private updateMetrics(): void {
    try {
      circuitBreakerState.set({ name: this.name }, this.state);
    } catch {
      /* ignore metric errors */
    }
  }

  /**
   * Get current circuit state.
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Check if circuit is allowing requests.
   */
  isAllowing(): boolean {
    if (this.state === CircuitState.OPEN) {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      return timeSinceFailure >= this.resetTimeoutMs;
    }
    return true;
  }

  /**
   * Force circuit to closed state (manual recovery).
   */
  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
  }

  /**
   * Get circuit breaker statistics.
   */
  getStats() {
    return {
      name: this.name,
      state: ["closed", "open", "half-open"][this.state],
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      timeSinceLastFailure: this.lastFailureTime
        ? Date.now() - this.lastFailureTime
        : null,
    };
  }
}

/**
 * Error thrown when circuit is open and call is rejected.
 */
export class CircuitOpenError extends Error {
  readonly code = "CIRCUIT_OPEN";
  readonly retryAfterMs: number;

  constructor(circuitName: string, retryAfterMs: number) {
    super(
      `Circuit breaker "${circuitName}" is open. Retry after ${retryAfterMs}ms.`,
    );
    this.name = "CircuitOpenError";
    this.retryAfterMs = retryAfterMs;
  }
}

// ───────────────────────── Shared Instances ─────────────────────────

/**
 * Circuit breaker for Anthropic API calls.
 */
export const anthropicCircuitBreaker = new CircuitBreaker({
  name: "anthropic",
  threshold: env.AI_CIRCUIT_BREAKER_THRESHOLD,
  resetTimeoutMs: env.AI_CIRCUIT_BREAKER_RESET_MS,
  successThreshold: 2,
});
