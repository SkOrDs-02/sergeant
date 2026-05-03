import { describe, expect, it } from "vitest";
import {
  ApprovalStore,
  PendingApprovalsCollector,
  WRITE_TOOL_NAMES,
  isWriteToolName,
} from "./approval-store.js";

function makeStore(
  opts: {
    ttlMs?: number;
    startAt?: number;
    ids?: string[];
  } = {},
) {
  let clock = opts.startAt ?? 1_000_000;
  let i = 0;
  const store = new ApprovalStore({
    ttlMs: opts.ttlMs ?? 600_000,
    now: () => clock,
    idGen: () => (opts.ids ? (opts.ids[i++] ?? `id-${i}`) : `id-${++i}`),
  });
  return {
    store,
    advance: (ms: number) => {
      clock += ms;
    },
    setNow: (ms: number) => {
      clock = ms;
    },
  };
}

describe("ApprovalStore — write-tool registry", () => {
  it("WRITE_TOOL_NAMES contains exactly the 5 Phase 4 tools", () => {
    expect([...WRITE_TOOL_NAMES].sort()).toEqual(
      [
        "commit_to_strategy_doc",
        "create_github_issue",
        "mute_alert",
        "pause_workflow",
        "post_to_topic",
      ].sort(),
    );
  });

  it("isWriteToolName accepts each registered write-tool", () => {
    for (const name of WRITE_TOOL_NAMES) {
      expect(isWriteToolName(name)).toBe(true);
    }
  });

  it("isWriteToolName rejects unknown / read-only tools", () => {
    for (const name of [
      "recall_memory",
      "read_strategy_docs",
      "get_stripe_metrics",
      "get_sentry_issues",
      "",
      "POST_TO_TOPIC", // case-sensitive
      "definitely_not_a_tool",
    ]) {
      expect(isWriteToolName(name)).toBe(false);
    }
  });
});

describe("ApprovalStore — create + get lifecycle", () => {
  it("create returns a pending record with stable ttl-derived expiry", () => {
    const { store } = makeStore({ ttlMs: 600_000, startAt: 100 });
    const r = store.create({
      tool: "create_github_issue",
      input: { title: "x", body: "y" },
      founderUserId: "user_1",
      founderTgUserId: 123,
      invocationId: 7,
    });
    expect(r.id).toBe("id-1");
    expect(r.tool).toBe("create_github_issue");
    expect(r.input).toEqual({ title: "x", body: "y" });
    expect(r.status).toBe("pending");
    expect(r.createdAt).toBe(100);
    expect(r.expiresAt).toBe(100 + 600_000);
    expect(r.founderUserId).toBe("user_1");
    expect(r.founderTgUserId).toBe(123);
    expect(r.invocationId).toBe(7);
  });

  it("get returns the record while pending and not expired", () => {
    const { store } = makeStore();
    const r = store.create({
      tool: "post_to_topic",
      input: { alias: "ops", text: "hi" },
      founderUserId: "u",
      founderTgUserId: 1,
    });
    expect(store.get(r.id)?.id).toBe(r.id);
  });

  it("get returns undefined for unknown ids", () => {
    const { store } = makeStore();
    expect(store.get("does-not-exist")).toBeUndefined();
  });

  it("get returns undefined after expiry", () => {
    const { store, advance } = makeStore({ ttlMs: 100 });
    const r = store.create({
      tool: "mute_alert",
      input: { issueId: "abc" },
      founderUserId: "u",
      founderTgUserId: 1,
    });
    advance(101);
    expect(store.get(r.id)).toBeUndefined();
  });

  it("expiry is exclusive at the boundary (=ttl returns undefined)", () => {
    const { store, advance } = makeStore({ ttlMs: 100 });
    const r = store.create({
      tool: "pause_workflow",
      input: { workflowId: "WF-15" },
      founderUserId: "u",
      founderTgUserId: 1,
    });
    advance(99);
    expect(store.get(r.id)).toBeDefined();
    advance(1); // now exactly at expiresAt
    expect(store.get(r.id)).toBeUndefined();
  });
});

