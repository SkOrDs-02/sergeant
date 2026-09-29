import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

const { getWeeklyUsageMock } = vi.hoisted(() => ({
  getWeeklyUsageMock: vi.fn(),
}));
vi.mock("../chat/aiQuota.js", () => ({ getWeeklyUsage: getWeeklyUsageMock }));

import { buildAccessSnapshot } from "./accessSnapshot.js";

const NOW = new Date("2026-06-10T12:00:00Z");

function poolWith(rows: unknown[]): Pool {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as Pool;
}

afterEach(() => {
  vi.unstubAllEnvs();
  getWeeklyUsageMock.mockReset();
});

describe("buildAccessSnapshot", () => {
  it("Free: тижневі лічильники з лімітами реєстру і скиданням у понеділок", async () => {
    getWeeklyUsageMock.mockResolvedValue({
      ai: 4,
      photo: 1,
      "finyk-vision": 0,
    });
    const access = await buildAccessSnapshot(poolWith([]), "u1", NOW);
    expect(access.state).toBe("free");
    expect(access.features["export.pdf"]).toBe(false);
    expect(access.features["ai.photo"]).toBe(true);
    expect(access.features["bank.monoSync"]).toBe(true);
    expect(access.meters.aiActions).toEqual({
      used: 4,
      limit: 20,
      resetsAt: "2026-06-14T21:00:00.000Z",
    });
    expect(access.meters.aiPhoto.limit).toBe(3);
    expect(access.meters.finykVision.limit).toBe(5);
  });

  it("trial: Premium-фічі відкриті, ліміти зняті, дата кінця trial", async () => {
    getWeeklyUsageMock.mockResolvedValue({
      ai: 0,
      photo: 0,
      "finyk-vision": 0,
    });
    const end = new Date("2026-06-12T10:00:00Z");
    const access = await buildAccessSnapshot(
      poolWith([
        {
          plan: "pro",
          status: "trialing",
          current_period_end: end,
          cancel_at_period_end: false,
          provider: "manual",
        },
      ]),
      "u1",
      NOW,
    );
    expect(access.state).toBe("trial");
    expect(access.trialEndsAt).toBe(end.toISOString());
    expect(access.graceEndsAt).toBeNull();
    expect(access.features["export.pdf"]).toBe(true);
    expect(access.meters.aiActions.limit).toBeNull();
  });

  it("founder має state pro", async () => {
    vi.stubEnv("AI_QUOTA_FOUNDER_IDS", "founder_1");
    getWeeklyUsageMock.mockResolvedValue({
      ai: 0,
      photo: 0,
      "finyk-vision": 0,
    });
    const access = await buildAccessSnapshot(poolWith([]), "founder_1", NOW);
    expect(access.state).toBe("pro");
    expect(access.meters.aiPhoto.limit).toBeNull();
  });
});
