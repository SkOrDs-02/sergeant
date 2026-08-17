import { z } from "zod";
import { env } from "../../env/env.js";
import { logger } from "../../obs/logger.js";
import { recordExternalHttp } from "../../lib/externalHttp.js";
import { elapsedMs, isAbortError, sleep } from "../../lib/timing.js";

/**
 * Minimal JSON-RPC 2.0 client over MCP "streamable HTTP" — see spec
 * `docs/90-work/planning/specs/silpo-mcp-integration.md` § Рішення
 * дизайну ("Мінімальний власний MCP-клієнт без нових залежностей"). We
 * need 5–7 tools, not the whole protocol, so this hand-rolls exactly the
 * `initialize` → `tools/call` handshake instead of pulling in
 * `@modelcontextprotocol/sdk`.
 *
 * PROVISIONAL (spike §0 not run yet): the exact response envelope —
 * whether `mcp.silpo.ua` replies `application/json` or `text/event-stream`,
 * whether a session survives across requests via `Mcp-Session-Id`, the
 * real tool result shapes — is unverified. Every zod schema passed in by a
 * caller MUST use `.passthrough()` / treat unknown fields as fine (spec
 * § "Дрейф схеми tools — контрактний пояс"): a missing required field
 * degrades to a typed {@link McpError} for the caller to turn into a
 * staleness banner, never an unhandled throw in the core sync flow.
 */

// ─────────────────────────── JSON-RPC envelope ────────────────────────────

const MCP_PROTOCOL_VERSION = "2025-06-18";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

const JsonRpcSuccessSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: z.union([z.number(), z.string(), z.null()]),
    result: z.unknown(),
  })
  .passthrough();

const JsonRpcFailureSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: z.union([z.number(), z.string(), z.null()]).optional(),
    error: z
      .object({
        code: z.number(),
        message: z.string(),
        data: z.unknown().optional(),
      })
      .passthrough(),
  })
  .passthrough();

// ────────────────────────────── Error model ────────────────────────────────

export type McpErrorKind =
  | "auth_required" // HTTP 401 — caller (tokenStore) should refresh and retry once
  | "rate_limited" // HTTP 429, retries exhausted
  | "upstream_unavailable" // 5xx / network / timeout, retries exhausted, or breaker open
  | "schema_drift" // response parsed as JSON-RPC but failed the caller's zod schema
  | "protocol_error"; // not a well-formed JSON-RPC envelope at all

export interface McpError {
  kind: McpErrorKind;
  message: string;
  status?: number;
}

export type McpResult<T> =
  { ok: true; data: T } | { ok: false; error: McpError };

function errResult<T>(error: McpError): McpResult<T> {
  return { ok: false, error };
}

// ────────────────────────────── Config / state ─────────────────────────────

/**
 * Per-attempt timeout for a single Silpo MCP HTTP call. Not env-configurable
 * (unlike `BANK_FETCH_TIMEOUT_MS`) — this is a brand-new provisional
 * integration; add an override knob only once real latency data exists.
 */
export const SILPO_MCP_TIMEOUT_MS = 15_000;

let retryDelaysMs = [0, 300, 900];

/**
 * Global (not per-user) circuit breaker. Spec § Рішення дизайну: "Спільний
 * DCR client_id = спільна доля" — one client_id serves every user, so a
 * Silpo-side throttle/ban after N failures should stop hammering the
 * upstream for the whole fleet, not just the caller who tripped it.
 */
interface BreakerState {
  failures: number;
  openUntil: number;
}
const BREAKER_FAIL_THRESHOLD = 5;
const BREAKER_OPEN_MS = 30_000;
const breaker: BreakerState = { failures: 0, openUntil: 0 };

function isBreakerOpen(): boolean {
  if (!breaker.openUntil) return false;
  if (Date.now() < breaker.openUntil) return true;
  breaker.openUntil = 0; // half-open — allow one probe
  return false;
}
function onBreakerSuccess(): void {
  breaker.failures = 0;
  breaker.openUntil = 0;
}
function onBreakerFailure(): void {
  breaker.failures += 1;
  if (breaker.failures >= BREAKER_FAIL_THRESHOLD) {
    breaker.openUntil = Date.now() + BREAKER_OPEN_MS;
  }
}

