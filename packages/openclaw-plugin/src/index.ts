/**
 * @sergeant/openclaw-plugin — Stage 1 MVP (rewrite for real openclaw 5.7 API)
 *
 * This is a from-scratch rewrite based on the actual openclaw@2026.5.7 plugin
 * SDK surface (not the guess-stubs in src/legacy/sdk-types.ts that caused
 * cascading registration failures throughout May 2026).
 *
 * Stage 1 scope (PR-A):
 *   - definePluginEntry({ id, name, description, register(api) })
 *   - 3 read tools as proof-of-life: recall_memory, query_app_db, read_github
 *   - NO hooks, NO write tools (those land in PR-C and PR-D)
 *
 * See docs/planning/openclaw-rewrite-plan.md for the multi-stage roadmap.
 * Legacy code (24 read tools, 5 write tools, audit hooks, routers) lives in
 * src/legacy/ — it's reference material, not imported.
 */

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "@sinclair/typebox";
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

export default definePluginEntry({
  id: "sergeant",
  name: "Sergeant",
  description:
    "Sergeant agent gateway plugin (Stage 1 MVP — 3 read tools, no hooks)",

  register(api, ...rest) {
    // DIAGNOSTIC: openclaw 5.7 keeps surfacing the plugin config through an API
    // we haven't identified. Dump every plausible source so the next deploy
    // tells us exactly where to read from. Logger may not exist on api, so
    // double-fall-back to console.
    const logger =
      (api as { logger?: { info: (m: string, f?: unknown) => void } })
        .logger ??
      ({
        info: (m: string, f?: unknown) =>
          console.log(`[sergeant:debug] ${m}`, f ?? ""),
      } as { info: (m: string, f?: unknown) => void });

    try {
      logger.info("sergeant.register.api-introspection", {
        apiKeys: Object.keys(api as object),
        apiConfigType: typeof (api as { config?: unknown }).config,
        apiConfigValue: (api as { config?: unknown }).config,
        apiPluginConfigType: typeof (api as { pluginConfig?: unknown })
          .pluginConfig,
        apiPluginConfigValue: (api as { pluginConfig?: unknown }).pluginConfig,
        restCount: rest.length,
        restTypes: rest.map((r) => typeof r),
        rest0: rest[0],
        rest1: rest[1],
      });
    } catch (e) {
      console.log("[sergeant:debug] introspection error", e);
    }

    // openclaw 5.7 plugin config delivery (per docs.openclaw.ai/plugins/sdk-setup):
    // primary surface is `api.pluginConfig`. We fall back through observed
    // alternates and ultimately to direct process.env — which is what the
    // patch-sergeant-config.mjs `${VAR}` placeholders intend to materialise
    // anyway. The env fallback also unblocks us if openclaw silently strips
    // the plugins.entries.sergeant.config block during one of its 3 startup
    // config rewrites.
    const candidate =
      (api as { pluginConfig?: unknown }).pluginConfig ??
      (api as { config?: unknown }).config ??
      rest[0] ??
      (() => {
        try {
          const fn = (api as { getPluginConfig?: () => unknown })
            .getPluginConfig;
          return typeof fn === "function" ? fn.call(api) : undefined;
        } catch {
          return undefined;
        }
      })() ??
      undefined;

    // Materialise from env if api-delivered config is missing. This is the
    // same set the patch-script tries to inject as ${VAR} placeholders.
    const envFallback = {
      serverInternalUrl: process.env.SERVER_INTERNAL_URL,
      internalApiKey: process.env.INTERNAL_API_KEY,
      founderUserId: process.env.OPENCLAW_FOUNDER_USER_ID,
      maxPerCallUsd: process.env.OPENCLAW_MAX_PER_CALL_USD,
      councilUsdBudget: process.env.OPENCLAW_COUNCIL_USD_BUDGET,
      approvalVariant: process.env.OPENCLAW_APPROVAL_VARIANT,
      cheapRouterSystemPromptPath:
        process.env.OPENCLAW_CHEAP_ROUTER_PROMPT_PATH,
    };

    // Merge: candidate (if present) wins per-key over env fallback — but
    // skip literal `${VAR}` placeholders that openclaw 5.7 may forward
    // un-substituted (the patch-sergeant-config.mjs script seeds those).
    const candidateObj =
      typeof candidate === "string"
        ? safeJsonParse(candidate)
        : (candidate as Record<string, unknown> | undefined) ?? {};
    const merged: Record<string, unknown> = { ...envFallback };
    const isUnresolvedPlaceholder = (v: unknown): boolean =>
      typeof v === "string" && /^\$\{[A-Z0-9_:.-]+\}$/.test(v.trim());
    for (const [k, v] of Object.entries(candidateObj)) {
      if (v === undefined || v === null || v === "") continue;
      if (isUnresolvedPlaceholder(v)) continue;
      merged[k] = v;
    }

    logger.info("sergeant.register.config-resolved", {
      candidateSource: candidate === undefined ? "none" : typeof candidate,
      envHasServerUrl: typeof envFallback.serverInternalUrl === "string",
      envHasApiKey: typeof envFallback.internalApiKey === "string",
      envHasFounder: typeof envFallback.founderUserId === "string",
    });

    const config = parsePluginConfig(JSON.stringify(merged));

    const http = new OpenClawHttpClient({
      baseUrl: config.serverInternalUrl,
      apiKey: config.internalApiKey,
    });

    // ─── recall_memory ──────────────────────────────────────────────
    api.registerTool({
      name: "recall_memory",
      description: "Top-k semantic recall from founder memory namespace.",
      parameters: Type.Object({
        query: Type.String({ description: "Search query" }),
        topK: Type.Optional(
          Type.Number({ default: 5, minimum: 1, maximum: 50 }),
        ),
      }),
      async execute(_id, params) {
        const p = params as { query: string; topK?: number };
        const response = await http.post<{ results: unknown[] }>(
          "/api/internal/openclaw/recall",
          {
            query: p.query,
            topK: p.topK ?? 5,
            founderUserId: config.founderUserId,
          },
        );
        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        };
      },
    });

    // ─── query_app_db ───────────────────────────────────────────────
    api.registerTool({
      name: "query_app_db",
      description: "Read-only SQL against app database (whitelisted queries).",
      parameters: Type.Object({
        queryName: Type.String({
          description: "Whitelisted query identifier",
        }),
        params: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
      }),
      async execute(_id, params) {
        const p = params as {
          queryName: string;
          params?: Record<string, unknown>;
        };
        const response = await http.post<{ rows: unknown[] }>(
          "/api/internal/openclaw/db/query",
          { queryName: p.queryName, params: p.params ?? {} },
        );
        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        };
      },
    });

    // ─── read_github ────────────────────────────────────────────────
    api.registerTool({
      name: "read_github",
      description: "Read a file or directory from a GitHub repository.",
      parameters: Type.Object({
        repoSlug: Type.String({
          description: "owner/repo format (e.g. Skords-01/Sergeant)",
        }),
        path: Type.String({ description: "Path within the repository" }),
        ref: Type.Optional(
          Type.String({
            default: "main",
            description: "Branch, tag, or commit SHA",
          }),
        ),
      }),
      async execute(_id, params) {
        const p = params as { repoSlug: string; path: string; ref?: string };
        const response = await http.post<{ content: string }>(
          "/api/internal/openclaw/github/read",
          {
            repoSlug: p.repoSlug,
            path: p.path,
            ref: p.ref ?? "main",
          },
        );
        return {
          content: [{ type: "text", text: response.content }],
        };
      },
    });
  },
});

// Public surface for type consumers and tests that still need shared utilities.
// Everything else lives in src/legacy/ until migrated.
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
