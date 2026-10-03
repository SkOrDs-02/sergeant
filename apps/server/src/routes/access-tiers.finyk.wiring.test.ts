import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Wiring тижневих відер Free (спека `docs/work/specs/access-tiers.md`) —
 * finyk-половина. Nutrition-половина: `access-tiers.nutrition.wiring.test.ts`
 * (там і причина поділу — кожна половина лишається під `vi.mock` cap,
 * `scripts/ci/check-vi-mock-cap.mjs`).
 */

const { handler } = vi.hoisted(() => ({
  handler: (_req: unknown, res: express.Response) => res.json({ ok: true }),
}));

vi.mock("../db.js", () => ({ default: { query: vi.fn() } }));

vi.mock("../modules/finyk/receipts/lookup.js", () => ({ default: handler }));
vi.mock("../modules/finyk/receipts/analyze.js", () => ({ default: handler }));
vi.mock("../modules/finyk/import/screenshotAnalyze.js", () => ({
  default: handler,
}));

// Хендкрафт замість `vi.importActual` — та сама причина, що в
// nutrition-половині: реальний барель `http/index.js` тягне `auth.js`.
vi.mock("../http/index.js", () => {
  const pass = () => (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    setModule: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    rateLimitExpress: pass,
    requireSession: pass,
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

function app(): express.Express {
  const a = express();
  a.use(express.json());
  a.use(createFinykRouter());
  return a;
}

async function meterOf(path: string): Promise<string | undefined> {
  const res = await request(app()).post(path).send({});
  expect(res.status).toBe(200);
  return res.headers["x-quota-meter"];
}

describe("access-tiers: яке тижневе відро списує finyk-роут", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
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
