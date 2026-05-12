/**
 * `before_tool_call` hook factory (Stage 4a) — native write-approval gate.
 *
 * For each of the 5 Stage 3 write-tools (`create_github_issue`,
 * `commit_to_strategy_doc`, `post_to_topic`, `pause_workflow`,
 * `mute_alert`) we return a `requireApproval` payload to the runtime.
 * OpenClaw renders the approval UI (Telegram inline keyboard / control
 * console), waits for the founder to click allow/deny, and only then
 * runs the tool's `execute`. Non-write tools are pass-through (return
 * `undefined`).
 *
 * Audit logging: every resolution (`allow-once`, `allow-always`, `deny`,
 * `timeout`, `cancelled`) is POSTed to `/api/internal/openclaw/write-audit/log`
 * with `action = "approved" | "rejected"`. Server stores the row keyed
 * by `approvalId` so a later `after_tool_call` hook can pair it with an
 * `executed` row to reconstruct latency.
 *
 * Server contract (apps/server/src/routes/internal/openclaw.ts:272+):
 *   POST /api/internal/openclaw/write-audit/log
 *   body: { approvalId, tool, founderUserId, founderTgUserId,
 *           invocationId?, action ("approved"|"executed"|"rejected"),
 *           input?, persona?, metadata? }
 *
 * Per-tool approval payload (title + description) is tuned for Telegram
 * inline keyboard length budget (severity-coloured badge + ~280 chars).
 */

import type {
  PluginApprovalResolution,
  PluginHookBeforeToolCallEvent,
  PluginHookBeforeToolCallResult,
} from "openclaw/plugin-sdk/plugin-entry";
import type { OpenClawHttpClient } from "../http-client.js";

/**
 * The 5 write-tools registered in Stage 3 (PR #2463). Anything outside
 * this set is treated as a read-tool and skipped (returns `undefined`
 * from the hook, so the runtime executes immediately).
 */
export const WRITE_TOOLS: ReadonlySet<string> = new Set([
  "create_github_issue",
  "commit_to_strategy_doc",
  "post_to_topic",
  "pause_workflow",
  "mute_alert",
]);

export interface WriteApprovalOptions {
  http: OpenClawHttpClient;
  founderUserId: string;
  /**
   * Required for `/write-audit/log` body validation (Zod int). `| undefined`
   * is explicit because tsconfig sets `exactOptionalPropertyTypes: true`
   * and callers forward an `undefined` slot from `PluginConfig` directly.
   */
  founderTgUserId?: number | undefined;
  /** ms to wait for founder decision before forcing `timeoutBehavior`. */
  timeoutMs?: number;
  log?: (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    fields?: Record<string, unknown>,
  ) => void;
}

export type BeforeToolCallHookHandler = (
  event: PluginHookBeforeToolCallEvent,
) => Promise<PluginHookBeforeToolCallResult | undefined>;

/**
 * Builds a `before_tool_call` handler that returns a `requireApproval`
 * payload for write-tools and `undefined` (pass-through) for everything
 * else. The handler returns synchronously where possible — the
 * `onResolution` callback does the audit write asynchronously after the
 * founder picks a decision.
 */
export function createWriteApprovalHook(
  opts: WriteApprovalOptions,
): BeforeToolCallHookHandler {
  const log = opts.log ?? defaultLog;
  const timeoutMs = opts.timeoutMs ?? 300_000;

  return async (event) => {
    if (!WRITE_TOOLS.has(event.toolName)) return undefined;

    const params = event.params ?? {};
    const description = renderApprovalSummary(event.toolName, params);

    // `approvalId` correlates the approve/reject row with the later
    // `executed` row. Prefer `toolCallId` (stable across the run) and
    // fall back to a synthesised id when the runtime doesn't supply one
    // (live shape still unverified — see spike § "Що не перевіряли").
    const approvalId = makeApprovalId(event);

    return {
      requireApproval: {
        title: `Sergeant write-tool: ${event.toolName}`,
        description,
        severity: severityFor(event.toolName),
        timeoutMs,
        timeoutBehavior: "deny",
        onResolution: async (decision) => {
          await recordResolution(opts, log, {
            approvalId,
            toolName: event.toolName,
            params,
            decision,
          });
        },
      },
    };
  };
}

interface ResolutionContext {
  approvalId: string;
  toolName: string;
  params: Record<string, unknown>;
  decision: PluginApprovalResolution;
}

