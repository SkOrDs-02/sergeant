import { describe, expect, it } from "vitest";

import { reminderSweepRunsTotal } from "./jobs.js";

describe("reminder_sweep_runs_total", () => {
  it("експортує серії ok і failed ще до першого проходу", async () => {
    const { values } = await reminderSweepRunsTotal.get();
    const byOutcome = new Map(values.map((v) => [v.labels.outcome, v.value]));

    expect(byOutcome.has("failed")).toBe(true);
    expect(byOutcome.has("ok")).toBe(true);
    // Свіжий модуль, жодного проходу: обидві серії стоять на нулі.
    expect(byOutcome.get("failed")).toBe(0);
    expect(byOutcome.get("ok")).toBe(0);
  });
});
