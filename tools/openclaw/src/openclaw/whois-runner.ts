/**
 * Orchestrator для `/openclaw whois <tg_id|@username>`.
 *
 * Lifecycle: parseWhoisArg → audit-open → POST `/whois` → render →
 * audit-finalize. Усі external dependencies injected через
 * `WhoisRunnerDeps` — handler-shim лишається тонким (grammy-wiring +
 * env), а pure-lifecycle тестується без `Bot`/`Context`.
 *
 * Audit-rows пишемо у `openclaw_invocations` тим самим pair endpoint-ів,
 * що `/openclaw status` / `/ritual` / `/mute`. `metadata.slashCommand =
 * "/openclaw"`, `metadata.subcommand = "whois"`. Trigger завжди `dm`.
 *
 * Sentry breadcrumb-и під category `openclaw.whois.*`.
 */

import {
  formatWhoisEndpointFailure,
  formatWhoisSnapshot,
  parseWhoisArg,
  WHOIS_HELP_TEXT,
  type ParsedWhoisArg,
  type WhoisSnapshot,
} from "./whois-format.js";

// ─────────────────────────────────────────────────────────────────────────
// Fetcher abstraction
// ─────────────────────────────────────────────────────────────────────────

/**
 * Сирий response від `/api/internal/openclaw/whois`. Mirrored від
 * `WhoisResult` у `apps/server/src/modules/openclaw/whois.ts`.
 *
 * Поле `muteState` має DB-rendered shape (`founderUserId` обов'язковий
 * у server-side, але client-side не використовує — приймаємо
 * `unknown`-сумісну форму, що містить тільки нашу 3-key view).
 */
export interface WhoisAggregatorResponse {
  tgUserId: number;
  resolvedFrom: "numeric" | "username";
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  inAllowlist: boolean;
  isFounder: boolean;
  invocations7d: number;
  lastSeenIso: string | null;
  topTools: Array<{ tool: string; count: number }>;
  muteState: {
    mutedUntilIso: string | null;
    setAtIso: string;
    reason: string | null;
  } | null;
  telegramError: {
    code: "forbidden" | "rate_limit" | "api_error" | "not_found";
    message: string;
    retryAfter?: number;
  } | null;
}

export interface WhoisFetcher {
  postWhoisLookup(input: {
    founderUserId: string;
    founderTgUserId: number;
    tgUserId?: number;
    username?: string;
  }): Promise<{
    ok: boolean;
    status: number;
    data: WhoisAggregatorResponse | null;
  }>;
  openInvocation(input: {
    founderUserId: string;
    founderTgUserId: number;
    trigger: "dm";
    userMessage: string;
    metadata: Record<string, unknown>;
  }): Promise<{ ok: boolean; status: number; invocationId: number | null }>;
  finalizeInvocation(input: {
    invocationId: number;
    status: "success" | "error";
    assistantResponse: string | null;
    errorMessage: string | null;
  }): Promise<{ ok: boolean; status: number }>;
}

export type WhoisBreadcrumbFn = (breadcrumb: {
  category: string;
  message: string;
  level: "info" | "warning" | "error";
  data?: Record<string, unknown>;
}) => void;

export interface WhoisRunnerDeps {
  /**
   * Сирий argument після `/openclaw whois` (тобто або те, що
   * `parseOpenclawCommand` залишив у `whoisArgs`, або raw user-input).
   */
  rawArgument: string;
  founderUserId: string;
  founderTgUserId: number;
  telegramChatId?: number;
  fetcher: WhoisFetcher;
  addBreadcrumb?: WhoisBreadcrumbFn;
  /** Override `now` для deterministic тестів. */
  now?: () => Date;
}

