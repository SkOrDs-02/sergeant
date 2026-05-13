/**
 * Orchestrator для `/mute` slash-command-у.
 *
 * Lifecycle (mirror to `ritual-runner.ts` / `status-runner.ts`):
 *   parse → emit-breadcrumb → open audit-row (для duration/off/status) →
 *   fetcher call (set/clear/status) → render-reply → finalize audit-row.
 *
 * `help` і `unknown` гілки — no audit-row (consistent з `/ritual` help):
 * help не змінює state і не цікавить telemetry; unknown — warn-level
 * breadcrumb для debug-у.
 *
 * Critical-override НЕ живе тут — runner лише виставляє/знімає mute-row.
 * Сам gate-check (severity=P0 bypass) — на server-side у
 * `apps/server/src/routes/internal/alerts.ts` (`POST /alerts/send`).
 */

import {
  computeExpiryFromDuration,
  formatMuteEndpointFailure,
  formatMuteOffReply,
  formatMuteSetReply,
  formatMuteStatusActive,
  formatMuteStatusInactive,
  MUTE_HELP_TEXT,
  parseMuteCommand,
  type MuteDuration,
  type MuteSubcommand,
  type ParsedMuteCommand,
} from "./mute-format.js";

/**
 * Repräsentація відповіді `/api/internal/openclaw/mute/status` —
 * `{state: MuteState | null}`. Mirror з `apps/server/.../mute-state.ts`
 * (тримаємо як свій інтерфейс, щоб уникнути circular-dep monorepo
 * cross-app imports).
 */
export interface MuteStateView {
  founderUserId: string;
  mutedUntilIso: string | null;
  setAtIso: string;
  reason: string | null;
}

export interface MuteFetcher {
  /** Set mute (`/mute <duration>`). */
  postMuteSet(input: {
    founderUserId: string;
    mutedUntilIso: string;
    reason: string | null;
  }): Promise<{ ok: boolean; status: number; data: MuteStateView | null }>;
  /** Clear mute (`/mute off`). */
  postMuteClear(input: {
    founderUserId: string;
  }): Promise<{ ok: boolean; status: number; data: MuteStateView | null }>;
  /** Read mute state (`/mute status`). */
  postMuteStatus(input: { founderUserId: string }): Promise<{
    ok: boolean;
    status: number;
    data: { state: MuteStateView | null } | null;
  }>;
  /** Audit-row open. */
  openInvocation(input: {
    founderUserId: string;
    founderTgUserId: number;
    trigger: "dm";
    userMessage: string;
    metadata: Record<string, unknown>;
  }): Promise<{ ok: boolean; status: number; invocationId: number | null }>;
  /** Audit-row finalize. */
  finalizeInvocation(input: {
    invocationId: number;
    status: "success" | "error";
    assistantResponse: string | null;
    errorMessage: string | null;
  }): Promise<{ ok: boolean; status: number }>;
}

export type MuteBreadcrumbFn = (breadcrumb: {
  category: string;
  message: string;
  level: "info" | "warning" | "error";
  data?: Record<string, unknown>;
}) => void;

export interface MuteRunnerDeps {
  rawArgument: string;
  founderUserId: string;
  founderTgUserId: number;
  telegramChatId?: number;
  fetcher: MuteFetcher;
  addBreadcrumb?: MuteBreadcrumbFn;
  /** Override `now` for deterministic tests. */
  now?: Date;
}

export interface MuteRunResult {
  reply: string;
  subcommand: MuteSubcommand;
  invocationId: number | null;
  ok: boolean;
}

const DURATION_TOKENS: ReadonlySet<MuteSubcommand> = new Set<MuteSubcommand>([
  "30m",
  "1h",
  "4h",
  "8h",
  "until-morning",
]);

function isDuration(s: MuteSubcommand): s is MuteDuration {
  return DURATION_TOKENS.has(s);
}