describe("ApprovalStore — markExecuted / markRejected", () => {
  it("markExecuted transitions a pending record and idempotently no-ops afterwards", () => {
    const { store } = makeStore();
    const r = store.create({
      tool: "commit_to_strategy_doc",
      input: { path: "docs/strategy/q3.md", body: "TBD" },
      founderUserId: "u",
      founderTgUserId: 1,
    });
    const first = store.markExecuted(r.id);
    expect(first?.status).toBe("executed");
    // Second click on the same button — no-op (record is no longer "pending").
    expect(store.markExecuted(r.id)).toBeUndefined();
    expect(store.get(r.id)).toBeUndefined();
  });

  it("markRejected transitions a pending record and idempotently no-ops afterwards", () => {
    const { store } = makeStore();
    const r = store.create({
      tool: "create_github_issue",
      input: { title: "t", body: "b" },
      founderUserId: "u",
      founderTgUserId: 1,
    });
    const first = store.markRejected(r.id);
    expect(first?.status).toBe("rejected");
    expect(store.markRejected(r.id)).toBeUndefined();
    expect(store.get(r.id)).toBeUndefined();
  });

  it("markExecuted on an expired record is a no-op (cannot resurrect)", () => {
    const { store, advance } = makeStore({ ttlMs: 50 });
    const r = store.create({
      tool: "post_to_topic",
      input: { alias: "ops", text: "x" },
      founderUserId: "u",
      founderTgUserId: 1,
    });
    advance(51);
    expect(store.markExecuted(r.id)).toBeUndefined();
  });

  it("approve and reject are mutually exclusive — second wins-no-op", () => {
    const { store } = makeStore();
    const r = store.create({
      tool: "mute_alert",
      input: { issueId: "abc" },
      founderUserId: "u",
      founderTgUserId: 1,
    });
    const ex = store.markExecuted(r.id);
    expect(ex?.status).toBe("executed");
    // Rejecting after execute does nothing (status is no longer pending).
    expect(store.markRejected(r.id)).toBeUndefined();
    // get() also reports nothing — record is "consumed".
    expect(store.get(r.id)).toBeUndefined();
  });
});

describe("ApprovalStore — gc + pendingCount", () => {
  it("gc removes only expired/final records, keeps pending fresh ones", () => {
    const { store, advance } = makeStore({ ttlMs: 100 });
    const fresh = store.create({
      tool: "pause_workflow",
      input: { workflowId: "WF-01" },
      founderUserId: "u",
      founderTgUserId: 1,
    });
    const willExpire = store.create({
      tool: "pause_workflow",
      input: { workflowId: "WF-02" },
      founderUserId: "u",
      founderTgUserId: 1,
    });
    advance(101);
    // Fresh-clock advance has expired both — recreate fresh after the jump.
    const reallyFresh = store.create({
      tool: "pause_workflow",
      input: { workflowId: "WF-03" },
      founderUserId: "u",
      founderTgUserId: 1,
    });
    store.gc();
    expect(store.get(fresh.id)).toBeUndefined();
    expect(store.get(willExpire.id)).toBeUndefined();
    expect(store.get(reallyFresh.id)?.id).toBe(reallyFresh.id);
    expect(store.pendingCount()).toBe(1);
  });

  it("pendingCount drops to 0 once all records consumed", () => {
    const { store } = makeStore();
    const r1 = store.create({
      tool: "pause_workflow",
      input: { workflowId: "WF-1" },
      founderUserId: "u",
      founderTgUserId: 1,
    });
    const r2 = store.create({
      tool: "pause_workflow",
      input: { workflowId: "WF-2" },
      founderUserId: "u",
      founderTgUserId: 1,
    });
    expect(store.pendingCount()).toBe(2);
    store.markExecuted(r1.id);
    store.markRejected(r2.id);
    expect(store.pendingCount()).toBe(0);
  });
});

describe("PendingApprovalsCollector", () => {
  it("collects records and drains them in insertion order", () => {
    const { store } = makeStore();
    const collector = new PendingApprovalsCollector();
    const r1 = store.create({
      tool: "create_github_issue",
      input: { title: "a", body: "b" },
      founderUserId: "u",
      founderTgUserId: 1,
    });
    const r2 = store.create({
      tool: "post_to_topic",
      input: { alias: "ops", text: "x" },
      founderUserId: "u",
      founderTgUserId: 1,
    });
    collector.add(r1);
    collector.add(r2);
    expect(collector.size()).toBe(2);
    const drained = collector.drain();
    expect(drained.map((r) => r.id)).toEqual([r1.id, r2.id]);
  });

  it("drain leaves the collector empty for the next turn", () => {
    const collector = new PendingApprovalsCollector();
    const { store } = makeStore();
    collector.add(
      store.create({
        tool: "mute_alert",
        input: { issueId: "x" },
        founderUserId: "u",
        founderTgUserId: 1,
      }),
    );
    collector.drain();
    expect(collector.size()).toBe(0);
    expect(collector.drain()).toEqual([]);
  });
});