export interface WhoisRunResult {
  reply: string;
  /** Літерал `"whois"` для зручного match-у у handler-тестах. */
  subcommand: "whois";
  invocationId: number | null;
  ok: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────────────────

export async function executeOpenclawWhoisCommand(
  deps: WhoisRunnerDeps,
): Promise<WhoisRunResult> {
  const parsed: ParsedWhoisArg = parseWhoisArg(deps.rawArgument);
  const emit = deps.addBreadcrumb ?? (() => undefined);
  const nowFn = deps.now ?? (() => new Date());

  // ─── Fast paths без audit-row ─────────────────────────────────────
  if (parsed.kind === "missing") {
    emit({
      category: "openclaw.whois",
      message: "whois.help",
      level: "info",
      data: { rawArgument: deps.rawArgument },
    });
    return {
      reply: `${parsed.error ?? "Очікую аргумент."}\n\n${WHOIS_HELP_TEXT}`,
      subcommand: "whois",
      invocationId: null,
      ok: false,
    };
  }
  if (parsed.kind === "invalid") {
    emit({
      category: "openclaw.whois",
      message: "whois.invalid_arg",
      level: "warning",
      data: { rawArgument: deps.rawArgument },
    });
    return {
      reply: `${parsed.error ?? "Невалідний аргумент."}\n\n${WHOIS_HELP_TEXT}`,
      subcommand: "whois",
      invocationId: null,
      ok: false,
    };
  }

  // ─── Audit-open ───────────────────────────────────────────────────
  const userMessage = `/openclaw whois ${parsed.value}`;
  emit({
    category: "openclaw.whois",
    message: "whois.start",
    level: "info",
    data: {
      argKind: parsed.kind,
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
      slashCommand: "/openclaw",
      subcommand: "whois",
      argKind: parsed.kind,
    },
  });
  const invocationId = openRes.invocationId;

  // ─── Aggregator call ──────────────────────────────────────────────
  const lookupArgs: Parameters<WhoisFetcher["postWhoisLookup"]>[0] = {
    founderUserId: deps.founderUserId,
    founderTgUserId: deps.founderTgUserId,
    ...(parsed.kind === "numeric"
      ? { tgUserId: Number(parsed.value) }
      : { username: parsed.value }),
  };
  const lookupRes = await deps.fetcher.postWhoisLookup(lookupArgs);

  if (!lookupRes.ok || !lookupRes.data) {
    const reply = formatWhoisEndpointFailure(
      lookupRes.status,
      `whois aggregator failed`,
    );
    if (invocationId != null) {
      await deps.fetcher.finalizeInvocation({
        invocationId,
        status: "error",
        assistantResponse: reply,
        errorMessage: `whois HTTP ${lookupRes.status}`,
      });
    }
    emit({
      category: "openclaw.whois",
      message: "whois.endpoint_failed",
      level: "error",
      data: { httpStatus: lookupRes.status, argKind: parsed.kind },
    });
    return { reply, subcommand: "whois", invocationId, ok: false };
  }

  // ─── Render + audit-finalize ──────────────────────────────────────
  const snapshot: WhoisSnapshot = {
    tgUserId: lookupRes.data.tgUserId,
    resolvedFrom: lookupRes.data.resolvedFrom,
    username: lookupRes.data.username,
    firstName: lookupRes.data.firstName,
    lastName: lookupRes.data.lastName,
    inAllowlist: lookupRes.data.inAllowlist,
    isFounder: lookupRes.data.isFounder,
    invocations7d: lookupRes.data.invocations7d,
    lastSeenIso: lookupRes.data.lastSeenIso,
    topTools: lookupRes.data.topTools,
    muteState: lookupRes.data.muteState
      ? {
          mutedUntilIso: lookupRes.data.muteState.mutedUntilIso,
          setAtIso: lookupRes.data.muteState.setAtIso,
          reason: lookupRes.data.muteState.reason,
        }
      : null,
    telegramError: lookupRes.data.telegramError,
  };
  const reply = formatWhoisSnapshot(snapshot, nowFn());
  if (invocationId != null) {
    await deps.fetcher.finalizeInvocation({
      invocationId,
      status: "success",
      assistantResponse: reply,
      errorMessage: null,
    });
  }
  emit({
    category: "openclaw.whois",
    message: "whois.success",
    level: "info",
    data: {
      argKind: parsed.kind,
      resolvedFrom: snapshot.resolvedFrom,
      isFounder: snapshot.isFounder,
      invocations7d: snapshot.invocations7d,
      telegramErrorCode: snapshot.telegramError?.code ?? null,
    },
  });
  return { reply, subcommand: "whois", invocationId, ok: true };
}
