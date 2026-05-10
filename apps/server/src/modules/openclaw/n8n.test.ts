import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stub the `env` module so tests can flip N8N_API_URL / N8N_API_KEY without
// re-importing or relying on `process.env` (`env.ts` snapshots `process.env`
// at module load and re-runs Zod validation, so direct env-var mutation
// would not propagate).
const mockEnv: Record<string, string> = {};
vi.mock("../../env/env.js", () => ({
  env: new Proxy(
    {},
    {
      get(_target, prop: string) {
        return mockEnv[prop] ?? "";
      },
    },
  ),
}));

import {
  __resetN8nAllowlistCacheForTests,
  __setN8nAllowlistForTests,
  activateN8nWorkflow,
  describeN8nWorkflow,
  listN8nWorkflows,
  loadN8nAllowlist,
  N8nAllowlistError,
  refreshBusinessSnapshot,
  triggerN8nWorkflow,
} from "./n8n.js";

/**
 * Tier matrix (mirrors `ops/openclaw/n8n-allowlist.json`):
 *   - WF_A1 / WF_A2 — Tier A (auto-refresh).
 *   - WF_B1        — Tier B (digest-only, not triggerable).
 *   - WF_C1        — Tier C (approval-gated trigger + activate).
 *   - WF_D1        — Tier D (webhook-driven, read-only).
 */
const TEST_ALLOWLIST = {
  workflows: {
    WF_A1: {
      name: "63 — Growth Acquisition Snapshot",
      tier: "A" as const,
      category: "growth",
      approvalRequired: false,
    },
    WF_A2: {
      name: "99 — Heartbeat",
      tier: "A" as const,
      category: "ops",
      approvalRequired: false,
    },
    WF_B1: {
      name: "16 — PostHog Daily Metrics",
      tier: "B" as const,
      category: "data",
    },
    WF_C1: {
      name: "07 — Morning Briefing Push",
      tier: "C" as const,
      category: "growth",
      approvalRequired: true,
    },
    WF_D1: {
      name: "01 — Billing Pipeline",
      tier: "D" as const,
      category: "finance",
    },
  },
};

function setN8nCreds(present: boolean): void {
  if (present) {
    mockEnv["N8N_API_URL"] = "https://n8n.test/";
    mockEnv["N8N_API_KEY"] = "test-key";
  } else {
    delete mockEnv["N8N_API_URL"];
    delete mockEnv["N8N_API_KEY"];
  }
}

beforeEach(() => {
  __resetN8nAllowlistCacheForTests();
  __setN8nAllowlistForTests(TEST_ALLOWLIST);
  setN8nCreds(true);
});

afterEach(() => {
  __resetN8nAllowlistCacheForTests();
  vi.restoreAllMocks();
  delete mockEnv["N8N_API_URL"];
  delete mockEnv["N8N_API_KEY"];
});

function mockFetch(
  responder: (
    url: string,
    init: RequestInit | undefined,
  ) => { status?: number; body?: unknown; text?: string },
) {
  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      const out = responder(url, init);
      const status = out.status ?? 200;
      const text = out.text != null ? out.text : JSON.stringify(out.body ?? {});
      return new Response(text, { status });
    });
  return spy;
}

describe("loadN8nAllowlist", () => {
  it("returns the allowlist injected via __setN8nAllowlistForTests", async () => {
    const allowlist = await loadN8nAllowlist();
    expect(allowlist.workflows["WF_A1"]?.tier).toBe("A");
    expect(allowlist.workflows["WF_D1"]?.tier).toBe("D");
  });
});

