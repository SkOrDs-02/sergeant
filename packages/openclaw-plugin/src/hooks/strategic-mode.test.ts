/**
 * Stage 5b PR-1 — unit tests for `createStrategicModeHook()`. Covers:
 *
 *   - Happy path: `/plan churn-q3` returns `{ prompt: "churn-q3",
 *     prependContext: PLAN_PRIMER }` and emits one `info` log entry.
 *   - Non-matching prompts pass through (`undefined` result, no logs).
 *   - Empty / missing prompt is a no-op.
 *   - Non-string `event.prompt` is a no-op (defensive coverage matches
 *     the rest of the plugin's soft-fail posture).
 *   - Match-throw is caught and logged at `error` level without
 *     propagating to the caller (a strategic-mode miss must NEVER
 *     block the agent turn).
 *   - Custom `modes` array is honoured (used in PR-2/3 to incrementally
 *     wire `/analyze` and `/okr`).
 */

import { describe, expect, it, vi } from "vitest";

import { createStrategicModeHook } from "./strategic-mode.js";
import { PLAN_PRIMER, planMode } from "../strategic-modes/plan.js";
import type { StrategicModeDefinition } from "../strategic-modes/types.js";

describe("createStrategicModeHook", () => {
  it("rewrites prompt + prepends primer when `/plan <topic>` matches", async () => {
    const log = vi.fn();
    const hook = createStrategicModeHook({ log });

    const result = await hook({
      prompt: "/plan churn-reduction-q3",
      runId: "run_plan_1",
    });

    expect(result).toEqual({
      prompt: "churn-reduction-q3",
      prependContext: PLAN_PRIMER,
    });
    expect(log).toHaveBeenCalledWith(
      "info",
      "sergeant.strategic_mode.activated",
      expect.objectContaining({
        slug: "plan",
        trigger: "strategic_plan",
        topicChars: "churn-reduction-q3".length,
        runId: "run_plan_1",
      }),
    );
  });

  it("returns undefined (pass-through) for non-matching prompts", async () => {
    const log = vi.fn();
    const hook = createStrategicModeHook({ log });

    expect(await hook({ prompt: "what's runway?" })).toBeUndefined();
    expect(await hook({ prompt: "/metrics" })).toBeUndefined();
    expect(await hook({ prompt: "/plant a tree" })).toBeUndefined();
    expect(log).not.toHaveBeenCalled();
  });

  it("is a no-op when event.prompt is empty / missing / non-string", async () => {
    const hook = createStrategicModeHook();
    expect(await hook({})).toBeUndefined();
    expect(await hook({ prompt: "" })).toBeUndefined();
    expect(await hook({ prompt: "   " })).toBeUndefined();
    expect(await hook({ prompt: 42 as unknown as string })).toBeUndefined();
  });

  it("is a no-op when `/plan` is given without a topic", async () => {
    const hook = createStrategicModeHook();
    expect(await hook({ prompt: "/plan" })).toBeUndefined();
    expect(await hook({ prompt: "/plan   " })).toBeUndefined();
  });

  it("logs and returns undefined when the matcher throws", async () => {
    const log = vi.fn();
    // Inject a definition whose `pattern.exec` blows up so we cover the
    // try/catch around matchStrategicMode without monkey-patching the
    // global regex prototype.
    const exploding: StrategicModeDefinition = {
      ...planMode,
      pattern: {
        exec: () => {
          throw new Error("regex boom");
        },
      } as unknown as RegExp,
    };
    const hook = createStrategicModeHook({ modes: [exploding], log });

    const result = await hook({ prompt: "/plan whatever" });
    expect(result).toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      "error",
      "sergeant.strategic_mode.match_error",
      expect.objectContaining({ error: "regex boom" }),
    );
  });

  it("honours a custom `modes` list (single-mode subset)", async () => {
    const hook = createStrategicModeHook({ modes: [planMode] });
    const result = await hook({ prompt: "/plan something" });
    expect(result?.prependContext).toBe(PLAN_PRIMER);
  });

  it("returns undefined when the `modes` list is empty", async () => {
    const hook = createStrategicModeHook({ modes: [] });
    expect(await hook({ prompt: "/plan churn-q3" })).toBeUndefined();
  });
});
