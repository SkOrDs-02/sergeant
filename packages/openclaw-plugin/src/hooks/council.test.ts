/**
 * Stage 5c — unit tests for `createCouncilGateHook()` + `createCouncilModeHook()`.
 *
 * `createCouncilGateHook` (before_dispatch):
 *   - `/council <topic>` + gate allowed → `{ handled: false }`.
 *   - `/council <topic>` + gate denied → `{ handled: true, text }`.
 *   - Bare `/council` → `{ handled: false }` (no budget call).
 *   - Pattern miss → `{ handled: false }` (no budget call).
 *   - Empty / non-string content → `{ handled: false }` (no budget call).
 *   - Gate throws → `{ handled: true, text: <fail-closed-reason> }`.
 *
 * `createCouncilModeHook` (before_agent_start):
 *   - `/council <topic>` matches → `{ prompt: topic, prependContext: COUNCIL_PRIMER }`.
 *   - Bare `/council` → `undefined` (agent asks user for one-liner).
 *   - Pattern miss → `undefined`.
 *   - Empty / non-string prompt → `undefined`.
 *   - Matcher throws → `undefined` + error log.
 */

import { describe, expect, it, vi } from "vitest";

import { createCouncilGateHook, createCouncilModeHook } from "./council.js";
import { COUNCIL_PRIMER, type CouncilGateOutcome } from "../council/index.js";

const ALLOWED_OUTCOME: CouncilGateOutcome = {
  allowed: true,
  remainingUsd: 9.5,
  spentUsd: 0.5,
  budgetUsd: 10.0,
};

const DENIED_HEADROOM_OUTCOME: CouncilGateOutcome = {
  allowed: false,
  kind: "headroom_below_council_cap",
  reason:
    "Council вимагає ≥ $2.00 budget headroom; зараз залишок $1.5000. Спробуй окрему /persona або завтра.",
  remainingUsd: 1.5,
};

const DENIED_DAILY_CAP_OUTCOME: CouncilGateOutcome = {
  allowed: false,
  kind: "daily_cap_exceeded",
  reason:
    "Не вистачає бюджету: $10.00 / $10.00. /council потребує мінімум $2.00 залишку.",
  remainingUsd: 0,
};

describe("createCouncilGateHook", () => {
  it("falls through when /council <topic> AND gate allowed", async () => {
    const gate = vi.fn().mockResolvedValue(ALLOWED_OUTCOME);
    const log = vi.fn();
    const hook = createCouncilGateHook({ gate, log });

    const result = await hook({
      content: "/council чи вводимо B2B в Q3?",
      sessionKey: "session_X",
      channel: "telegram",
    } as Parameters<typeof hook>[0]);

    expect(result).toEqual({ handled: false });
    expect(gate).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      "info",
      "openclaw.council.gate_allowed",
      expect.objectContaining({ remainingUsd: 9.5 }),
    );
  });

  it("short-circuits with gate.reason when /council <topic> AND headroom denied", async () => {
    const gate = vi.fn().mockResolvedValue(DENIED_HEADROOM_OUTCOME);
    const log = vi.fn();
    const hook = createCouncilGateHook({ gate, log });

    const result = await hook({
      content: "/council Q3 hiring plan",
      sessionKey: "session_X",
      channel: "telegram",
    } as Parameters<typeof hook>[0]);

    expect(result).toEqual({
      handled: true,
      text: DENIED_HEADROOM_OUTCOME.reason,
    });
    expect(log).toHaveBeenCalledWith(
      "info",
      "openclaw.council.gate_denied",
      expect.objectContaining({
        kind: "headroom_below_council_cap",
        remainingUsd: 1.5,
      }),
    );
  });

  it("short-circuits with gate.reason when /council <topic> AND daily cap exceeded", async () => {
    const gate = vi.fn().mockResolvedValue(DENIED_DAILY_CAP_OUTCOME);
    const hook = createCouncilGateHook({ gate });

    const result = await hook({
      content: "/council Q3 hiring plan",
    } as Parameters<typeof hook>[0]);

    expect(result).toEqual({
      handled: true,
      text: DENIED_DAILY_CAP_OUTCOME.reason,
    });
  });

  it("does NOT call the gate for bare `/council` (topic empty)", async () => {
    const gate = vi.fn().mockResolvedValue(ALLOWED_OUTCOME);
    const hook = createCouncilGateHook({ gate });

    expect(
      await hook({ content: "/council" } as Parameters<typeof hook>[0]),
    ).toEqual({ handled: false });
    expect(
      await hook({ content: "/council   " } as Parameters<typeof hook>[0]),
    ).toEqual({ handled: false });
    expect(gate).not.toHaveBeenCalled();
  });

  it("does NOT call the gate when the content doesn't start with /council", async () => {
    const gate = vi.fn().mockResolvedValue(ALLOWED_OUTCOME);
    const hook = createCouncilGateHook({ gate });

    expect(
      await hook({ content: "What's runway?" } as Parameters<typeof hook>[0]),
    ).toEqual({ handled: false });
    expect(
      await hook({ content: "/plan churn" } as Parameters<typeof hook>[0]),
    ).toEqual({ handled: false });
    expect(
      await hook({
        content: "/councils Q3",
      } as Parameters<typeof hook>[0]),
    ).toEqual({ handled: false });
    expect(
      await hook({
        content: "hey /council X",
      } as Parameters<typeof hook>[0]),
    ).toEqual({ handled: false });
    expect(gate).not.toHaveBeenCalled();
  });

  it("does NOT call the gate when content is empty / whitespace / non-string", async () => {
    const gate = vi.fn().mockResolvedValue(ALLOWED_OUTCOME);
    const hook = createCouncilGateHook({ gate });

    expect(await hook({ content: "" } as Parameters<typeof hook>[0])).toEqual({
      handled: false,
    });
    expect(
      await hook({ content: "    " } as Parameters<typeof hook>[0]),
    ).toEqual({ handled: false });
    expect(
      await hook({
        content: 42 as unknown as string,
      } as Parameters<typeof hook>[0]),
    ).toEqual({ handled: false });
    expect(await hook({} as Parameters<typeof hook>[0])).toEqual({
      handled: false,
    });
    expect(gate).not.toHaveBeenCalled();
  });

  it("fails closed when the gate function itself throws", async () => {
    const gate = vi.fn().mockRejectedValue(new Error("network ded"));
    const log = vi.fn();
    const hook = createCouncilGateHook({ gate, log });

    const result = await hook({
      content: "/council something",
    } as Parameters<typeof hook>[0]);

    expect(result).toEqual({
      handled: true,
      text: expect.stringContaining("fail-closed"),
    });
    expect(log).toHaveBeenCalledWith(
      "error",
      "openclaw.council.gate_hook_error",
      expect.objectContaining({ error: "network ded" }),
    );
  });
});

