/**
 * OpenClaw co-founder agent (ADR-0031).
 *
 * Patterns mirror `agents/ops.ts` і `agents/marketing.ts`: тонка обгортка
 * над `runAgentLoop`. Різниця:
 *   1) System prompt будуєcя на сервері (через `/api/internal/openclaw/*`
 *      ми не йдемо для prompt-у — будуємо локально через
 *      `buildSystemPromptInline`, бо prompt — pure-string-функція без
 *      залежностей; не варто HTTP-round-trip-ом).
 *   2) Tool-execution робить HTTP-call до server internal API, де
 *      виконуються security checks (table allowlist, doc-path allowlist).
 *      Compromised console process не може bypass-ити allowlist.
 *   3) `executeTool` приймає extra context (founderUserId) — caller
 *      робить partial application через closure.
 */

import type Anthropic from "@anthropic-ai/sdk";
import {
  incrementCounter,
  OPENCLAW_PER_CALL_CAP_HIT_TOTAL,
} from "../obs/metrics.js";
import {
  type ApprovalStore,
  type PendingApprovalsCollector,
  isWriteToolName,
} from "../openclaw/approval-store.js";
import {
  assertPerCallCapAllowed,
  parseMaxPerCallUsd,
  PerCallCapExceededError,
} from "../openclaw/policy.js";
import {
  DEFAULT_PERSONA,
  filterToolsForPersona,
  personaPrimer,
  type OpenClawPersona,
} from "./personas.js";
import { runAgentLoop } from "./run-agent-loop.js";
import { strategicModePrimer, type StrategicMode } from "./strategic-modes.js";

export const OPENCLAW_MODEL = "claude-sonnet-4-6";
export const OPENCLAW_MAX_TOKENS = 4096;
const MODEL = OPENCLAW_MODEL;
const MAX_TOKENS = OPENCLAW_MAX_TOKENS;

export type OpenClawToneMode = "diplomatic" | "direct";

const DIPLOMATIC_KEYWORDS = [
  "стратегі",
  "плани",
  "розглянути",
  "варіант",
  "напрям",
  "роадмеп",
  "пріоритет",
  "okr",
  "okрs",
  "vision",
  "strategy",
  "plan",
  "roadmap",
  "consider",
  "explore",
  "tradeoff",
  "trade-off",
  "альтернатив",
  "цінн",
  "позиціон",
];

const DIRECT_KEYWORDS = [
  "5xx",
  "incident",
  "інцидент",
  "down",
  "deploy",
  "deployment",
  "ci ",
  " ci",
  "broken",
  "падає",
  "падал",
  "лагає",
  "затиск",
  "зламав",
  "blocker",
  "блокер",
  "критичний",
  "терміново",
  "ургентно",
  "production",
  "rollback",
  "ролбек",
  "alert",
  "алерт",
  "error",
  "помилк",
  "fail",
];

/**
 * Selector для tone-mode (ADR-0031 §6). Mirror реалізації у
 * `apps/server/src/modules/openclaw/prompts.ts`. Дублюється бо у Phase 1
 * console-bot будує prompt локально для economy на HTTP round-trip-у.
 */
export function selectToneMode(userMessage: string): OpenClawToneMode {
  const lower = userMessage.toLowerCase();
  if (DIRECT_KEYWORDS.some((kw) => lower.includes(kw))) return "direct";
  if (DIPLOMATIC_KEYWORDS.some((kw) => lower.includes(kw))) return "diplomatic";
  return "diplomatic";
}

const COMMON_PREFIX = `You are OpenClaw, the co-founder AI assistant for Sergeant — a Ukrainian
SaaS for personal productivity, finances and habits. You speak with the
founder (single user) in Telegram DM. Match the user's language (Ukrainian
default; switch to English if they switch).

ROLE: Read-only co-founder. You analyze, advise, and challenge. You do
NOT execute changes in production. The only write-tool you have is
\`record_decision\`, which logs a decision into Postgres and opens a PR
with markdown into \`docs/decisions/\` — the founder reviews and merges.

NAMESPACE: All your memory lives under \`source='cofounder'\` in
\`ai_memories\`. You CANNOT read end-user memory (other sources). For
product insight (e.g. "what users ask in HubChat") use aggregated
PostHog/Stripe queries via \`query_app_db\`, never raw end-user PII.

ALLOWLIST FOR \`query_app_db\`: users, n8n_failure_events, routine_entries,
routine_streaks, mono_transaction, openclaw_decisions, openclaw_invocations,
openclaw_write_audit, tg_alert_acks. NEVER query auth_*, ai_usage_daily,
ai_memories, sync_op_log, sync_audit_log, or anything containing PII.
Only SELECT and WITH queries. NO joins to forbidden tables. OpenClaw timestamp
columns are specific: openclaw_invocations.invoked_at,
openclaw_decisions.decided_at, openclaw_write_audit.recorded_at.

ALLOWLIST FOR \`read_strategy_docs\`: docs/strategy/, docs/launch/,
docs/adr/, docs/decisions/, docs/integrations/, docs/governance/.

ITERATION CAP: __MAX_ITER__ Plan→Act→Reflect cycles. If you cannot reach a
conclusion within that, summarize what you know, state the open question,
and suggest a path forward.`;

