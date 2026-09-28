import express from "express";
import type { Pool } from "pg";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Wiring тижневих відер Free (спека `docs/work/specs/access-tiers.md`): який
 * роут списує яке відро. Сама арифметика відер (21-ша дія, 4-те фото, 6-й
 * скан) живе в `modules/chat/aiQuota.test.ts`; тут лише те, що правильний
 * `requireAiQuota(meter)` стоїть у правильному ланцюжку, а там, де списання
 * бути не повинно (refine-photo, QR-lookup), його немає.
 */

const { handler } = vi.hoisted(() => ({
  handler: (_req: unknown, res: express.Response) => res.json({ ok: true }),
}));

vi.mock("../db.js", () => ({ default: { query: vi.fn() } }));
vi.mock("../auth.js", () => ({ getSessionUser: vi.fn() }));

vi.mock("../modules/nutrition/analyze-photo.js", () => ({ default: handler }));
vi.mock("../modules/nutrition/refine-photo.js", () => ({ default: handler }));
vi.mock("../modules/nutrition/day-plan.js", () => ({ default: handler }));
vi.mock("../modules/nutrition/week-plan.js", () => ({ default: handler }));
vi.mock("../modules/finyk/receipts/lookup.js", () => ({ default: handler }));
vi.mock("../modules/finyk/receipts/analyze.js", () => ({ default: handler }));
vi.mock("../modules/finyk/import/screenshotAnalyze.js", () => ({
  default: handler,
}));

vi.mock("../http/index.js", async () => {
  const actual =
    await vi.importActual<typeof import("../http/index.js")>(
      "../http/index.js",
    );
  const pass = () => (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    ...actual,
    rateLimitExpress: pass,
    requireSession: pass,
    requireLlmUpstream: pass,
    // Відро, яке списав би справжній `assertAiQuota`, їде в заголовок.
    requireAiQuota:
      (meter = "ai") =>
      (_req: unknown, res: express.Response, next: () => void) => {
        res.append("x-quota-meter", meter);
        next();
      },
  };
});

import { createFinykRouter } from "./finyk.js";
import { createNutritionRouter } from "./nutrition.js";

function app(): express.Express {
  const a = express();
  a.use(express.json());
  a.use(createNutritionRouter({ pool: {} as Pool }));
  a.use(createFinykRouter());
  return a;
}

async function meterOf(path: string): Promise<string | undefined> {
  const res = await request(app()).post(path).send({});
  expect(res.status).toBe(200);
  return res.headers["x-quota-meter"];
}

describe("access-tiers: яке тижневе відро списує роут", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("analyze-photo списує відро фото, а не спільні дії", async () => {
    expect(await meterOf("/api/nutrition/analyze-photo")).toBe("photo");
  });

  it("refine-photo того самого знімка нічого не списує", async () => {
    expect(await meterOf("/api/nutrition/refine-photo")).toBeUndefined();
  });

  it("day-plan списує 1 дію зі спільних", async () => {
    expect(await meterOf("/api/nutrition/day-plan")).toBe("ai");
  });

  it("vision Фініка (чек без QR і скрін банку) списує відро finyk-vision", async () => {
    expect(await meterOf("/api/finyk/receipts/analyze")).toBe("finyk-vision");
    expect(await meterOf("/api/finyk/import/screenshot/analyze")).toBe(
      "finyk-vision",
    );
  });

  it("QR-lookup ДПС лишається без квоти", async () => {
    expect(await meterOf("/api/finyk/receipts/lookup")).toBeUndefined();
  });
});