async function recordResolution(
  opts: WriteApprovalOptions,
  log: NonNullable<WriteApprovalOptions["log"]>,
  ctx: ResolutionContext,
): Promise<void> {
  if (opts.founderTgUserId === undefined) {
    log("warn", "sergeant.write_audit.skipped", {
      reason: "no_founder_tg_user_id",
      tool: ctx.toolName,
      decision: ctx.decision,
    });
    return;
  }

  const action = approvalToAuditAction(ctx.decision);

  try {
    await opts.http.post<unknown>("/write-audit/log", {
      approvalId: ctx.approvalId,
      tool: ctx.toolName,
      founderUserId: opts.founderUserId,
      founderTgUserId: opts.founderTgUserId,
      action,
      input: ctx.params,
      metadata: { decision: ctx.decision },
    });
    log(
      action === "approved" ? "info" : "warn",
      "sergeant.write_audit.logged",
      {
        tool: ctx.toolName,
        action,
        decision: ctx.decision,
        approvalId: ctx.approvalId,
      },
    );
  } catch (err) {
    log("error", "sergeant.write_audit.failed", {
      tool: ctx.toolName,
      decision: ctx.decision,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function approvalToAuditAction(
  decision: PluginApprovalResolution,
): "approved" | "rejected" {
  return decision === "allow-once" || decision === "allow-always"
    ? "approved"
    : "rejected";
}

function severityFor(toolName: string): "info" | "warning" | "critical" {
  // `pause_workflow` and `commit_to_strategy_doc` are the most disruptive —
  // pausing a workflow can halt production automations; strategy commits
  // mutate the founder's source-of-truth docs. The other three are
  // reversible (close issue, edit topic post, unmute alert).
  if (toolName === "pause_workflow" || toolName === "commit_to_strategy_doc") {
    return "critical";
  }
  return "warning";
}

function makeApprovalId(event: PluginHookBeforeToolCallEvent): string {
  if (event.toolCallId) return event.toolCallId;
  if (event.runId) return `${event.runId}-${event.toolName}-${Date.now()}`;
  // Last resort — guarantees uniqueness but won't pair across PRs.
  return `${event.toolName}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/**
 * Renders a single-line summary of the write-tool params so the founder
 * has enough context to decide allow/deny without opening logs. Truncates
 * to ~280 chars to fit a Telegram inline keyboard callback.
 */
export function renderApprovalSummary(
  toolName: string,
  params: Record<string, unknown>,
): string {
  switch (toolName) {
    case "create_github_issue": {
      const title = strField(params["title"], 100);
      const repo = strField(params["repo"], 60) ?? "(default repo)";
      const labels = arrField(params["labels"]) ?? [];
      const labelPart =
        labels.length > 0 ? ` labels=[${labels.join(", ")}]` : "";
      return `repo ${repo} → issue "${title}"${labelPart}`;
    }
    case "commit_to_strategy_doc": {
      const path = strField(params["path"], 120);
      const message = strField(params["message"], 120);
      const repo = strField(params["repo"], 60) ?? "(default repo)";
      return `repo ${repo} → ${path}: ${message}`;
    }
    case "post_to_topic": {
      const topic = strField(params["topic"], 60);
      const text = strField(params["text"], 180);
      return `topic ${topic} ← "${text}"`;
    }
    case "pause_workflow": {
      const workflowId = strField(params["workflowId"], 60);
      const reason = strField(params["reason"], 200) ?? "(no reason given)";
      return `n8n workflow ${workflowId} → paused; reason: ${reason}`;
    }
    case "mute_alert": {
      const issueId = strField(params["issueId"], 80);
      const untilIso = strField(params["untilIso"], 32) ?? "indefinitely";
      return `Sentry issue ${issueId} → muted ${untilIso}`;
    }
    default:
      return JSON.stringify(params).slice(0, 280);
  }
}

function strField(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
}

function arrField(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter((x): x is string => typeof x === "string");
}

function defaultLog(
  level: "debug" | "info" | "warn" | "error",
  message: string,
  fields?: Record<string, unknown>,
): void {
  const payload = fields ? ` ${JSON.stringify(fields)}` : "";
  if (level === "error") console.error(`[sergeant] ${message}${payload}`);
  else if (level === "warn") console.warn(`[sergeant] ${message}${payload}`);
  else console.log(`[sergeant] ${message}${payload}`);
}
