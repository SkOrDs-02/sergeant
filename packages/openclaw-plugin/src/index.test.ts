/**
 * Tool-registration shape test for the Stage 4a/4b plugin entry. The real
 * `openclaw/plugin-sdk/plugin-entry` and `typebox` modules only live in
 * the runtime stage of `Dockerfile.openclaw-gateway`, so the workspace
 * lockfile doesn't ship them. We mock both with the minimal surface the
 * entry file uses (`definePluginEntry` passthrough + a TypeBox-like
 * builder that records its arguments) and assert the plugin registers
 * exactly the 30 tools we expect — plus the 5 lifecycle hooks added in
 * Stage 4a/4b (`llm_input`, `before_agent_start`, `agent_end`,
 * `before_tool_call`, `before_dispatch`).
 *
 * The execute() smoke checks for each write-tool prove that the entry
 * routes params straight to the correct server endpoint without
 * accidentally swallowing fields (a Stage 2 regression mode). The hook
 * smoke checks prove that each hook is wired and that
 * `before_tool_call` returns the right approval payload shape for the
 * 5 write-tools / pass-through for the 25 read-tools.
 *
 * Hooks register via `api.on(hookName, handler, opts?)` — the canonical
 * lifecycle-hook entrypoint that pushes into `registry.typedHooks` (see
 * `docs/notes/spikes/openclaw-stage-4b-debugging-handoff-2026-05-12.md`
 * § 0.5 for why this matters). The pre-existing `api.registerHook` mock
 * registered for an internal command-bus that does NOT fire for
 * `before_dispatch` etc., so it was the wrong API.
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
  // Lifecycle hooks always register with a single string event name via
  // `api.on(hookName, handler, opts?)`. We keep the type wide here to
  // match the underlying `api.on` signature, but the entry only passes
  // single strings (`"before_dispatch"`, `"llm_input"`, etc.).
  event: string | string[];
  handler: (event: unknown) => unknown;
  // `api.on` only honours `priority` and `timeoutMs`. `opts.name` is
  // NOT part of this contract — that field belongs to the internal
  // command-bus `api.registerHook(events, handler, { name })` API,
  // which is a separate surface and not used by Sergeant. The explicit
  // `| undefined` keeps the mock compatible with `exactOptionalPropertyTypes`.
  opts: { priority?: number; timeoutMs?: number } | undefined;
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
      on: (
        event: string | string[],
        handler: (event: unknown) => unknown,
        opts?: { priority?: number; timeoutMs?: number },
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

describe("Stage 4a/4b/4c/5b/5c plugin entry — hooks registered", () => {
  it("registers exactly the 9 Stage 4a/4b/4c/5b/5c lifecycle hooks via api.on", async () => {
    await import("./index.js");
    // Stage 4c added a second `before_dispatch` registration (Layer 1
    // cheap-router) AFTER the Layer 0 shortcut router. Stage 5b PR-1
    // adds a second `before_agent_start` registration (strategic-mode
    // hook) AFTER the audit-open hook so the audit row keeps the
    // founder's verbatim slash command. Stage 5c adds a THIRD
    // `before_dispatch` (council pre-flight budget gate, between
    // shortcut router and cheap router) AND a THIRD `before_agent_start`
    // (council primer injection, alongside strategic-mode). All shared
    // event names run in registration order; `before_dispatch` is a
    // claiming hook (first `handled: true` wins) and
    // `before_agent_start` merges all results.
    const events = registeredHooks.map((h) => h.event).sort();
    expect(events).toEqual(
      [
        "agent_end",
        "before_agent_start",
        "before_agent_start",
        "before_agent_start",
        "before_dispatch",
        "before_dispatch",
        "before_dispatch",
        "before_tool_call",
        "llm_input",
      ].sort(),
    );
  });

  it("registers `before_dispatch` x3 and `before_agent_start` x3; other hooks unique", async () => {
    await import("./index.js");
    const events = registeredHooks.map((h) => h.event as string);
    expect(events.length).toBe(9);
    const counts = new Map<string, number>();
    for (const e of events) counts.set(e, (counts.get(e) ?? 0) + 1);
    expect(counts.get("before_dispatch")).toBe(3);
    expect(counts.get("before_agent_start")).toBe(3);
    expect(counts.get("llm_input")).toBe(1);
    expect(counts.get("agent_end")).toBe(1);
    expect(counts.get("before_tool_call")).toBe(1);
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

describe("Stage 5b PR-1 + PR-2 + PR-4 — strategic-mode hook wired into before_agent_start", () => {
  it("registers a SECOND before_agent_start handler that activates /plan", async () => {
    await import("./index.js");
    const handlers = registeredHooks.filter(
      (h) => h.event === "before_agent_start",
    );
    // 1st handler = Stage 4a audit-open; 2nd handler = Stage 5b
    // strategic-mode; 3rd handler = Stage 5c council mode. Registration
    // order is asserted upstream by the hook-count tests; here we
    // verify the strategic-mode side returns a `{ prompt, prependContext }`
    // result on a `/plan` prompt.
    expect(handlers).toHaveLength(3);
    const strategic = handlers[1]!;

    const result = (await strategic.handler({
      prompt: "/plan churn-reduction-q3",
      runId: "run_strategic_1",
    })) as { prompt?: string; prependContext?: string } | undefined;

    expect(result).toBeDefined();
    expect(result?.prompt).toBe("churn-reduction-q3");
    expect(result?.prependContext).toMatch(/^STRATEGIC_MODE: plan\./);
    expect(result?.prependContext).toContain("1) GOAL");
    expect(result?.prependContext).toContain("4) DECISION + FOLLOWUP");
  });

  it("activates /analyze with hypothesis-driven primer (PR-2)", async () => {
    await import("./index.js");
    const strategic = registeredHooks.filter(
      (h) => h.event === "before_agent_start",
    )[1]!;

    const result = (await strategic.handler({
      prompt: "/analyze checkout drop from 14:00",
      runId: "run_strategic_analyze_1",
    })) as { prompt?: string; prependContext?: string } | undefined;

    expect(result).toBeDefined();
    expect(result?.prompt).toBe("checkout drop from 14:00");
    expect(result?.prependContext).toMatch(/^STRATEGIC_MODE: analyze\./);
    expect(result?.prependContext).toContain("1) ANOMALY");
    expect(result?.prependContext).toContain("4) RANKED CONCLUSION");
  });

  it("activates bare /okr with OKR-review primer and empty prompt (PR-4)", async () => {
    await import("./index.js");
    const strategic = registeredHooks.filter(
      (h) => h.event === "before_agent_start",
    )[1]!;

    // `/okr` is the only Stage 5b mode where `topicRequired: false` —
    // a bare invocation must still activate the mode. The agent gets
    // `prompt: ""` and reads the primer to drive the review.
    const result = (await strategic.handler({
      prompt: "/okr",
      runId: "run_strategic_okr_bare",
    })) as { prompt?: string; prependContext?: string } | undefined;

    expect(result).toBeDefined();
    expect(result?.prompt).toBe("");
    expect(result?.prependContext).toMatch(/^STRATEGIC_MODE: okr\./);
    expect(result?.prependContext).toContain("1) ACTIVE OKRs");
    expect(result?.prependContext).toContain("4) NEXT ACTIONS");
  });

  it("activates /okr with optional topic forwarded as prompt (PR-4)", async () => {
    await import("./index.js");
    const strategic = registeredHooks.filter(
      (h) => h.event === "before_agent_start",
    )[1]!;

    const result = (await strategic.handler({
      prompt: "/okr Q3 progress",
      runId: "run_strategic_okr_topic",
    })) as { prompt?: string; prependContext?: string } | undefined;

    expect(result).toBeDefined();
    expect(result?.prompt).toBe("Q3 progress");
    expect(result?.prependContext).toMatch(/^STRATEGIC_MODE: okr\./);
  });

  it("strategic-mode handler is a pass-through for non-strategic prompts", async () => {
    await import("./index.js");
    const strategic = registeredHooks.filter(
      (h) => h.event === "before_agent_start",
    )[1]!;

    expect(
      await strategic.handler({
        prompt: "/metrics",
        runId: "run_strategic_2",
      }),
    ).toBeUndefined();
    expect(
      await strategic.handler({
        prompt: "what's our runway?",
        runId: "run_strategic_3",
      }),
    ).toBeUndefined();
    // Bare `/analyze` (no anomaly) must fall through too — topic is
    // required.
    expect(
      await strategic.handler({
        prompt: "/analyze",
        runId: "run_strategic_4",
      }),
    ).toBeUndefined();
    // `/okrs` and `/okrun` must NOT match — word-boundary anchor.
    expect(
      await strategic.handler({
        prompt: "/okrs",
        runId: "run_strategic_5",
      }),
    ).toBeUndefined();
    expect(
      await strategic.handler({
        prompt: "/okrun setup",
        runId: "run_strategic_6",
      }),
    ).toBeUndefined();
  });
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

describe("Stage 5c — council hooks wired into before_dispatch + before_agent_start", () => {
  it("registers a THIRD before_dispatch handler (council gate) between shortcut + cheap router", async () => {
    await import("./index.js");
    const handlers = registeredHooks.filter(
      (h) => h.event === "before_dispatch",
    );
    // Order: [0] shortcut router, [1] council gate, [2] cheap router.
    // Verified by behaviour below (council gate is the only one that
    // POSTs `/budget` for a `/council` prompt).
    expect(handlers).toHaveLength(3);
  });

  it("registers a THIRD before_agent_start handler (council mode) alongside strategic-mode", async () => {
    await import("./index.js");
    const handlers = registeredHooks.filter(
      (h) => h.event === "before_agent_start",
    );
    // Order: [0] audit-open, [1] strategic-mode, [2] council mode.
    expect(handlers).toHaveLength(3);
  });

  it("council gate POSTs to /budget and falls through when remainingUsd ≥ $2.0", async () => {
    await import("./index.js");
    const councilGate = registeredHooks.filter(
      (h) => h.event === "before_dispatch",
    )[1]!;

    fetchCalls.length = 0;
    const result = (await councilGate.handler({
      content: "/council чи вводимо B2B в Q3?",
      channel: "telegram",
      sessionKey: "agent:main:telegram:direct:319824665",
    })) as { handled?: boolean; text?: string };

    expect(result?.handled).toBe(false);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toBe(
      "http://server.local/api/internal/openclaw/budget",
    );
    const body = JSON.parse(String(fetchCalls[0]!.init?.body));
    expect(body).toMatchObject({ founderUserId: "user_test" });
  });

  it("council gate short-circuits when remainingUsd < councilUsdBudget", async () => {
    // Override default mock to simulate headroom below the $2.0 cap.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: unknown) => {
        fetchCalls.push({
          url: typeof input === "string" ? input : String(input),
          init: init as RequestInit | undefined,
        });
        return new Response(
          JSON.stringify({
            allowed: true,
            spentUsd: 8.5,
            budgetUsd: 10,
            remainingUsd: 1.5,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    await import("./index.js");
    const councilGate = registeredHooks.filter(
      (h) => h.event === "before_dispatch",
    )[1]!;

    fetchCalls.length = 0;
    const result = (await councilGate.handler({
      content: "/council Q3 hiring plan",
      channel: "telegram",
      sessionKey: "agent:main:telegram:direct:319824665",
    })) as { handled?: boolean; text?: string };

    expect(result?.handled).toBe(true);
    expect(result?.text).toContain("Council вимагає");
    expect(result?.text).toContain("$2.00");
  });

  it("council gate does NOT call /budget for non-council messages", async () => {
    await import("./index.js");
    const councilGate = registeredHooks.filter(
      (h) => h.event === "before_dispatch",
    )[1]!;

    fetchCalls.length = 0;
    // Layer 0 would normally not have claimed `/metrics`, but the gate
    // is positioned BETWEEN Layer 0 and Layer 1. The point is the gate
    // must skip cheaply when the content doesn't start with `/council`.
    const result = (await councilGate.handler({
      content: "розкажи що ти можеш робити",
      channel: "telegram",
      sessionKey: "agent:main:telegram:direct:319824665",
    })) as { handled?: boolean };

    expect(result?.handled).toBe(false);
    // CRITICAL: no `/budget` round-trip for non-council DMs.
    expect(fetchCalls).toHaveLength(0);
  });

  it("council mode injects COUNCIL_PRIMER and topic via before_agent_start", async () => {
    await import("./index.js");
    const councilMode = registeredHooks.filter(
      (h) => h.event === "before_agent_start",
    )[2]!;

    const result = (await councilMode.handler({
      prompt: "/council Q3 OKR draft",
      runId: "run_council_int",
    })) as { prompt?: string; prependContext?: string } | undefined;

    expect(result).toBeDefined();
    expect(result?.prompt).toBe("Q3 OKR draft");
    expect(result?.prependContext).toMatch(/^COUNCIL_MODE: roundtable/);
    expect(result?.prependContext).toContain("devops → eng → pm → growth");
    expect(result?.prependContext).toContain("synthesis");
  });

  it("council mode handler is a pass-through for non-council prompts", async () => {
    await import("./index.js");
    const councilMode = registeredHooks.filter(
      (h) => h.event === "before_agent_start",
    )[2]!;

    expect(
      await councilMode.handler({
        prompt: "/plan churn-reduction-q3",
        runId: "r1",
      }),
    ).toBeUndefined();
    expect(
      await councilMode.handler({ prompt: "/okr Q3", runId: "r2" }),
    ).toBeUndefined();
    // Bare `/council` falls through so the agent can ask for a topic.
    expect(
      await councilMode.handler({ prompt: "/council", runId: "r3" }),
    ).toBeUndefined();
    // Word-boundary guard.
    expect(
      await councilMode.handler({ prompt: "/councils Q3", runId: "r4" }),
    ).toBeUndefined();
  });
});
