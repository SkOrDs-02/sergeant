/**
 * Tool-registration shape test for the Stage 3 plugin entry. The real
 * `openclaw/plugin-sdk/plugin-entry` and `typebox` modules only live in
 * the runtime stage of `Dockerfile.openclaw-gateway`, so the workspace
 * lockfile doesn't ship them. We mock both with the minimal surface the
 * entry file uses (`definePluginEntry` passthrough + a TypeBox-like
 * builder that records its arguments) and assert the plugin registers
 * exactly the 30 tools we expect — including the 5 write-tools added in
 * Stage 3a/3b.
 *
 * The execute() smoke checks for each write-tool prove that the entry
 * routes params straight to the correct server endpoint without
 * accidentally swallowing fields (a Stage 2 regression mode).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

interface MockTool {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute: (
    invocationId: string,
    params: Record<string, unknown>,
  ) => Promise<{ content: unknown[]; details: unknown }>;
}

const registered: MockTool[] = [];
const fetchCalls: { url: string; init: RequestInit | undefined }[] = [];

vi.mock("openclaw/plugin-sdk/plugin-entry", () => ({
  definePluginEntry: (def: {
    id: string;
    name: string;
    description: string;
    register: (api: unknown) => void;
  }) => {
    const api = {
      id: def.id,
      name: def.name,
      description: def.description,
      pluginConfig: {
        serverInternalUrl: "http://server.local",
        internalApiKey: "x".repeat(32),
        founderUserId: "user_test",
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
      registerTool: (tool: MockTool) => {
        registered.push(tool);
      },
    };
    def.register(api);
    return def;
  },
}));

// Minimal TypeBox-shaped stand-in. The plugin only reads `Type.Object(...)`
// etc. as opaque values to hand to the host — we never validate inputs
// in unit tests, just confirm shape goes through unchanged.
vi.mock("typebox", () => {
  const wrap =
    (kind: string) =>
    (...args: unknown[]) => ({
      __kind: kind,
      args,
    });
  return {
    Type: {
      Object: wrap("object"),
      String: wrap("string"),
      Integer: wrap("integer"),
      Number: wrap("number"),
      Boolean: wrap("boolean"),
      Array: wrap("array"),
      Optional: wrap("optional"),
      Union: wrap("union"),
      Literal: wrap("literal"),
      Record: wrap("record"),
      Unknown: wrap("unknown"),
      Null: wrap("null"),
      Any: wrap("any"),
    },
  };
});

const READ_TOOL_NAMES = [
  "recall_memory",
  "read_strategy_docs",
  "record_decision",
  "query_app_db",
  "get_server_stats",
  "get_stripe_metrics",
  "get_posthog_stats",
  "get_sentry_issues",
  "read_github",
  "github_search",
  "github_tree",
  "github_diff",
  "github_prs",
  "get_github_releases",
  "n8n_list",
  "n8n_describe",
  "n8n_trigger",
  "n8n_activate",
  "refresh_business_snapshot",
  "read_workflow_logs",
  "read_telegram_topic",
  "seo_gsc_query",
  "seo_psi_audit",
  "seo_serp_lookup",
  "set_reminder",
] as const;

const WRITE_TOOL_NAMES = [
  "create_github_issue",
  "commit_to_strategy_doc",
  "post_to_topic",
  "pause_workflow",
  "mute_alert",
] as const;

const WRITE_TOOL_ENDPOINTS: Record<(typeof WRITE_TOOL_NAMES)[number], string> =
  {
    create_github_issue: "/api/internal/openclaw/write/github-issue",
    commit_to_strategy_doc: "/api/internal/openclaw/write/strategy-doc",
    post_to_topic: "/api/internal/openclaw/write/post-to-topic",
    pause_workflow: "/api/internal/openclaw/write/pause-workflow",
    mute_alert: "/api/internal/openclaw/write/mute-alert",
  };

beforeEach(() => {
  registered.length = 0;
  fetchCalls.length = 0;
  // index.ts runs `definePluginEntry` at module-load time, so we must
  // re-import the module per test to get fresh `registered` entries.
  vi.resetModules();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: unknown) => {
      fetchCalls.push({
        url: typeof input === "string" ? input : String(input),
        init: init as RequestInit | undefined,
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  vi.stubEnv("SERVER_INTERNAL_URL", "http://server.local");
  vi.stubEnv("INTERNAL_API_KEY", "x".repeat(32));
  vi.stubEnv("OPENCLAW_FOUNDER_USER_ID", "user_test");
});

describe("Stage 3 plugin entry — tool catalog", () => {
  it("registers exactly the 25 read-tools + 5 write-tools", async () => {
    await import("./index.js");
    const names = registered.map((t) => t.name).sort();
    const expected = [...READ_TOOL_NAMES, ...WRITE_TOOL_NAMES].sort();
    expect(names).toEqual(expected);
  });

  it("every write-tool exposes a label (pi-agent-core requirement)", async () => {
    await import("./index.js");
    for (const name of WRITE_TOOL_NAMES) {
      const tool = registered.find((t) => t.name === name);
      expect(tool, `${name} must be registered`).toBeDefined();
      expect(tool!.label, `${name} must have a label`).toBeTruthy();
    }
  });

  it("every write-tool description marks it as a mutating action", async () => {
    await import("./index.js");
    for (const name of WRITE_TOOL_NAMES) {
      const tool = registered.find((t) => t.name === name)!;
      expect(
        tool.description,
        `${name}: description must signal write/mutating intent`,
      ).toMatch(/WRITE|Mutating/);
    }
  });
});

describe("Stage 3 plugin entry — write-tool execute() routing", () => {
  it.each([
    [
      "create_github_issue",
      {
        title: "Glitch in finyk export",
        body: "Found a regression on /export",
        labels: ["bug", "p1"],
      },
    ],
    [
      "commit_to_strategy_doc",
      {
        path: "docs/strategy/q3-2026.md",
        content: "# Q3\n\nFocus on retention.",
        message: "docs(strategy): Q3 2026 retention focus",
      },
    ],
    [
      "post_to_topic",
      { topic: "releases", text: "Released v1.2.3 to production." },
    ],
    [
      "pause_workflow",
      { workflowId: "wf_42", reason: "Noisy retries; investigating" },
    ],
    [
      "mute_alert",
      {
        issueId: "SENT-12345",
        untilIso: "2026-05-20T09:00+03:00",
      },
    ],
  ] as const)(
    "%s POSTs to its server endpoint with params verbatim",
    async (name, params) => {
      await import("./index.js");
      const tool = registered.find((t) => t.name === name);
      expect(tool, `${name} must be registered`).toBeDefined();

      fetchCalls.length = 0;
      const result = await tool!.execute(
        "call_1",
        params as Record<string, unknown>,
      );

      expect(fetchCalls).toHaveLength(1);
      const call = fetchCalls[0]!;
      expect(call.url).toBe(`http://server.local${WRITE_TOOL_ENDPOINTS[name]}`);
      expect(call.init?.method).toBe("POST");
      const bodyParsed = JSON.parse(String(call.init?.body));
      // Write-tool bodies pass through verbatim — server-side validation
      // is the canonical contract (no founderUserId injection like the
      // recall/decision read-tools).
      expect(bodyParsed).toEqual(params);
      expect(result.content).toEqual([
        expect.objectContaining({ type: "text" }),
      ]);
    },
  );
});