describe("createCouncilModeHook", () => {
  it("rewrites prompt + prepends primer when `/council <topic>` matches", async () => {
    const log = vi.fn();
    const hook = createCouncilModeHook({ log });

    const result = await hook({
      prompt: "/council Q3 OKR draft",
      runId: "run_council_1",
    } as Parameters<typeof hook>[0]);

    expect(result).toEqual({
      prompt: "Q3 OKR draft",
      prependContext: COUNCIL_PRIMER,
    });
    expect(log).toHaveBeenCalledWith(
      "info",
      "openclaw.council.mode_activated",
      expect.objectContaining({
        trigger: "council",
        topicChars: "Q3 OKR draft".length,
        runId: "run_council_1",
      }),
    );
  });

  it("returns undefined (pass-through) when the prompt is not a council command", async () => {
    const hook = createCouncilModeHook();
    expect(
      await hook({ prompt: "/plan Q3" } as Parameters<typeof hook>[0]),
    ).toBeUndefined();
    expect(
      await hook({ prompt: "what's MRR?" } as Parameters<typeof hook>[0]),
    ).toBeUndefined();
    expect(
      await hook({
        prompt: "/councils Q3",
      } as Parameters<typeof hook>[0]),
    ).toBeUndefined();
  });

  it("returns undefined for bare /council so the agent can ask for a topic", async () => {
    const hook = createCouncilModeHook();
    expect(
      await hook({ prompt: "/council" } as Parameters<typeof hook>[0]),
    ).toBeUndefined();
    expect(
      await hook({ prompt: "/council  " } as Parameters<typeof hook>[0]),
    ).toBeUndefined();
  });

  it("is a no-op when event.prompt is empty / missing / non-string", async () => {
    const hook = createCouncilModeHook();
    expect(await hook({} as Parameters<typeof hook>[0])).toBeUndefined();
    expect(
      await hook({ prompt: "" } as Parameters<typeof hook>[0]),
    ).toBeUndefined();
    expect(
      await hook({ prompt: "   " } as Parameters<typeof hook>[0]),
    ).toBeUndefined();
    expect(
      await hook({
        prompt: 42 as unknown as string,
      } as Parameters<typeof hook>[0]),
    ).toBeUndefined();
  });

  it("is case-insensitive — `/COUNCIL` activates the same as lower case", async () => {
    const hook = createCouncilModeHook();
    const result = await hook({
      prompt: "/COUNCIL Q3 hiring plan",
    } as Parameters<typeof hook>[0]);
    expect(result?.prompt).toBe("Q3 hiring plan");
    expect(result?.prependContext).toBe(COUNCIL_PRIMER);
  });
});