/** Test-only: reset module-level breaker/retry state between unit tests. */
export function __silpoMcpTestHooks(): {
  resetBreaker(): void;
  setRetryDelaysMs(delays: number[]): void;
} {
  return {
    resetBreaker(): void {
      breaker.failures = 0;
      breaker.openUntil = 0;
    },
    setRetryDelaysMs(delays: number[]): void {
      retryDelaysMs = delays;
    },
  };
}

let nextRequestId = 1;

// ─────────────────────────── Transport primitives ──────────────────────────

interface RawResponse {
  status: number;
  sessionId: string | null;
  bodyText: string;
  contentType: string | null;
}

/**
 * `text/event-stream` framing is line-based: `data: <json>` lines, blank
 * line separates events. MCP streamable HTTP servers may reply with either
 * `application/json` (single message) or SSE (one or more messages, last
 * one being the response to our request). We only need the LAST JSON
 * payload on the stream — earlier `data:` lines would be server→client
 * notifications, which this minimal client does not otherwise consume.
 */
function extractJsonFromEventStream(bodyText: string): string | null {
  const dataLines = bodyText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice("data:".length).trim())
    .filter((l) => l.length > 0);
  return dataLines.length > 0
    ? (dataLines[dataLines.length - 1] ?? null)
    : null;
}

