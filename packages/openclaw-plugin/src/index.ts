/**
 * @sergeant/openclaw-plugin — Stage 2 (PR-B): 25 read-tools
 *
 * Built against the real openclaw@2026.5.7 plugin SDK. Stage 1 (MVP) shipped
 * 3 read tools to prove the entry/registration path works; this stage brings
 * the remaining 22 read tools across from src/legacy/tools/.
 *
 * Scope:
 *   - 25 read tools registered via api.registerTool (TypeBox parameters)
 *   - NO hooks (Stage 4 / PR-D)
 *   - NO write tools (Stage 3 / PR-C)
 *
 * Each tool is a thin HTTP proxy to `/api/internal/openclaw/<endpoint>` on
 * the Sergeant server — the same surface the legacy plugin used. Server
 * enforces the heavy stuff (allowlists, rate limits, RLS, etc.).
 */

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { Type, type TSchema } from "@sinclair/typebox";
import { OpenClawHttpClient } from "./http-client.js";
import { parsePluginConfig } from "./config.js";

function safeJsonParse(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const isUnresolvedPlaceholder = (v: unknown): boolean =>
  typeof v === "string" && /^\$\{[A-Z0-9_:.-]+\}$/.test(v.trim());

function resolvePluginConfig(candidate: unknown): Record<string, unknown> {
  const envFallback: Record<string, unknown> = {
    serverInternalUrl: process.env["SERVER_INTERNAL_URL"],
    internalApiKey: process.env["INTERNAL_API_KEY"],
    founderUserId: process.env["OPENCLAW_FOUNDER_USER_ID"],
    maxPerCallUsd: process.env["OPENCLAW_MAX_PER_CALL_USD"],
    councilUsdBudget: process.env["OPENCLAW_COUNCIL_USD_BUDGET"],
    approvalVariant: process.env["OPENCLAW_APPROVAL_VARIANT"],
    cheapRouterSystemPromptPath:
      process.env["OPENCLAW_CHEAP_ROUTER_PROMPT_PATH"],
  };
  const candidateObj =
    typeof candidate === "string"
      ? safeJsonParse(candidate)
      : (candidate as Record<string, unknown> | undefined) ?? {};
  const merged: Record<string, unknown> = { ...envFallback };
  for (const [k, v] of Object.entries(candidateObj)) {
    if (v === undefined || v === null || v === "") continue;
    if (isUnresolvedPlaceholder(v)) continue;
    merged[k] = v;
  }
  return merged;
}

/**
 * One entry per registered tool. `params` is a TypeBox object; `endpoint`
 * is the short server path that the http-client maps to
 * `/api/internal/openclaw/<endpoint>`. `formatBody` lets each tool reshape
 * params if the server expects extra fields (most pass through as-is, a
 * few add `founderUserId`).
 */
interface ToolSpec {
  name: string;
  description: string;
  params: TSchema;
  endpoint: string;
  formatBody?: (params: Record<string, unknown>) => unknown;
}

function makeTools(founderUserId: string): ToolSpec[] {
  const withFounder = (p: Record<string, unknown>) => ({ ...p, founderUserId });

  return [
    // ─── Memory & strategy docs ─────────────────────────────────────
    {
      name: "recall_memory",
      description:
        "Top-k semantic recall from founder memory namespace. Natural-language query (Ukrainian or English).",
      params: Type.Object({
        query: Type.String({ description: "Search query (1-2000 chars)" }),
        topK: Type.Optional(
          Type.Integer({ minimum: 1, maximum: 20, default: 5 }),
        ),
        persona: Type.Optional(
          Type.String({
            description:
              "Filter to memories from this persona (eng/finance/etc.)",
          }),
        ),
      }),
      endpoint: "/recall",
      formatBody: withFounder,
    },
    {
      name: "read_strategy_docs",
      description:
        "Read a strategy/planning/ADR document from the Sergeant repo. Returns full markdown.",
      params: Type.Object({
        path: Type.String({
          description: "Relative repo path (e.g. docs/adr/0031-foo.md)",
        }),
      }),
      endpoint: "/strategy",
    },
    {
      name: "record_decision",
      description:
        "Record an ADR-style decision (topic, context, decision, rationale). Writes to the strategy log.",
      params: Type.Object({
        topic: Type.String({ description: "Decision title" }),
        context: Type.String({ description: "Why this decision is needed" }),
        decision: Type.String({ description: "What was decided" }),
        rationale: Type.String({
          description: "Why this option over alternatives",
        }),
        alternatives: Type.Optional(
          Type.String({ description: "Alternatives considered" }),
        ),
        metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
      }),
      endpoint: "/decision",
      formatBody: withFounder,
    },

    // ─── DB / server metrics ────────────────────────────────────────
    {
      name: "query_app_db",
      description:
        "Read-only SQL against the Sergeant app database (allowlisted tables only). Use $1, $2 placeholders for parameterised queries.",
      params: Type.Object({
        sql: Type.String({ description: "SELECT-only SQL (max 8000 chars)" }),
        params: Type.Optional(Type.Array(Type.Unknown())),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
      }),
      endpoint: "/query",
    },
    {
      name: "get_server_stats",
      description:
        "Sergeant backend server health: uptime, memory, CPU, DB connections, request latency.",
      params: Type.Object({}),
      endpoint: "/metrics/server",
    },

    // ─── External metrics providers ─────────────────────────────────
    {
      name: "get_stripe_metrics",
      description:
        "Stripe revenue metrics: MRR, churn, new subscriptions over N days.",
      params: Type.Object({
        days: Type.Optional(Type.Integer({ minimum: 1, maximum: 90 })),
      }),
      endpoint: "/metrics/stripe",
    },
    {
      name: "get_posthog_stats",
      description:
        "PostHog product analytics: active users, key events, retention over N days.",
      params: Type.Object({
        days: Type.Optional(Type.Integer({ minimum: 1, maximum: 180 })),
      }),
      endpoint: "/metrics/posthog",
    },
    {
      name: "get_sentry_issues",
      description:
        "Recent Sentry issues filtered by severity level. Use to triage errors.",
      params: Type.Object({
        level: Type.Optional(
          Type.Union([
            Type.Literal("fatal"),
            Type.Literal("error"),
            Type.Literal("warning"),
          ]),
        ),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
      }),
      endpoint: "/metrics/sentry",
    },

    // ─── GitHub surface ─────────────────────────────────────────────
    {
      name: "read_github",
      description:
        "Read a file, issue, or PR from GitHub. Modes: 'file' (filePath+ref), 'issue' (number), 'pr' (number). Defaults to the Sergeant repo.",
      params: Type.Object({
        mode: Type.Union([
          Type.Literal("file"),
          Type.Literal("issue"),
          Type.Literal("pr"),
        ]),
        repo: Type.Optional(
          Type.String({ description: "owner/repo (default Sergeant)" }),
        ),
        filePath: Type.Optional(Type.String()),
        ref: Type.Optional(Type.String({ description: "branch/tag/sha" })),
        number: Type.Optional(Type.Integer({ minimum: 1 })),
      }),
      endpoint: "/github",
    },
    {
      name: "github_search",
      description:
        "GitHub Search API across code, issues, or PRs. `repo:owner/name` auto-prepended for code scope.",
      params: Type.Object({
        query: Type.String({ description: "Search query (max 500 chars)" }),
        scope: Type.Optional(
          Type.Union([
            Type.Literal("code"),
            Type.Literal("issues"),
            Type.Literal("prs"),
          ]),
        ),
        repo: Type.Optional(Type.String()),
        perPage: Type.Optional(Type.Integer({ minimum: 1, maximum: 30 })),
        page: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
      }),
      endpoint: "/github/search",
    },
    {
      name: "github_tree",
      description:
        "List files/dirs in a GitHub repo tree at a given ref. Set recursive=true for full tree.",
      params: Type.Object({
        ref: Type.Optional(
          Type.String({ description: "branch/tag/sha (default main)" }),
        ),
        repo: Type.Optional(Type.String()),
        recursive: Type.Optional(Type.Boolean()),
      }),
      endpoint: "/github/tree",
    },
    {
      name: "github_diff",
      description:
        "Compare two refs (branches/SHAs) in a GitHub repo. Returns diff + changed-files summary.",
      params: Type.Object({
        base: Type.String({ description: "Base ref (e.g. main)" }),
        head: Type.String({ description: "Head ref (branch/SHA)" }),
        repo: Type.Optional(Type.String()),
      }),
      endpoint: "/github/diff",
    },
    {
      name: "github_prs",
      description:
        "List GitHub pull requests with filters (state, author, base/head branch, sort).",
      params: Type.Object({
        repo: Type.Optional(Type.String()),
        state: Type.Optional(
          Type.Union([
            Type.Literal("open"),
            Type.Literal("closed"),
            Type.Literal("all"),
          ]),
        ),
        author: Type.Optional(Type.String()),
        head: Type.Optional(Type.String()),
        base: Type.Optional(Type.String()),
        sort: Type.Optional(
          Type.Union([
            Type.Literal("created"),
            Type.Literal("updated"),
            Type.Literal("popularity"),
            Type.Literal("long-running"),
          ]),
        ),
        direction: Type.Optional(
          Type.Union([Type.Literal("asc"), Type.Literal("desc")]),
        ),
        perPage: Type.Optional(Type.Integer({ minimum: 1, maximum: 30 })),
        page: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
      }),
      endpoint: "/github/prs",
    },
    {
      name: "get_github_releases",
      description:
        "Recent releases for a GitHub repo. Defaults to the Sergeant repo.",
      params: Type.Object({
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
        repo: Type.Optional(Type.String()),
      }),
      endpoint: "/github/releases",
    },

    // ─── n8n delegation surface (tier-aware) ────────────────────────
    {
      name: "n8n_list",
      description:
        "List n8n workflows with tier classification (A=auto-refresh, B=digest-only, C=approval-gated, D=webhook-driven).",
      params: Type.Object({
        tiers: Type.Optional(
          Type.Array(
            Type.Union([
              Type.Literal("A"),
              Type.Literal("B"),
              Type.Literal("C"),
              Type.Literal("D"),
            ]),
          ),
        ),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 250 })),
      }),
      endpoint: "/n8n/list",
    },
    {
      name: "n8n_describe",
      description:
        "Describe a single n8n workflow (nodes, triggers, tier, approvalRequired flag).",
      params: Type.Object({
        workflowId: Type.String({ description: "Opaque n8n workflow id" }),
      }),
      endpoint: "/n8n/describe",
    },
    {
      name: "n8n_trigger",
      description:
        "Trigger a Tier A or Tier C n8n workflow. Tier C returns approvalRequired; Tier B/D refused server-side.",
      params: Type.Object({
        workflowId: Type.String({
          description: "Tier A or Tier C workflow id",
        }),
      }),
      endpoint: "/n8n/trigger",
      formatBody: withFounder,
    },
    {
      name: "n8n_activate",
      description:
        "Activate or deactivate a Tier A/C n8n workflow. Always approval-gated server-side.",
      params: Type.Object({
        workflowId: Type.String(),
        active: Type.Boolean({
          description: "true to activate, false to deactivate",
        }),
      }),
      endpoint: "/n8n/activate",
      formatBody: withFounder,
    },
    {
      name: "refresh_business_snapshot",
      description:
        "Fire all (or a subset of) Tier A workflows in parallel and return their outputs as the business snapshot.",
      params: Type.Object({
        workflowIds: Type.Optional(
          Type.Array(Type.String(), { maxItems: 50 }),
        ),
      }),
      endpoint: "/snapshot/refresh",
      formatBody: withFounder,
    },
    {
      name: "read_workflow_logs",
      description:
        "Recent n8n execution logs for a specific workflow. Use to debug failed automations.",
      params: Type.Object({
        workflowId: Type.String(),
        since: Type.Optional(
          Type.String({ description: "ISO-8601 timestamp" }),
        ),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
      }),
      endpoint: "/workflow",
    },

    // ─── Telegram + messaging ───────────────────────────────────────
    {
      name: "read_telegram_topic",
      description:
        "Read recent messages from a Sergeant_ops Telegram topic by name or id.",
      params: Type.Object({
        topic: Type.String({
          description: "Topic name or id (e.g. metrics, errors)",
        }),
        since: Type.Optional(
          Type.String({ description: "ISO-8601 timestamp" }),
        ),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
      }),
      endpoint: "/telegram",
    },

    // ─── SEO providers ──────────────────────────────────────────────
    {
      name: "seo_gsc_query",
      description:
        "Google Search Console: top queries/pages/devices over N days. Returns clicks, impressions, CTR, position.",
      params: Type.Object({
        days: Type.Optional(Type.Integer({ minimum: 1, maximum: 90 })),
        dimension: Type.Optional(
          Type.Union([
            Type.Literal("query"),
            Type.Literal("page"),
            Type.Literal("country"),
            Type.Literal("device"),
          ]),
        ),
        siteUrl: Type.Optional(
          Type.String({
            description: "Site override (sc-domain:example.com or full URL)",
          }),
        ),
        rowLimit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
      }),
      endpoint: "/seo/gsc",
    },
    {
      name: "seo_psi_audit",
      description:
        "PageSpeed Insights / Lighthouse audit for a URL. Returns scores + opportunities.",
      params: Type.Object({
        url: Type.String({
          description: "URL to audit (e.g. https://sergeant.app)",
        }),
        strategy: Type.Optional(
          Type.Union([Type.Literal("mobile"), Type.Literal("desktop")]),
        ),
      }),
      endpoint: "/seo/lighthouse",
    },
    {
      name: "seo_serp_lookup",
      description:
        "SERP API lookup for a query — top organic results, positions, snippets.",
      params: Type.Object({
        query: Type.String(),
        hl: Type.Optional(
          Type.String({ description: "UI language (e.g. uk)" }),
        ),
        gl: Type.Optional(Type.String({ description: "Geo (e.g. ua)" })),
        num: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
      }),
      endpoint: "/seo/serp",
    },

    // ─── Reminders (write but no approval gate) ─────────────────────
    {
      name: "set_reminder",
      description:
        "Schedule a reminder for later delivery via telegram/whatsapp. dueAtIso must include timezone offset.",
      params: Type.Object({
        reminderText: Type.String({ description: "Reminder body" }),
        dueAtIso: Type.String({
          description: "ISO-8601 with TZ (e.g. 2026-05-15T09:00+03:00)",
        }),
        persona: Type.Optional(Type.String()),
        topic: Type.Optional(Type.String()),
        channel: Type.Optional(
          Type.Union([Type.Literal("telegram"), Type.Literal("whatsapp")]),
        ),
        metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
      }),
      endpoint: "/reminders/set",
      formatBody: withFounder,
    },
  ];
}

