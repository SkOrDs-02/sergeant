/**
 * Multi-turn session state для OpenClaw DM-bot-а.
 *
 * Phase 1 — in-memory Map<userId, Session>. Прийнятно бо single-user
 * (`OPENCLAW_FOUNDER_TG_USER_ID`) і single-process (Railway worker
 * deployment). Phase 2 може мігрувати у Redis якщо колись буде >1
 * founder або multi-instance deployment — інтерфейс той самий.
 *
 * TTL: 30 хв idle. Якщо founder-а silent довше — починаємо новий
 * invocation (нова thread-у, без context-перенесення). Це не chat-bot,
 * це decision-helper; кожне рішення — нова сесія.
 */

const DEFAULT_TTL_MS = 30 * 60 * 1000;

export interface OpenClawSessionState {
  /** Telegram user.id founder-а. */
  userId: number;
  /** Останній invocation-id (для матчу assistant_response → row у audit-log). */
  lastInvocationId?: number;
  /** Лічильник turn-ів у поточній сесії — для observability. */
  turnCount: number;
  /** Останній tone-mode (для recovery після iteration_cap). */
  lastToneMode?: "diplomatic" | "direct";
  /** Timestamp останньої взаємодії. */
  updatedAt: number;
}

export class OpenClawSessionStore {
  private readonly map = new Map<number, OpenClawSessionState>();
  private readonly prunerInterval: ReturnType<typeof setInterval>;

  constructor(
    private readonly ttlMs = DEFAULT_TTL_MS,
    private readonly now = () => Date.now(),
  ) {
    this.prunerInterval = setInterval(() => {
      const current = this.now();
      for (const [k, v] of this.map) {
        if (current - v.updatedAt > this.ttlMs) this.map.delete(k);
      }
    }, this.ttlMs);
    if (typeof this.prunerInterval === "object") this.prunerInterval.unref();
  }

  dispose(): void {
    clearInterval(this.prunerInterval);
  }

  /** Повертає поточний state або створює новий. */
  getOrInit(userId: number): OpenClawSessionState {
    const current = this.map.get(userId);
    if (current && this.now() - current.updatedAt <= this.ttlMs) {
      return current;
    }
    const fresh: OpenClawSessionState = {
      userId,
      turnCount: 0,
      updatedAt: this.now(),
    };
    this.map.set(userId, fresh);
    return fresh;
  }

  /** Patch + bump updatedAt + bump turnCount. */
  recordTurn(
    userId: number,
    patch: Partial<Omit<OpenClawSessionState, "userId" | "updatedAt">>,
  ): OpenClawSessionState {
    const current = this.getOrInit(userId);
    const updated: OpenClawSessionState = {
      ...current,
      ...patch,
      turnCount: current.turnCount + 1,
      updatedAt: this.now(),
    };
    this.map.set(userId, updated);
    return updated;
  }

  /** Forget session (e.g. /reset command). */
  reset(userId: number): void {
    this.map.delete(userId);
  }
}