async function postJsonRpc(opts: {
  accessToken: string;
  sessionId?: string | null | undefined;
  body: JsonRpcRequest | JsonRpcNotification;
  timeoutMs: number;
}): Promise<RawResponse> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${opts.accessToken}`,
      "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
    };
    if (opts.sessionId) headers["Mcp-Session-Id"] = opts.sessionId;

    const response = await fetch(env.SILPO_MCP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(opts.body),
      signal: controller.signal,
    });
    const bodyText = await response.text();
    return {
      status: response.status,
      sessionId: response.headers.get("mcp-session-id"),
      bodyText,
      contentType: response.headers.get("content-type"),
    };
  } finally {
    clearTimeout(t);
  }
}

/**
 * One logical MCP request with retry/backoff (429/5xx/network) + the
 * global breaker + `recordExternalHttp("silpo", …)`. Returns a parsed
 * JSON-RPC envelope on success, or a typed {@link McpError} — never throws
 * for expected failure modes (auth/rate-limit/upstream/protocol), so a
 * caller failure can never crash the on-demand sync button (spec §
 * "Ізоляція збою").
 */
type McpRpcCallResult =
  | { ok: true; result: unknown; sessionId: string | null }
  | { ok: false; error: McpError };

function rpcErr(error: McpError): McpRpcCallResult {
  return { ok: false, error };
}

async function mcpRpcCall(opts: {
  accessToken: string;
  sessionId?: string | null | undefined;
  method: string;
  params?: unknown;
  timeoutMs?: number;
}): Promise<McpRpcCallResult> {
  if (isBreakerOpen()) {
    recordExternalHttp("silpo", "circuit_open", 0);
    return rpcErr({
      kind: "upstream_unavailable",
      message: "Silpo MCP тимчасово недоступний (circuit open)",
    });
  }

  const timeoutMs = opts.timeoutMs ?? SILPO_MCP_TIMEOUT_MS;
  const body: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: nextRequestId++,
    method: opts.method,
    ...(opts.params !== undefined ? { params: opts.params } : {}),
  };

  const start = process.hrtime.bigint();
  let lastNetworkError: unknown;

  for (let attempt = 0; attempt < retryDelaysMs.length; attempt++) {
    const delay = retryDelaysMs[attempt] ?? 0;
    if (delay > 0) await sleep(delay);

    let raw: RawResponse;
    try {
      raw = await postJsonRpc({
        accessToken: opts.accessToken,
        sessionId: opts.sessionId,
        body,
        timeoutMs,
      });
    } catch (e) {
      lastNetworkError = e;
      if (attempt < retryDelaysMs.length - 1) continue;
      const ms = elapsedMs(start);
      onBreakerFailure();
      recordExternalHttp("silpo", isAbortError(e) ? "timeout" : "error", ms);
      logger.warn({
        msg: "silpo_mcp_network_failed",
        method: opts.method,
        attempts: attempt + 1,
        err: e instanceof Error ? e.message : String(e),
      });
      return rpcErr({
        kind: "upstream_unavailable",
        message: "Не вдалося зʼєднатися з Silpo MCP",
      });
    }

    const ms = elapsedMs(start);

    if (raw.status === 401) {
      recordExternalHttp("silpo", "auth_required", ms);
      return rpcErr({
        kind: "auth_required",
        message: "Silpo access token invalid or expired",
        status: 401,
      });
    }

    if (raw.status === 429) {
      if (attempt < retryDelaysMs.length - 1) {
        recordExternalHttp("silpo", "rate_limited", ms);
        continue;
      }
      recordExternalHttp("silpo", "rate_limited", ms);
      return rpcErr({
        kind: "rate_limited",
        message: "Silpo MCP rate limit",
        status: 429,
      });
    }

    if (raw.status >= 500) {
      if (attempt < retryDelaysMs.length - 1) continue;
      onBreakerFailure();
      recordExternalHttp("silpo", "error", ms);
      return rpcErr({
        kind: "upstream_unavailable",
        message: "Silpo MCP upstream error",
        status: raw.status,
      });
    }

    if (raw.status >= 400) {
      // 4xx other than 401/429 — not a breaker-worthy availability issue
      // (bad request shape, forbidden tool, etc.), but not retryable either.
      recordExternalHttp("silpo", "error", ms);
      return rpcErr({
        kind: "protocol_error",
        message: `Silpo MCP HTTP ${raw.status}`,
        status: raw.status,
      });
    }

    // 2xx — parse the JSON-RPC envelope. Body may be plain JSON or SSE.
    const jsonText =
      raw.contentType?.includes("text/event-stream") === true
        ? extractJsonFromEventStream(raw.bodyText)
        : raw.bodyText;

    if (!jsonText) {
      onBreakerFailure();
      recordExternalHttp("silpo", "error", ms);
      return rpcErr({
        kind: "protocol_error",
        message: "Silpo MCP response had no parseable JSON-RPC body",
      });
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(jsonText);
    } catch {
      onBreakerFailure();
      recordExternalHttp("silpo", "error", ms);
      return rpcErr({
        kind: "protocol_error",
        message: "Silpo MCP response body was not valid JSON",
      });
    }

    const success = JsonRpcSuccessSchema.safeParse(parsedJson);
    if (success.success) {
      onBreakerSuccess();
      recordExternalHttp("silpo", "ok", ms);
      return {
        ok: true,
        result: success.data.result,
        sessionId: raw.sessionId,
      };
    }

    const failure = JsonRpcFailureSchema.safeParse(parsedJson);
    if (failure.success) {
      onBreakerSuccess(); // upstream is reachable and speaking JSON-RPC — just an app-level error
      recordExternalHttp("silpo", "ok", ms);
      return rpcErr({
        kind: "protocol_error",
        message: `Silpo MCP JSON-RPC error: ${failure.data.error.message}`,
      });
    }

    onBreakerFailure();
    recordExternalHttp("silpo", "error", ms);
    return rpcErr({
      kind: "protocol_error",
      message: "Silpo MCP response did not match the JSON-RPC envelope",
    });
  }

  // Unreachable — the loop above always returns or continues, and the last
  // iteration never `continue`s. Kept for type-safety / defensive coding.
  /* c8 ignore next 5 */
  return rpcErr({
    kind: "upstream_unavailable",
    message:
      lastNetworkError instanceof Error
        ? lastNetworkError.message
        : "Silpo MCP unexpected failure",
  });
}

// ─────────────────────────────── Public API ────────────────────────────────

/**
 * `initialize` → best-effort `notifications/initialized`. Returns the
 * session id from the `Mcp-Session-Id` response header when the server
 * uses session affinity, or `null` if the server is stateless per-call
 * (both are valid per the MCP streamable-HTTP transport spec — unverified
 * which one `mcp.silpo.ua` is until spike §0 runs).
 */
export async function mcpInitialize(
  accessToken: string,
): Promise<McpResult<{ sessionId: string | null }>> {
  const initResult = await mcpRpcCall({
    accessToken,
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "sergeant-server", version: "1" },
    },
  });
  if (!initResult.ok) return errResult(initResult.error);

  // Fire-and-forget notification — no response expected/awaited beyond the
  // HTTP round-trip; a failure here must never block tool calls.
  try {
    await postJsonRpc({
      accessToken,
      sessionId: initResult.sessionId,
      body: { jsonrpc: "2.0", method: "notifications/initialized" },
      timeoutMs: SILPO_MCP_TIMEOUT_MS,
    });
  } catch {
    /* best-effort */
  }

  return { ok: true, data: { sessionId: initResult.sessionId } };
}

/**
 * Calls one MCP tool end-to-end (initialize + tools/call) and validates the
 * result against the caller-supplied schema. Every schema passed in MUST
 * tolerate unknown fields (`.passthrough()` objects / permissive arrays) —
 * this client does not know the real Silpo tool output shapes yet.
 *
 * MCP tool results wrap output as `{ content: [{type:"text", text: "..."}],
 * structuredContent?: unknown, isError?: boolean }` per the spec's tool
 * result convention. We prefer `structuredContent` when present, else parse
 * `content[0].text` as JSON — both paths are provisional until spike §0.
 */
export async function callMcpTool<T>(opts: {
  accessToken: string;
  toolName: string;
  args?: Record<string, unknown>;
  schema: z.ZodType<T>;
}): Promise<McpResult<T>> {
  const init = await mcpInitialize(opts.accessToken);
  if (!init.ok) return errResult(init.error);

  const callResult = await mcpRpcCall({
    accessToken: opts.accessToken,
    sessionId: init.data.sessionId,
    method: "tools/call",
    params: { name: opts.toolName, arguments: opts.args ?? {} },
  });
  if (!callResult.ok) return errResult(callResult.error);

  const toolPayload = extractToolPayload(callResult.result);
  if (toolPayload === undefined) {
    return errResult({
      kind: "schema_drift",
      message: `Silpo MCP tool "${opts.toolName}" returned no parseable payload`,
    });
  }

  const parsed = opts.schema.safeParse(toolPayload);
  if (!parsed.success) {
    logger.warn({
      msg: "silpo_mcp_schema_drift",
      tool: opts.toolName,
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        code: i.code,
      })),
    });
    return errResult({
      kind: "schema_drift",
      message: `Silpo MCP tool "${opts.toolName}" response did not match the expected (provisional) schema`,
    });
  }

  return { ok: true, data: parsed.data };
}

function extractToolPayload(result: unknown): unknown {
  if (!result || typeof result !== "object") return undefined;
  const r = result as {
    structuredContent?: unknown;
    content?: Array<{ type?: string; text?: string }>;
  };
  if (r.structuredContent !== undefined) return r.structuredContent;
  const textBlock = r.content?.find((c) => c.type === "text" && c.text);
  if (!textBlock?.text) return undefined;
  try {
    return JSON.parse(textBlock.text);
  } catch {
    return undefined;
  }
}

/**
 * `tools/list` — used by the contract-drift snapshot test (spec § "Дрейф
 * схеми tools — контрактний пояс") to catch Silpo silently renaming/
 * removing tools we depend on. Permissive on purpose: only `name` is
 * required, everything else is `.passthrough()`.
 */
export const McpToolDescriptorSchema = z
  .object({ name: z.string() })
  .passthrough();
export const McpToolsListSchema = z.object({
  tools: z.array(McpToolDescriptorSchema),
});
export type McpToolsList = z.infer<typeof McpToolsListSchema>;

export async function listMcpTools(
  accessToken: string,
): Promise<McpResult<McpToolsList>> {
  const init = await mcpInitialize(accessToken);
  if (!init.ok) return errResult(init.error);

  const listResult = await mcpRpcCall({
    accessToken,
    sessionId: init.data.sessionId,
    method: "tools/list",
  });
  if (!listResult.ok) return errResult(listResult.error);

  const parsed = McpToolsListSchema.safeParse(listResult.result);
  if (!parsed.success) {
    return errResult({
      kind: "schema_drift",
      message:
        "Silpo MCP tools/list response did not match the expected envelope",
    });
  }
  return { ok: true, data: parsed.data };
}
