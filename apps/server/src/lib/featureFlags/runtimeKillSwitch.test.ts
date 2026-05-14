import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetKillSwitchesForTest,
  activateKillSwitch,
  deactivateKillSwitch,
  isKillSwitchActive,
  listActiveKillSwitches,
} from "./runtimeKillSwitch.js";

describe("runtimeKillSwitch", () => {
  beforeEach(() => {
    __resetKillSwitchesForTest();
  });

  it("defaults all switches to inactive", () => {
    expect(isKillSwitchActive("mono_ai_memory_ingest")).toBe(false);
    expect(isKillSwitchActive("rag_retrieval")).toBe(false);
    expect(isKillSwitchActive("rag_eval_weekly")).toBe(false);
    expect(listActiveKillSwitches()).toEqual([]);
  });

  it("activates a switch and reports it as active", () => {
    activateKillSwitch("mono_ai_memory_ingest", {
      reason: "test: rag-eval kill",
      context: { recall: 0.3, mode: "live" },
    });
    expect(isKillSwitchActive("mono_ai_memory_ingest")).toBe(true);
    const active = listActiveKillSwitches();
    expect(active).toHaveLength(1);
    expect(active[0]?.name).toBe("mono_ai_memory_ingest");
    expect(active[0]?.reason).toBe("test: rag-eval kill");
    expect(active[0]?.context).toEqual({ recall: 0.3, mode: "live" });
    expect(active[0]?.activatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("isolates switches by name", () => {
    activateKillSwitch("mono_ai_memory_ingest", { reason: "a" });
    expect(isKillSwitchActive("mono_ai_memory_ingest")).toBe(true);
    expect(isKillSwitchActive("rag_retrieval")).toBe(false);
    expect(isKillSwitchActive("rag_eval_weekly")).toBe(false);
  });

  it("reactivates overwrites reason + context", () => {
    activateKillSwitch("mono_ai_memory_ingest", {
      reason: "first reason",
      context: { round: 1 },
    });
    activateKillSwitch("mono_ai_memory_ingest", {
      reason: "second reason",
      context: { round: 2 },
    });
    const active = listActiveKillSwitches();
    expect(active).toHaveLength(1);
    expect(active[0]?.reason).toBe("second reason");
    expect(active[0]?.context).toEqual({ round: 2 });
  });

  it("deactivates an active switch", () => {
    activateKillSwitch("mono_ai_memory_ingest", { reason: "x" });
    expect(isKillSwitchActive("mono_ai_memory_ingest")).toBe(true);

    deactivateKillSwitch("mono_ai_memory_ingest");
    expect(isKillSwitchActive("mono_ai_memory_ingest")).toBe(false);
    expect(listActiveKillSwitches()).toEqual([]);
  });

  it("deactivate is noop when switch is already inactive", () => {
    expect(() => deactivateKillSwitch("mono_ai_memory_ingest")).not.toThrow();
    expect(isKillSwitchActive("mono_ai_memory_ingest")).toBe(false);
  });

  it("listActiveKillSwitches returns immutable snapshot — mutations don't leak", () => {
    activateKillSwitch("mono_ai_memory_ingest", { reason: "x" });
    const snap1 = listActiveKillSwitches();
    expect(snap1).toHaveLength(1);
    // Mutate the returned array — should not affect internal state.
    snap1.pop();
    expect(listActiveKillSwitches()).toHaveLength(1);
  });

  it("supports multiple switches simultaneously", () => {
    activateKillSwitch("mono_ai_memory_ingest", { reason: "a" });
    activateKillSwitch("rag_retrieval", { reason: "b" });
    expect(isKillSwitchActive("mono_ai_memory_ingest")).toBe(true);
    expect(isKillSwitchActive("rag_retrieval")).toBe(true);
    expect(listActiveKillSwitches()).toHaveLength(2);

    deactivateKillSwitch("mono_ai_memory_ingest");
    expect(listActiveKillSwitches()).toHaveLength(1);
    expect(listActiveKillSwitches()[0]?.name).toBe("rag_retrieval");
  });

  it("__resetKillSwitchesForTest clears all state", () => {
    activateKillSwitch("mono_ai_memory_ingest", { reason: "a" });
    activateKillSwitch("rag_retrieval", { reason: "b" });
    __resetKillSwitchesForTest();
    expect(listActiveKillSwitches()).toEqual([]);
    expect(isKillSwitchActive("mono_ai_memory_ingest")).toBe(false);
    expect(isKillSwitchActive("rag_retrieval")).toBe(false);
  });
});
