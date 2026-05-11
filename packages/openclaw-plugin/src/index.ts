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

export default definePluginEntry({
  id: "sergeant",
  name: "Sergeant",
  description:
    "Sergeant agent gateway plugin (Stage 1 MVP — 3 read tools, no hooks)",

  register(api) {
    // openclaw 5.7 injects parsed config via api.config. Accept api.pluginConfig
    // and a raw string as defensive fallbacks (older runtimes / unknowns).
    const rawConfig =
      (api as { config?: unknown }).config ??
      (api as { pluginConfig?: unknown }).pluginConfig ??
      {};
    const config = parsePluginConfig(
      typeof rawConfig === "string" ? rawConfig : JSON.stringify(rawConfig),
    );

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
