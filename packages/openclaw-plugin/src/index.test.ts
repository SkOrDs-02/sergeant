/**
 * Tool-registration shape test for the Stage 4a plugin entry. The real
 * `openclaw/plugin-sdk/plugin-entry` and `typebox` modules only live in
 * the runtime stage of `Dockerfile.openclaw-gateway`, so the workspace
 * lockfile doesn't ship them. We mock both with the minimal surface the
 * entry file uses (`definePluginEntry` passthrough + a TypeBox-like
 * builder that records its arguments) and assert the plugin registers
 * exactly the 30 tools we expect — plus the 5 hooks added in Stage 4a/4b
 * (`llm_input`, `before_agent_start`, `agent_end`, `before_tool_call`,
 * `before_dispatch`).
 *
 * The execute() smoke checks for each write-tool prove that the entry
 * routes params straight to the correct server endpoint without
 * accidentally swallowing fields (a Stage 2 regression mode). The hook
 * smoke checks prove that each hook is wired and that
 * `before_tool_call` returns the right approval payload shape for the
 * 5 write-tools / pass-through for the 25 read-tools.
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

interface RegisteredHook {
  event: string | string[];
  handler: (event: unknown) => unknown;
  // `name` is REQUIRED by openclaw 5.7 (`loader-B-GXgDrk.js:1490`):
  // `requireRegistrationValue(entry?.hook.name ?? opts?.name?.trim(),
  //  "hook registration missing name")`. Without it every hook reg
  // throws and is swallowed by our try/catch. The test mock captures
  // the full opts object so we can assert `name` is supplied. The
  // explicit `| undefined` is needed under `exactOptionalPropertyTypes`.
  opts: { name?: string; priority?: number; timeoutMs?: number } | undefined;
}

const registered: MockTool[] = [];
const registeredHooks: RegisteredHook[] = [];
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
        founderTgUserId: 42,
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
      registerHook: (
        event: string | string[],
        handler: (event: unknown) => unknown,
        opts?: { name?: string; priority?: number; timeoutMs?: number },
      ) => {
        registeredHooks.push({ event, handler, opts });
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
  registeredHooks.length = 0;
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
      return new Response(
        JSON.stringify({
          ok: true,
          allowed: true,
          invocationId: 1,
          spentUsd: 0,
          budgetUsd: 5,
          remainingUsd: 5,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  );
  vi.stubEnv("SERVER_INTERNAL_URL", "http://server.local");
  vi.stubEnv("INTERNAL_API_KEY", "x".repeat(32));
  vi.stubEnv("OPENCLAW_FOUNDER_USER_ID", "user_test");
  vi.stubEnv("OPENCLAW_FOUNDER_TG_USER_ID", "42");
});

describe("Stage 4a plugin entry — tool catalog", () => {
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

describe("Stage 4a plugin entry — write-tool execute() routing", () => {
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

describe("Stage 4a/4b plugin entry — hooks registered", () => {
  it("registers exactly the 5 Stage 4a/4b hooks via api.registerHook", async () => {
    await import("./index.js");
    const events = registeredHooks.map((h) => h.event).sort();
    expect(events).toEqual(
      [
        "agent_end",
        "before_agent_start",
        "before_dispatch",
        "before_tool_call",
        "llm_input",
      ].sort(),
    );
  });

  it("passes a unique non-empty `opts.name` to every registerHook call (openclaw 5.7 loader contract)", async () => {
    await import("./index.js");
    // Every hook MUST have a name — `loader-B-GXgDrk.js:1490` throws
    // `Error: hook registration missing name` otherwise. The Stage 4a/4b
    // 2026-05-12 live smoke-test regression was 5/5 silent failures here.
    const names = registeredHooks.map((h) => h.opts?.name);
    for (const name of names) {
      expect(typeof name).toBe("string");
      expect((name ?? "").trim().length).toBeGreaterThan(0);
    }
    // Names must be unique — loader's `existingHook` check rejects
    // duplicates and would push a diagnostic instead of registering.
    expect(new Set(names).size).toBe(registeredHooks.length);
    // Sanity-check the expected canonical names so a typo (e.g.
    // "shortcutrouter" vs "shortcut-router") is caught at PR time.
    const byEvent = new Map(
      registeredHooks.map((h) => [h.event as string, h.opts?.name] as const),
    );
    expect(byEvent.get("before_dispatch")).toBe("sergeant.shortcut-router");
    expect(byEvent.get("llm_input")).toBe("sergeant.budget-gate");
    expect(byEvent.get("before_agent_start")).toBe(
      "sergeant.audit.before-agent-start",
    );
    expect(byEvent.get("agent_end")).toBe("sergeant.audit.agent-end");
    expect(byEvent.get("before_tool_call")).toBe("sergeant.write-approval");
  });

  it("llm_input handler POSTs to /budget and lets allowed calls through", async () => {
    await import("./index.js");
    const llmInput = registeredHooks.find((h) => h.event === "llm_input");
    expect(llmInput).toBeDefined();

    fetchCalls.length = 0;
    const result = await llmInput!.handler({ runId: "run_test" });
    expect(result).toBeUndefined();

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toBe(
      "http://server.local/api/internal/openclaw/budget",
    );
    expect(fetchCalls[0]!.init?.method).toBe("POST");
    const body = JSON.parse(String(fetchCalls[0]!.init?.body));
    expect(body).toMatchObject({ founderUserId: "user_test" });
  });

  it("before_agent_start handler POSTs to /invocations/open", async () => {
    await import("./index.js");
    const open = registeredHooks.find((h) => h.event === "before_agent_start");
    expect(open).toBeDefined();

    fetchCalls.length = 0;
    await open!.handler({
      runId: "run_open",
      trigger: "dm",
      userMessage: "Привіт",
    });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toBe(
      "http://server.local/api/internal/openclaw/invocations/open",
    );
    const body = JSON.parse(String(fetchCalls[0]!.init?.body));
    expect(body).toMatchObject({
      founderUserId: "user_test",
      founderTgUserId: 42,
      trigger: "dm",
      userMessage: "Привіт",
    });
  });

  it("agent_end handler POSTs to /invocations/finalize", async () => {
    await import("./index.js");
    const open = registeredHooks.find((h) => h.event === "before_agent_start")!;
    const end = registeredHooks.find((h) => h.event === "agent_end")!;

    // First open an invocation so the correlator has a row to consume.
    // Stage 4b shortcut router lives on a different event (`before_dispatch`),
    // so the Stage 4a audit-open hook always runs to completion when
    // `before_agent_start` fires.
    await open.handler({
      runId: "run_lifecycle",
      trigger: "dm",
      userMessage: "Зроби короткий апдейт по тижню",
    });
    fetchCalls.length = 0;

    await end.handler({
      runId: "run_lifecycle",
      status: "success",
      costUsd: 0.04,
      durationMs: 1234,
      iterations: 2,
    });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toBe(
      "http://server.local/api/internal/openclaw/invocations/finalize",
    );
    const body = JSON.parse(String(fetchCalls[0]!.init?.body));
    expect(body).toMatchObject({
      invocationId: 1,
      status: "success",
      costUsd: 0.04,
      durationMs: 1234,
      iterations: 2,
    });
  });

  it.each(WRITE_TOOL_NAMES)(
    "before_tool_call returns requireApproval for %s",
    async (toolName) => {
      await import("./index.js");
      const hook = registeredHooks.find((h) => h.event === "before_tool_call")!;
      const result = (await hook.handler({
        toolName,
        params: {
          title: "x",
          path: "p",
          topic: "t",
          workflowId: "w",
          issueId: "i",
          message: "m",
          text: "T",
          reason: "R",
        },
        toolCallId: `tc_${toolName}`,
      })) as { requireApproval?: { title: string; description: string } };

      expect(result.requireApproval).toBeDefined();
      expect(result.requireApproval!.title).toContain(toolName);
      expect(result.requireApproval!.description.length).toBeGreaterThan(0);
    },
  );

  it.each(READ_TOOL_NAMES)(
    "before_tool_call passes %s through (no approval needed)",
    async (toolName) => {
      await import("./index.js");
      const hook = registeredHooks.find((h) => h.event === "before_tool_call")!;
      const result = await hook.handler({
        toolName,
        params: {},
        toolCallId: `tc_${toolName}`,
      });
      expect(result).toBeUndefined();
    },
  );
});

describe("Stage 4b — Layer 0 shortcut router wired into before_dispatch", () => {
  it("matches /metrics and claims dispatch with the rendered response as `text`", async () => {
    await import("./index.js");
    const dispatch = registeredHooks.find(
      (h) => h.event === "before_dispatch",
    )!;
    fetchCalls.length = 0;

    const result = (await dispatch.handler({
      content: "/metrics",
      channel: "telegram",
      sessionKey: "agent:main:telegram:direct:319824665",
    })) as { handled?: boolean; text?: string };

    expect(result?.handled).toBe(true);
    expect(result?.text).not.toMatch(/^__ROUTED__:/);
    expect(result?.text).toContain("Метрики сьогодні");
    // Tools fanned out: HTTP calls to PostHog/Stripe/Sentry endpoints.
    // Audit-open hook lives on `before_agent_start` (different event)
    // and is not exercised by this `before_dispatch` invocation.
    const postedUrls = fetchCalls.map((c) => c.url);
    expect(postedUrls).not.toContain(
      "http://server.local/api/internal/openclaw/invocations/open",
    );
    expect(postedUrls.some((u) => u.includes("/posthog"))).toBe(true);
    expect(postedUrls.some((u) => u.includes("/stripe"))).toBe(true);
    expect(postedUrls.some((u) => u.includes("/sentry"))).toBe(true);
  });

  it("Ukrainian phrase 'дай метрики' also routes through the shortcut", async () => {
    await import("./index.js");
    const dispatch = registeredHooks.find(
      (h) => h.event === "before_dispatch",
    )!;
    fetchCalls.length = 0;

    const result = (await dispatch.handler({
      content: "дай метрики",
      channel: "telegram",
      sessionKey: "agent:main:telegram:direct:319824665",
    })) as { handled?: boolean; text?: string };

    expect(result?.handled).toBe(true);
    expect(result?.text).not.toMatch(/^__ROUTED__:/);
    expect(result?.text).toContain("Метрики сьогодні");
  });

  it("/think escalates to Layer 2 (does NOT claim dispatch)", async () => {
    await import("./index.js");
    const dispatch = registeredHooks.find(
      (h) => h.event === "before_dispatch",
    )!;
    fetchCalls.length = 0;

    const result = (await dispatch.handler({
      content: "/think скільки коштує одиниця залучення",
      channel: "telegram",
      sessionKey: "agent:main:telegram:direct:319824665",
    })) as { handled?: boolean };

    // /think falls through to the agent (audit-open will run on
    // `before_agent_start` once the runtime dispatches the agent).
    expect(result?.handled).toBe(false);
    // No /invocations/open fired from this hook — audit-open is wired
    // to a different event.
    const postedUrls = fetchCalls.map((c) => c.url);
    expect(postedUrls).not.toContain(
      "http://server.local/api/internal/openclaw/invocations/open",
    );
  });

  it("non-shortcut message returns { handled: false } so the runtime dispatches the agent", async () => {
    await import("./index.js");
    const dispatch = registeredHooks.find(
      (h) => h.event === "before_dispatch",
    )!;
    fetchCalls.length = 0;

    const result = (await dispatch.handler({
      content: "розкажи що ти можеш робити",
      channel: "telegram",
      sessionKey: "agent:main:telegram:direct:319824665",
    })) as { handled?: boolean };

    expect(result?.handled).toBe(false);
    expect(fetchCalls).toHaveLength(0);
  });
});