export default definePluginEntry({
  id: "sergeant",
  name: "Sergeant",
  description:
    "Sergeant agent gateway plugin (Stage 2 — 25 read-tools, no hooks yet)",

  register(api) {
    const candidate =
      (api as { pluginConfig?: unknown }).pluginConfig ??
      (api as { config?: unknown }).config ??
      undefined;
    const merged = resolvePluginConfig(candidate);
    const config = parsePluginConfig(JSON.stringify(merged));

    const http = new OpenClawHttpClient({
      baseUrl: config.serverInternalUrl,
      apiKey: config.internalApiKey,
    });

    const tools = makeTools(config.founderUserId);

    for (const tool of tools) {
      const buildBody = tool.formatBody ?? ((p: Record<string, unknown>) => p);
      api.registerTool({
        name: tool.name,
        description: tool.description,
        parameters: tool.params,
        async execute(_id, params) {
          try {
            const body = buildBody(params);
            const response = await http.post<unknown>(tool.endpoint, body);
            return {
              content: [
                {
                  type: "text",
                  text:
                    typeof response === "string"
                      ? response
                      : JSON.stringify(response, null, 2),
                },
              ],
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
              content: [
                { type: "text", text: `(${tool.name} failed: ${msg})` },
              ],
            };
          }
        },
      });
    }
  },
});

// Public surface for type consumers / tests.
export {
  OpenClawHttpClient,
  OpenClawHttpError,
  type HttpClientOptions,
} from "./http-client.js";
export {
  parsePluginConfig,
  PluginConfigSchema,
  type PluginConfig,
} from "./config.js";
