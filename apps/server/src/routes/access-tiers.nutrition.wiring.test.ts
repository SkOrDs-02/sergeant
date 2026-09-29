import express from "express";
import type { Pool } from "pg";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Wiring тижневих відер Free (спека `docs/work/specs/access-tiers.md`) —
 * nutrition-половина. Фінік-половина: `access-tiers.finyk.wiring.test.ts`
 * (там і причина поділу — кожна половина лишається під `vi.mock` cap,
 * `scripts/ci/check-vi-mock-cap.mjs`). Сама арифметика відер (21-ша дія,
 * 4-те фото, 6-й скан) живе в `modules/chat/aiQuota.test.ts`; тут лише те,
 * що правильний `requireAiQuota(meter)` стоїть у правильному ланцюжку, а
 * там, де списання бути не повинно (refine-photo), його немає.
 */

const { handler } = vi.hoisted(() => ({
  handler: (_req: unknown, res: express.Response) => res.json({ ok: true }),
}));

vi.mock("../db.js", () => ({ default: { query: vi.fn() } }));

vi.mock("../modules/nutrition/analyze-photo.js", () => ({ default: handler }));
vi.mock("../modules/nutrition/refine-photo.js", () => ({ default: handler }));
vi.mock("../modules/nutrition/day-plan.js", () => ({ default: handler }));

// Хендкрафт замість `vi.importActual`: реальний барель `http/index.js`
// тягне за собою `requireSession.js` → `../auth.js` (важкий `betterAuth()`
// на імпорті), а продукту тут потрібен лише пасивний `setModule` (тегує
// ALS, тест його не перевіряє) поруч із підміненими guard-ами. Без
// `importActual` реальний барель узагалі не завантажується, тож `auth.js`
// мокати не треба.
vi.mock("../http/index.js", () => {
  const pass = () => (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    setModule: () => (_req: unknown, _res: unknown, next: () => void) => next(),
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

import { createNutritionRouter } from "./nutrition.js";

function app(): express.Express {
  const a = express();
  a.use(express.json());
  a.use(createNutritionRouter({ pool: {} as Pool }));
  return a;
}

async function meterOf(path: string): Promise<string | undefined> {
  const res = await request(app()).post(path).send({});
  expect(res.status).toBe(200);
  return res.headers["x-quota-meter"];
}

describe("access-tiers: яке тижневе відро списує nutrition-роут", () => {
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
});