describe("listN8nWorkflows", () => {
  it("returns notConfigured=true when n8n creds are missing", async () => {
    setN8nCreds(false);
    const out = await listN8nWorkflows();
    expect(out.notConfigured).toBe(true);
    expect(out.workflows).toEqual([]);
  });

  it("merges allowlist metadata into n8n list output", async () => {
    mockFetch(() => ({
      body: {
        data: [
          {
            id: "WF_A1",
            name: "Growth Acq",
            active: true,
            updatedAt: "2026-05-10T00:00:00Z",
          },
          { id: "WF_B1", name: "PostHog Daily", active: true, updatedAt: null },
          { id: "WF_UNKNOWN", name: "Stranger", active: false },
        ],
      },
    }));

    const out = await listN8nWorkflows();
    expect(out.notConfigured).toBeUndefined();
    expect(out.workflows).toEqual([
      {
        id: "WF_A1",
        name: "Growth Acq",
        active: true,
        tier: "A",
        category: "growth",
        updatedAt: "2026-05-10T00:00:00Z",
      },
      {
        id: "WF_B1",
        name: "PostHog Daily",
        active: true,
        tier: "B",
        category: "data",
        updatedAt: null,
      },
      {
        id: "WF_UNKNOWN",
        name: "Stranger",
        active: false,
        tier: "unknown",
        category: null,
        updatedAt: null,
      },
    ]);
  });

  it("filters by tier when input.tiers is provided", async () => {
    mockFetch(() => ({
      body: {
        data: [
          { id: "WF_A1", name: "A1", active: true },
          { id: "WF_C1", name: "C1", active: true },
          { id: "WF_D1", name: "D1", active: false },
          { id: "WF_UNKNOWN", name: "U", active: true },
        ],
      },
    }));
    const out = await listN8nWorkflows({ tiers: ["A", "C"] });
    expect(out.workflows.map((w) => w.id)).toEqual(["WF_A1", "WF_C1"]);
  });

  it("throws on non-2xx response from n8n", async () => {
    mockFetch(() => ({ status: 503, text: "upstream down" }));
    await expect(listN8nWorkflows()).rejects.toThrow(/returned 503/);
  });
});

describe("describeN8nWorkflow", () => {
  it("returns allowlist-only data with notConfigured when creds missing", async () => {
    setN8nCreds(false);
    const out = await describeN8nWorkflow({ workflowId: "WF_A1" });
    expect(out.notConfigured).toBe(true);
    expect(out.tier).toBe("A");
    expect(out.name).toBe("63 — Growth Acquisition Snapshot");
    expect(out.nodes).toEqual([]);
    expect(out.triggers).toEqual([]);
  });

  it("merges nodes + triggers from n8n with allowlist tier metadata", async () => {
    mockFetch(() => ({
      body: {
        id: "WF_A1",
        name: "Growth Acquisition Snapshot",
        active: true,
        nodes: [
          { name: "Daily Trigger", type: "n8n-nodes-base.cronTrigger" },
          { name: "Get Posthog", type: "n8n-nodes-base.httpRequest" },
          { name: "Webhook", type: "n8n-nodes-base.webhook" },
          { name: "Disabled Node", type: "n8n-nodes-base.set", disabled: true },
        ],
        updatedAt: "2026-05-10T00:00:00Z",
      },
    }));
    const out = await describeN8nWorkflow({ workflowId: "WF_A1" });
    expect(out.tier).toBe("A");
    expect(out.active).toBe(true);
    expect(out.nodes).toHaveLength(4);
    expect(out.triggers).toEqual([
      "n8n-nodes-base.cronTrigger",
      "n8n-nodes-base.webhook",
    ]);
    expect(out.nodes.find((n) => n.name === "Disabled Node")?.disabled).toBe(
      true,
    );
  });

  it("returns tier='unknown' for workflows not in the allowlist", async () => {
    mockFetch(() => ({
      body: { id: "WF_X", name: "Stranger", active: false, nodes: [] },
    }));
    const out = await describeN8nWorkflow({ workflowId: "WF_X" });
    expect(out.tier).toBe("unknown");
    expect(out.category).toBeNull();
    expect(out.approvalRequired).toBeNull();
  });
});

describe("triggerN8nWorkflow", () => {
  it("triggers a Tier A workflow without approval", async () => {
    const spy = mockFetch(() => ({
      body: { data: { executionId: 42 } },
    }));
    const out = await triggerN8nWorkflow({ workflowId: "WF_A1" });
    expect(out.status).toBe("triggered");
    expect(out.tier).toBe("A");
    expect(out.approvalRequired).toBe(false);
    expect(out.executionId).toBe("42");
    expect(spy).toHaveBeenCalledTimes(1);
    const callUrl = String(spy.mock.calls[0]?.[0] ?? "");
    expect(callUrl).toContain("/api/v1/workflows/WF_A1/run");
  });

  it("returns approvalRequired=true for Tier C workflows (server is a relay)", async () => {
    mockFetch(() => ({ body: {} }));
    const out = await triggerN8nWorkflow({ workflowId: "WF_C1" });
    expect(out.status).toBe("triggered");
    expect(out.tier).toBe("C");
    expect(out.approvalRequired).toBe(true);
  });

  it("refuses Tier B with N8nAllowlistError (digest-only)", async () => {
    await expect(
      triggerN8nWorkflow({ workflowId: "WF_B1" }),
    ).rejects.toBeInstanceOf(N8nAllowlistError);
  });

  it("refuses Tier D with N8nAllowlistError (webhook-driven)", async () => {
    await expect(
      triggerN8nWorkflow({ workflowId: "WF_D1" }),
    ).rejects.toBeInstanceOf(N8nAllowlistError);
  });

  it("refuses unknown workflow ids (fail-closed)", async () => {
    await expect(
      triggerN8nWorkflow({ workflowId: "WF_X" }),
    ).rejects.toBeInstanceOf(N8nAllowlistError);
  });

  it("returns status='not_configured' when n8n creds are missing", async () => {
    setN8nCreds(false);
    const out = await triggerN8nWorkflow({ workflowId: "WF_A1" });
    expect(out.status).toBe("not_configured");
  });

  it("returns status='error' when n8n returns non-2xx", async () => {
    mockFetch(() => ({ status: 500, text: "boom" }));
    const out = await triggerN8nWorkflow({ workflowId: "WF_A1" });
    expect(out.status).toBe("error");
    expect(out.note).toContain("HTTP 500");
  });
});