const DIPLOMATIC_BODY = `TONE: Diplomatic, exploratory. You are a co-founder offering a
perspective. Use phrasings like:
  - "Я бачу інший варіант, варто розглянути X через Y."
  - "Можемо подивитися з кута Z — там є аргумент за/проти."
  - "Є ризик, що це впаде на N — як думаєш?"

When you disagree with the founder, state it gently with reasoning;
do not capitulate just because they pushed back. Truth > harmony.

FORMAT: Short paragraphs. Bullet-points only when listing 3+ items.
No corporate fluff, no exclamation marks.`;

const DIRECT_BODY = `TONE: Direct, ops-mode. The founder is in incident or fast-decision
context. Cut to the chase. Use phrasings like:
  - "Це може провалитися через X. Перевір Y перед тим як рухатись."
  - "Зараз пріоритет — стабілізувати Z. Решта — після."
  - "Тобі потрібен rollback. Виконай: A, B, C."

No softening, no preamble. Lead with the recommendation, then 1–2
sentences of why. If you don't have enough data to recommend — say so
plainly and ask for the missing piece.

FORMAT: Lead with action. Then briefly: why. Then optional next steps
as bullets. No filler.`;

export function buildSystemPromptInline({
  toneMode,
  maxIterations,
  founderHandle,
  trigger,
  persona = DEFAULT_PERSONA,
  strategicMode,
}: {
  toneMode: OpenClawToneMode;
  maxIterations: number;
  founderHandle: string;
  trigger: string;
  persona?: OpenClawPersona;
  /**
   * ADR-0031, Phase 3 (PR-34 skeleton): coupled with `/plan`, `/analyze`,
   * `/okr` slash-commands. Mode primer is appended after the persona
   * primer and before the tone-mode body so the LLM sees:
   *   COMMON_PREFIX → PERSONA → STRATEGIC_MODE → TONE_BODY → trailers.
   * `null`/`undefined` → no mode framework (default ad-hoc DM).
   */
  strategicMode?: StrategicMode | null | undefined;
}): string {
  const body = toneMode === "direct" ? DIRECT_BODY : DIPLOMATIC_BODY;
  const modeBlock = strategicMode
    ? [strategicModePrimer(strategicMode), ""]
    : [];
  return [
    COMMON_PREFIX.replace("__MAX_ITER__", String(maxIterations)),
    "",
    personaPrimer(persona),
    "",
    ...modeBlock,
    body,
    "",
    `FOUNDER: ${founderHandle}`,
    `TRIGGER: ${trigger}`,
    `TONE_MODE: ${toneMode}`,
    `PERSONA: ${persona}`,
    ...(strategicMode ? [`STRATEGIC_MODE: ${strategicMode}`] : []),
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────
// Tool definitions (Anthropic JSON-schema)
// ─────────────────────────────────────────────────────────────────────────

type Tool = Anthropic.Tool;

export const openClawTools: Tool[] = [
  {
    name: "recall_memory",
    description:
      "Retrieve cofounder memory snippets via vector similarity. Strictly scoped to source='cofounder'.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural-language query." },
        topK: {
          type: "number",
          description: "Number of top results (default 8, max 50).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "read_strategy_docs",
    description:
      "Read a file from the repo. Allowlist: docs/strategy/, docs/launch/, docs/adr/, docs/decisions/, docs/integrations/, docs/governance/. Pass a directory path to list its entries.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Repo-relative path, e.g. 'docs/strategy/openclaw.md'.",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "read_github",
    description:
      "Read a file, issue, or PR from GitHub (Skords-01/Sergeant by default).",
    input_schema: {
      type: "object",
      properties: {
        repo: {
          type: "string",
          description:
            "owner/repo. Defaults to OPENCLAW_GITHUB_REPO if omitted.",
        },
        mode: {
          type: "string",
          enum: ["file", "issue", "pr"],
          description: "What to read.",
        },
        filePath: {
          type: "string",
          description: "For mode='file' — path within the repo.",
        },
        ref: {
          type: "string",
          description:
            "For mode='file' — branch/commit ref. Defaults to OPENCLAW_GITHUB_BASE_BRANCH.",
        },
        number: {
          type: "number",
          description: "For mode='issue' or 'pr' — issue/PR number.",
        },
      },
      required: ["mode"],
    },
  },
  {
    name: "query_app_db",
    description:
      "Run a read-only SQL query against an allowlisted set of tables: users, n8n_failure_events, routine_entries, routine_streaks, mono_transaction, openclaw_decisions, openclaw_invocations, openclaw_write_audit, tg_alert_acks. Only SELECT and WITH queries are allowed. Use parameterized queries with $1, $2… placeholders. For OpenClaw audit tables use invoked_at, decided_at, or recorded_at as the timestamp column.",
    input_schema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "SQL SELECT/WITH query." },
        params: {
          type: "array",
          description: "Parameters for $1, $2 placeholders.",
          items: {},
        },
        limit: {
          type: "number",
          description: "Hard row cap (default 200, max 1000).",
        },
      },
      required: ["sql"],
    },
  },
  {
    name: "read_workflow_logs",
    description: "Read recent n8n workflow execution traces for a workflow id.",
    input_schema: {
      type: "object",
      properties: {
        workflowId: { type: "string", description: "n8n workflow id." },
        since: {
          type: "string",
          description: "Earliest start (ISO-8601). Optional.",
        },
        limit: {
          type: "number",
          description: "Max executions (default 10, max 50).",
        },
      },
      required: ["workflowId"],
    },
  },
  {
    name: "read_telegram_topic_history",
    description:
      "Read recent messages from a Sergeant Ops supergroup forum topic. Backed by the `tg_topic_archive` table (migration 047), populated by alert posts (n8n) and `post_to_topic` write-tool calls. Manual sends from other accounts are NOT captured.",
    input_schema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description:
            "Topic key from REPORTING-MATRIX.md (e.g. 'digest', 'incidents').",
        },
        since: {
          type: "string",
          description: "ISO-8601 lower bound. Optional.",
        },
        limit: {
          type: "number",
          description: "Max messages (default 20, max 100).",
        },
      },
      required: ["topic"],
    },
  },
  {
    name: "record_decision",
    description:
      "Log a decision into Postgres and open a PR with markdown into docs/decisions/. The founder reviews and merges; OpenClaw NEVER auto-merges.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Short title (≤200 chars)." },
        context: {
          type: "string",
          description: "Background that led to the decision.",
        },
        decision: {
          type: "string",
          description: "What was decided, in plain language.",
        },
        rationale: {
          type: "string",
          description: "Why this decision — tradeoffs considered.",
        },
        alternatives: {
          type: "string",
          description: "Optional: alternatives considered and rejected.",
        },
      },
      required: ["topic", "context", "decision", "rationale"],
    },
  },
  // ──── ADR-0032: tools ported from Sergeant Console (ADR-0027) agents ────
  // Goal: OpenClaw becomes the single founder surface — chat + commands +
  // metrics — without spinning up a separate `@sergeant_console_bot`.
  {
    name: "get_stripe_metrics",
    description:
      "Fetch Stripe billing metrics over the last N days: successful charges, failed charges, gross UAH amount. Fail-soft if STRIPE_SECRET_KEY is not configured.",
    input_schema: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "Lookback window in days (default 7, max 90).",
        },
      },
      required: [],
    },
  },
  {
    name: "get_sentry_issues",
    description:
      "List unresolved Sentry issues filtered by severity. Fail-soft if SENTRY_AUTH_TOKEN is not configured.",
    input_schema: {
      type: "object",
      properties: {
        level: {
          type: "string",
          enum: ["fatal", "error", "warning"],
          description: "Minimum severity (default 'error').",
        },
        limit: {
          type: "number",
          description: "Max issues (default 10, max 50).",
        },
      },
      required: [],
    },
  },
  {
    name: "get_server_stats",
    description:
      "Read `/healthz` of the Sergeant API server (DB, Redis, queue depth aggregate).",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_posthog_stats",
    description:
      "Fetch a PostHog pageview trend over the last N days. Fail-soft if POSTHOG_API_KEY/POSTHOG_PROJECT_ID are not configured.",
    input_schema: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "Lookback window (default 7, max 180).",
        },
      },
      required: [],
    },
  },
  {
    name: "get_github_releases",
    description:
      "Fetch the most recent releases from a GitHub repo (defaults to OPENCLAW_GITHUB_REPO).",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Releases to return (default 5, max 20).",
        },
        repo: {
          type: "string",
          description: "owner/repo (optional).",
        },
      },
      required: [],
    },
  },
  // ──── ADR-0036 (Phase 4): write-tools (approval-gated) ────
  // Console intercepts these calls — instead of executing, it queues an
  // approval-record and posts an inline-keyboard to the founder. Only after
  // an explicit `Approve` click does the tool actually run via
  // /api/internal/openclaw/write/*.
  //
  // System prompt warns the LLM that these tools require founder approval
  // and might be rejected; the LLM should phrase its proposed action
  // narratively in the same turn so the founder has context.
  {
    name: "commit_to_strategy_doc",
    description:
      "Open a GitHub PR that updates a markdown file under docs/strategy/. Returns a PR link only — never auto-merges. REQUIRES FOUNDER APPROVAL via inline-keyboard before execution.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Repo-relative path under docs/strategy/, e.g. 'docs/strategy/positioning.md'.",
        },
        content: {
          type: "string",
          description:
            "Full new file content (markdown). The PR replaces the file contents with this string.",
        },
        message: {
          type: "string",
          description: "Commit subject (≤200 chars).",
        },
        repo: {
          type: "string",
          description:
            "owner/repo. Defaults to OPENCLAW_GITHUB_REPO if omitted.",
        },
      },
      required: ["path", "content", "message"],
    },
  },
  {
    name: "create_github_issue",
    description:
      "Open a GitHub issue with title and body. REQUIRES FOUNDER APPROVAL. Use for tracking work the founder should review (e.g. tech-debt, follow-ups from /council).",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Issue title (≤200 chars)." },
        body: {
          type: "string",
          description: "Markdown body explaining the issue.",
        },
        labels: {
          type: "array",
          items: { type: "string" },
          description: "Optional labels (max 10).",
        },
        repo: {
          type: "string",
          description:
            "owner/repo. Defaults to OPENCLAW_GITHUB_REPO if omitted.",
        },
      },
      required: ["title", "body"],
    },
  },
  {
    name: "post_to_topic",
    description:
      "Post a message to a Sergeant Ops supergroup topic. Allowlist: ops, engineering, growth. REQUIRES FOUNDER APPROVAL. Use for cross-posting decisions / playbooks the team needs to see.",
    input_schema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description:
            "Topic key — one of: 'ops', 'engineering', 'growth'. Other topics are NOT allowed.",
        },
        text: {
          type: "string",
          description: "Plain-text message body (≤4000 chars).",
        },
      },
      required: ["topic", "text"],
    },
  },
  {
    name: "pause_workflow",
    description:
      "Deactivate (pause) an n8n workflow by id. REQUIRES FOUNDER APPROVAL. Use during incidents to stop a misbehaving workflow.",
    input_schema: {
      type: "object",
      properties: {
        workflowId: {
          type: "string",
          description: "n8n workflow id (numeric string).",
        },
        reason: {
          type: "string",
          description: "Why we're pausing (logged in audit-trail).",
        },
      },
      required: ["workflowId"],
    },
  },
  {
    name: "mute_alert",
    description:
      "Resolve / snooze a Sentry issue by id. REQUIRES FOUNDER APPROVAL. Use when an alert is false-positive or already-being-fixed.",
    input_schema: {
      type: "object",
      properties: {
        issueId: { type: "string", description: "Sentry issue id." },
        untilIso: {
          type: "string",
          description:
            "Optional ISO-8601 timestamp until which to snooze. Omit to mark resolved permanently.",
        },
      },
      required: ["issueId"],
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Server-side tool executor (HTTP to /api/internal/openclaw/*)
// ─────────────────────────────────────────────────────────────────────────

export interface OpenClawAgentDeps {
  /** Server base URL, e.g. "http://localhost:3000". */
  serverUrl: string;
  /** INTERNAL_API_KEY shared with apps/server. */
  internalApiKey: string;
  /** Better Auth user.id of the founder. */
  founderUserId: string;
  /** Telegram user-id of the founder (used to scope approval records). */
  founderTgUserId?: number | undefined;
  /** Optional: invocation id for audit trail. */
  invocationId?: number | undefined;
  /**
   * ADR-0036 (Phase 4): if both `approvalStore` and `pendingCollector`
   * are provided, write-tool calls (commit_to_strategy_doc, …) are
   * intercepted and queued for approval instead of executed. Without
   * either, write-tools return a hard refusal to the LLM (fail-closed).
   */
  approvalStore?: ApprovalStore | undefined;
  pendingCollector?: PendingApprovalsCollector | undefined;
  /**
   * ADR-0037 (Phase 4.5): persona that initiated the agent turn. Stamped
   * onto every queued approval-record so the persistent audit-log can
   * answer "show me all `pause_workflow` calls emitted by `ops` last
   * week".
   */
  persona?: string | undefined;
}

/**
 * Stable text returned to the LLM whenever a write-tool is queued for
 * approval. Phrased so the LLM keeps composing its narrative reply
 * (the founder will see both the narrative AND the inline-keyboard
 * buttons posted by the handler after the agent turn ends).
 */
const WRITE_TOOL_QUEUED_LITERAL = JSON.stringify({
  status: "queued_for_approval",
  note: "The action has been queued. The founder must approve or reject via inline-keyboard before it actually runs. Continue your narrative reply explaining what you proposed and why; do NOT attempt to call this tool again.",
});

const WRITE_TOOL_REJECTED_LITERAL = JSON.stringify({
  status: "rejected",
  note: "Write-tools are not configured for this OpenClaw deploy (missing approval-store). Cannot execute side-effecting actions.",
});

/**
 * Maps tool name → server endpoint path. Single source of truth — змінюючи
 * endpoint, треба змінити тільки тут.
 */
const TOOL_ROUTE: Record<string, string> = {
  recall_memory: "/api/internal/openclaw/recall",
  read_strategy_docs: "/api/internal/openclaw/strategy",
  read_github: "/api/internal/openclaw/github",
  query_app_db: "/api/internal/openclaw/query",
  read_workflow_logs: "/api/internal/openclaw/workflow",
  read_telegram_topic_history: "/api/internal/openclaw/telegram",
  record_decision: "/api/internal/openclaw/decision",
  // ADR-0032: ports of Sergeant Console (ADR-0027) ops/marketing tools.
  get_stripe_metrics: "/api/internal/openclaw/metrics/stripe",
  get_sentry_issues: "/api/internal/openclaw/metrics/sentry",
  get_server_stats: "/api/internal/openclaw/metrics/server",
  get_posthog_stats: "/api/internal/openclaw/metrics/posthog",
  get_github_releases: "/api/internal/openclaw/github/releases",
  // ADR-0036 (Phase 4): write-tools — invoked ONLY after explicit
  // founder approval. The executor below intercepts these names and
  // routes them through the approval-store instead of fetch-ing.
  commit_to_strategy_doc: "/api/internal/openclaw/write/strategy-doc",
  create_github_issue: "/api/internal/openclaw/write/github-issue",
  post_to_topic: "/api/internal/openclaw/write/post-to-topic",
  pause_workflow: "/api/internal/openclaw/write/pause-workflow",
  mute_alert: "/api/internal/openclaw/write/mute-alert",
};

/**
 * Resolve a write-tool route by name. Re-exported for the callback
 * handler so it does not need to duplicate the mapping. Returns
 * `undefined` for non-write tools (intentionally — the callback handler
 * should never reach a non-write route).
 */
export function writeToolRoute(name: string): string | undefined {
  return isWriteToolName(name) ? TOOL_ROUTE[name] : undefined;
}

/**
 * Передається в `runAgentLoop` як `executeTool`. Повертає сирий
 * JSON-string output-у (LLM-у). Якщо HTTP-call fail — повертає error
 * message як строку (так LLM зрозуміє і зможе adapt-нутись).
 *
 * ADR-0036 (Phase 4): for the 5 write-tool names, the executor does NOT
 * fetch — it queues an approval-record and returns
 * `WRITE_TOOL_QUEUED_LITERAL` to the LLM. The handler later (after the
 * agent turn completes) drains the collector and posts inline-keyboard
 * buttons to the founder; on Approve it invokes the corresponding
 * `/api/internal/openclaw/write/*` endpoint.
 */
export function createOpenClawToolExecutor(
  deps: OpenClawAgentDeps,
): (name: string, input: Record<string, unknown>) => Promise<string> {
  return async (name, input) => {
    // ADR-0036: write-tool interception. Fail-closed if approval
    // infrastructure not provided — we never auto-execute side effects.
    if (isWriteToolName(name)) {
      if (!deps.approvalStore || !deps.pendingCollector) {
        return WRITE_TOOL_REJECTED_LITERAL;
      }
      const founderTgUserId = deps.founderTgUserId ?? 0;
      const record = deps.approvalStore.create({
        tool: name,
        input: { ...input },
        founderUserId: deps.founderUserId,
        founderTgUserId,
        invocationId: deps.invocationId,
        persona: deps.persona,
      });
      deps.pendingCollector.add(record);
      return WRITE_TOOL_QUEUED_LITERAL;
    }

    const route = TOOL_ROUTE[name];
    if (!route) return `Unknown OpenClaw tool: ${name}`;

    const body: Record<string, unknown> = { ...input };

    // Добавляємо founderUserId до тих route-ів, що його вимагають.
    if (name === "recall_memory" || name === "record_decision") {
      body["founderUserId"] = deps.founderUserId;
    }
    if (name === "record_decision" && deps.invocationId) {
      body["invocationId"] = deps.invocationId;
    }

    try {
      const res = await fetch(`${deps.serverUrl}${route}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${deps.internalApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        return `Tool ${name} failed (HTTP ${res.status}): ${text}`;
      }
      return text;
    } catch (e) {
      return `Tool ${name} error: ${e instanceof Error ? e.message : String(e)}`;
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Public agent entry-point
// ─────────────────────────────────────────────────────────────────────────

export interface RunOpenClawAgentInput {
  client: Anthropic;
  userMessage: string;
  founderHandle: string;
  trigger:
    | "dm"
    | "morning_ritual"
    | "weekly_review"
    | "monthly_okr"
    | "strategic_plan"
    | "strategic_analyze"
    | "strategic_okr";
  maxIterations: number;
  deps: OpenClawAgentDeps;
  /**
   * ADR-0033: persona switches primer + tool subset. Default — `cofounder`
   * (full toolset, synthesis voice). Inside `/council`, caller runs each
   * specialist persona separately and then a final `cofounder` synthesis.
   */
  persona?: OpenClawPersona | undefined;
  /**
   * ADR-0031, Phase 3 (PR-34): structured-thinking mode primer. Wired
   * through `/plan`, `/analyze`, `/okr` slash-commands. Default
   * (`null`/`undefined`) — no mode framework (regular DM).
   */
  strategicMode?: StrategicMode | null | undefined;
}

export async function runOpenClawAgent(input: RunOpenClawAgentInput): Promise<{
  reply: string;
  toneMode: OpenClawToneMode;
  persona: OpenClawPersona;
}> {
  const persona = input.persona ?? DEFAULT_PERSONA;
  const toneMode = selectToneMode(input.userMessage);
  const systemPrompt = buildSystemPromptInline({
    toneMode,
    maxIterations: input.maxIterations,
    founderHandle: input.founderHandle,
    trigger: input.trigger,
    persona,
    strategicMode: input.strategicMode ?? null,
  });

  const tools = filterToolsForPersona(openClawTools, persona);

  // M18: pre-flight per-call USD cap. The daily-budget guard at
  // `/api/internal/openclaw/budget` enforces a per-day ceiling, but a
  // single Anthropic call with an inflated `max_tokens` could burn
  // the entire daily budget in one round-trip. We cap the
  // worst-case per-call spend (output tokens × output price) before
  // dispatching so the failure surfaces locally without spending
  // tokens. See `docs/security/hardening/M18-openclaw-per-call-usd-cap.md`.
  const perCallCapUsd = parseMaxPerCallUsd(
    process.env["OPENCLAW_MAX_PER_CALL_USD"],
  );
  try {
    assertPerCallCapAllowed(MODEL, MAX_TOKENS, perCallCapUsd);
  } catch (e) {
    if (e instanceof PerCallCapExceededError) {
      incrementCounter(OPENCLAW_PER_CALL_CAP_HIT_TOTAL);
    }
    throw e;
  }

  const reply = await runAgentLoop(input.client, input.userMessage, {
    model: MODEL,
    maxTokens: MAX_TOKENS,
    systemPrompt,
    tools,
    // ADR-0037 (Phase 4.5): forward persona into the executor so queued
    // approval-records carry the persona that emitted them.
    executeTool: createOpenClawToolExecutor({ ...input.deps, persona }),
    maxIterations: input.maxIterations,
  });

  return { reply, toneMode, persona };
}
