/**
 * Orchestrator for `/debug-window` and `/debug-window-status` Telegram
 * commands (PR-35 follow-up).
 *
 * Follows the same pure-runner pattern as `perf-runner.ts` — all server
 * calls are injected through `DebugWindowFetcher` so tests mock them without
 * spinning up grammy `Bot` / `Context` instances.
 *
 * Two entry-points:
 *   • `executeDebugWindowEnable`  — POST /api/internal/debug-window/enable
 *   • `executeDebugWindowStatus`  — GET  /api/internal/debug-window/status
 */

// ─────────────────────────────────────────────────────────────────────────
// Fetcher abstraction
// ─────────────────────────────────────────────────────────────────────────

export interface DebugWindowStatusResponse {
  level: string;
  remainingMs: number;
}

export interface DebugWindowEnableResponse {
  ok: boolean;
  remainingMs: number;
}

export interface DebugWindowFetcher {
  enable(input: { durationMs: number; requestedBy: string }): Promise<{
    ok: boolean;
    status: number;
    data: DebugWindowEnableResponse | null;
  }>;

  disable(): Promise<{ ok: boolean; status: number }>;

  status(): Promise<{
    ok: boolean;
    status: number;
    data: DebugWindowStatusResponse | null;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────

const DEFAULT_DURATION_MS = 15 * 60_000; // 15 minutes

/** Format remaining milliseconds as "Nm Ns" (e.g. "14м 32с"). */
function formatRemaining(ms: number): string {
  if (ms <= 0) return "0с";
  const totalSec = Math.round(ms / 1_000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  if (minutes === 0) return `${seconds}с`;
  return `${minutes}м ${seconds}с`;
}

/** Format the status reply for both enable-confirm and explicit /debug-window-status. */
export function formatDebugWindowStatus(
  level: string,
  remainingMs: number,
): string {
  if (remainingMs <= 0) {
    return `Рівень логів: <b>${level}</b>. Debug window не активна.`;
  }
  return (
    `Рівень логів: <b>${level}</b>. ` +
    `Debug window активна — залишилось ${formatRemaining(remainingMs)}.`
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Enable
// ─────────────────────────────────────────────────────────────────────────

export interface DebugWindowEnableDeps {
  founderUserId: string;
  founderTgUserId: number;
  /** Duration in ms, defaults to 15 min. */
  durationMs?: number;
  fetcher: DebugWindowFetcher;
}

export interface DebugWindowRunResult {
  reply: string;
  ok: boolean;
}

export async function executeDebugWindowEnable(
  deps: DebugWindowEnableDeps,
): Promise<DebugWindowRunResult> {
  const durationMs = deps.durationMs ?? DEFAULT_DURATION_MS;
  const requestedBy = `openclaw:${deps.founderTgUserId}`;

  const r = await deps.fetcher.enable({ durationMs, requestedBy });

  if (!r.ok || !r.data) {
    return {
      reply: `Не вдалось увімкнути debug window (HTTP ${r.status}).`,
      ok: false,
    };
  }

  const reply = formatDebugWindowStatus("debug", r.data.remainingMs);
  return { reply, ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Status
// ─────────────────────────────────────────────────────────────────────────

export interface DebugWindowStatusDeps {
  fetcher: DebugWindowFetcher;
}

export async function executeDebugWindowStatus(
  deps: DebugWindowStatusDeps,
): Promise<DebugWindowRunResult> {
  const r = await deps.fetcher.status();

  if (!r.ok || !r.data) {
    return {
      reply: `Не вдалось прочитати статус debug window (HTTP ${r.status}).`,
      ok: false,
    };
  }

  const reply = formatDebugWindowStatus(r.data.level, r.data.remainingMs);
  return { reply, ok: true };
}