export async function executeMuteCommand(
  deps: MuteRunnerDeps,
): Promise<MuteRunResult> {
  const parsed = parseMuteCommand(deps.rawArgument);
  const emitBreadcrumb = deps.addBreadcrumb ?? (() => undefined);
  const now = deps.now ?? new Date();
  const userMessage = `/mute ${parsed.rawArgument || "help"}`.trim();

  // ─── help (no audit, no fetcher call) ──────────────────────────────
  if (parsed.subcommand === "help") {
    emitBreadcrumb({
      category: "openclaw.mute",
      message: "mute.help",
      level: "info",
      data: { rawArgument: parsed.rawArgument },
    });
    return {
      reply: MUTE_HELP_TEXT,
      subcommand: "help",
      invocationId: null,
      ok: true,
    };
  }

  // ─── unknown (no audit, warn breadcrumb) ──────────────────────────
  if (parsed.subcommand === "unknown") {
    emitBreadcrumb({
      category: "openclaw.mute",
      message: "mute.unknown_subcommand",
      level: "warning",
      data: { rawArgument: parsed.rawArgument },
    });
    return {
      reply: `${parsed.error ?? "Невідома підкоманда."}\n\n${MUTE_HELP_TEXT}`,
      subcommand: "unknown",
      invocationId: null,
      ok: false,
    };
  }

  // ─── audit-row open (duration / off / status) ─────────────────────
  const subcommand: MuteSubcommand = parsed.subcommand;
  emitBreadcrumb({
    category: "openclaw.mute",
    message: `mute.${subcommand}.start`,
    level: "info",
    data: {
      subcommand,
      founderTgUserId: deps.founderTgUserId,
      telegramChatId: deps.telegramChatId ?? null,
    },
  });
  const openRes = await deps.fetcher.openInvocation({
    founderUserId: deps.founderUserId,
    founderTgUserId: deps.founderTgUserId,
    trigger: "dm",
    userMessage,
    metadata: {
      telegramChatId: deps.telegramChatId ?? null,
      slashCommand: "/mute",
      subcommand,
    },
  });
  const invocationId = openRes.invocationId;

  // ─── status (read-only) ───────────────────────────────────────────
  if (subcommand === "status") {
    const statusRes = await deps.fetcher.postMuteStatus({
      founderUserId: deps.founderUserId,
    });
    if (!statusRes.ok || !statusRes.data) {
      const reply = formatMuteEndpointFailure(statusRes.status);
      if (invocationId != null) {
        await deps.fetcher.finalizeInvocation({
          invocationId,
          status: "error",
          assistantResponse: reply,
          errorMessage: `mute/status HTTP ${statusRes.status}`,
        });
      }
      emitBreadcrumb({
        category: "openclaw.mute",
        message: "mute.status.endpoint_failed",
        level: "error",
        data: { httpStatus: statusRes.status },
      });
      return { reply, subcommand, invocationId, ok: false };
    }
    const state = statusRes.data.state;
    const reply =
      state && state.mutedUntilIso && new Date(state.mutedUntilIso) > now
        ? formatMuteStatusActive(state.mutedUntilIso, state.reason, now)
        : formatMuteStatusInactive();
    if (invocationId != null) {
      await deps.fetcher.finalizeInvocation({
        invocationId,
        status: "success",
        assistantResponse: reply,
        errorMessage: null,
      });
    }
    return { reply, subcommand, invocationId, ok: true };
  }

  // ─── off (clear mute) ─────────────────────────────────────────────
  if (subcommand === "off") {
    const clearRes = await deps.fetcher.postMuteClear({
      founderUserId: deps.founderUserId,
    });
    if (!clearRes.ok) {
      const reply = formatMuteEndpointFailure(clearRes.status);
      if (invocationId != null) {
        await deps.fetcher.finalizeInvocation({
          invocationId,
          status: "error",
          assistantResponse: reply,
          errorMessage: `mute/clear HTTP ${clearRes.status}`,
        });
      }
      emitBreadcrumb({
        category: "openclaw.mute",
        message: "mute.off.endpoint_failed",
        level: "error",
        data: { httpStatus: clearRes.status },
      });
      return { reply, subcommand, invocationId, ok: false };
    }
    const reply = formatMuteOffReply();
    if (invocationId != null) {
      await deps.fetcher.finalizeInvocation({
        invocationId,
        status: "success",
        assistantResponse: reply,
        errorMessage: null,
      });
    }
    emitBreadcrumb({
      category: "openclaw.mute",
      message: "mute.off.success",
      level: "info",
    });
    return { reply, subcommand, invocationId, ok: true };
  }

  // ─── duration (set mute) ──────────────────────────────────────────
  if (isDuration(subcommand)) {
    const expiry = computeExpiryFromDuration(subcommand, now);
    const expiryIso = expiry.toISOString();
    const setRes = await deps.fetcher.postMuteSet({
      founderUserId: deps.founderUserId,
      mutedUntilIso: expiryIso,
      reason: null,
    });
    if (!setRes.ok) {
      const reply = formatMuteEndpointFailure(setRes.status);
      if (invocationId != null) {
        await deps.fetcher.finalizeInvocation({
          invocationId,
          status: "error",
          assistantResponse: reply,
          errorMessage: `mute/set HTTP ${setRes.status}`,
        });
      }
      emitBreadcrumb({
        category: "openclaw.mute",
        message: `mute.${subcommand}.endpoint_failed`,
        level: "error",
        data: { httpStatus: setRes.status, expiryIso },
      });
      return { reply, subcommand, invocationId, ok: false };
    }
    const reply = formatMuteSetReply(subcommand, expiryIso, now);
    if (invocationId != null) {
      await deps.fetcher.finalizeInvocation({
        invocationId,
        status: "success",
        assistantResponse: reply,
        errorMessage: null,
      });
    }
    emitBreadcrumb({
      category: "openclaw.mute",
      message: `mute.${subcommand}.success`,
      level: "info",
      data: { expiryIso },
    });
    return { reply, subcommand, invocationId, ok: true };
  }

  // ─── unreachable (compile-time exhaustive) ────────────────────────
  // `subcommand: never` would be a noisy assignment; runtime fallback
  // here keeps TS happy without introducing a dead binding.
  return {
    reply: MUTE_HELP_TEXT,
    subcommand: "unknown",
    invocationId,
    ok: false,
  };
}

export type { ParsedMuteCommand };