describe("activateN8nWorkflow", () => {
  it("activates a Tier C workflow", async () => {
    const spy = mockFetch(() => ({ body: {} }));
    const out = await activateN8nWorkflow({
      workflowId: "WF_C1",
      active: true,
    });
    expect(out.status).toBe("activated");
    expect(out.approvalRequired).toBe(true);
    expect(String(spy.mock.calls[0]?.[0] ?? "")).toContain(
      "/api/v1/workflows/WF_C1/activate",
    );
  });

  it("deactivates a Tier A workflow", async () => {
    const spy = mockFetch(() => ({ body: {} }));
    const out = await activateN8nWorkflow({
      workflowId: "WF_A1",
      active: false,
    });
    expect(out.status).toBe("deactivated");
    expect(String(spy.mock.calls[0]?.[0] ?? "")).toContain(
      "/api/v1/workflows/WF_A1/deactivate",
    );
  });

  it("refuses unknown / Tier B / Tier D workflows", async () => {
    for (const id of ["WF_X", "WF_B1", "WF_D1"]) {
      await expect(
        activateN8nWorkflow({ workflowId: id, active: true }),
      ).rejects.toBeInstanceOf(N8nAllowlistError);
    }
  });

  it("returns status='not_configured' when n8n creds missing", async () => {
    setN8nCreds(false);
    const out = await activateN8nWorkflow({
      workflowId: "WF_C1",
      active: true,
    });
    expect(out.status).toBe("not_configured");
  });
});

describe("refreshBusinessSnapshot", () => {
  it("fires every Tier A workflow in parallel", async () => {
    const calls: string[] = [];
    mockFetch((url) => {
      calls.push(url);
      return { body: {} };
    });

    const out = await refreshBusinessSnapshot();
    expect(out.triggered).toBe(2);
    expect(out.failed).toBe(0);
    expect(out.notConfigured).toBe(false);
    expect(out.results.map((r) => r.workflowId).sort()).toEqual([
      "WF_A1",
      "WF_A2",
    ]);
    // Both must hit n8n /run.
    expect(calls).toHaveLength(2);
    expect(calls.some((u) => u.includes("/api/v1/workflows/WF_A1/run"))).toBe(
      true,
    );
    expect(calls.some((u) => u.includes("/api/v1/workflows/WF_A2/run"))).toBe(
      true,
    );
  });

  it("respects an explicit workflowIds subset", async () => {
    mockFetch(() => ({ body: {} }));
    const out = await refreshBusinessSnapshot({ workflowIds: ["WF_A1"] });
    expect(out.results.map((r) => r.workflowId)).toEqual(["WF_A1"]);
  });

  it("flags notConfigured=true when n8n creds are missing", async () => {
    setN8nCreds(false);
    const out = await refreshBusinessSnapshot();
    expect(out.notConfigured).toBe(true);
    expect(out.triggered).toBe(0);
    expect(out.results.every((r) => r.status === "not_configured")).toBe(true);
  });

  it("returns partial success when one workflow fails", async () => {
    mockFetch((url) => {
      if (url.includes("WF_A2")) return { status: 500, text: "boom" };
      return { body: {} };
    });
    const out = await refreshBusinessSnapshot();
    expect(out.triggered).toBe(1);
    expect(out.failed).toBe(1);
    const a2 = out.results.find((r) => r.workflowId === "WF_A2");
    expect(a2?.status).toBe("error");
    expect(a2?.note).toContain("HTTP 500");
  });

  it("ignores non-Tier-A entries when allowlist contains other tiers", async () => {
    mockFetch(() => ({ body: {} }));
    const out = await refreshBusinessSnapshot();
    expect(out.results.find((r) => r.workflowId === "WF_C1")).toBeUndefined();
    expect(out.results.find((r) => r.workflowId === "WF_B1")).toBeUndefined();
  });
});
