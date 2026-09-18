import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";

import { requireVerifiedEmail } from "./requireVerifiedEmail.js";

/**
 * Покриваємо контракт `requireVerifiedEmail()` (H6):
 *
 * 1. `req.user.emailVerified === true` → next() → handler 200.
 * 2. `req.user.emailVerified === false` → 403 з code
 *    `EMAIL_VERIFICATION_REQUIRED`.
 * 3. `req.user.emailVerified === undefined` → теж 403 (treat-as-unverified
 *    — strict-mode за замовчуванням, краще false-positive 403, ніж
 *    false-negative bypass).
 * 4. `req.user` відсутній (хтось забув попередній `requireSession()`) →
 *    401 з code `UNAUTHORIZED`. Захищає від misconfiguration в роутерах.
 */

type FakeUser = { id: string; emailVerified?: boolean };

function makeApp(user: FakeUser | undefined) {
  const app = express();
  app.get(
    "/sensitive",
    (req, _res, next) => {
      // Імітуємо `requireSession()` — кладемо `req.user` як він би клав.
      if (user) {
        (req as express.Request & { user?: FakeUser }).user = user;
      }
      next();
    },
    requireVerifiedEmail(),
    (_req, res) => {
      res.status(200).json({ ok: true });
    },
  );
  return app;
}

describe("H6: requireVerifiedEmail()", () => {
  it("propagates next() when emailVerified is true", async () => {
    const res = await request(makeApp({ id: "u-1", emailVerified: true })).get(
      "/sensitive",
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("returns 403 with EMAIL_VERIFICATION_REQUIRED when emailVerified is false", async () => {
    const res = await request(makeApp({ id: "u-1", emailVerified: false })).get(
      "/sensitive",
    );
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "EMAIL_VERIFICATION_REQUIRED" });
  });

  it("returns 403 when emailVerified is undefined (strict default)", async () => {
    const res = await request(makeApp({ id: "u-1" })).get("/sensitive");
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "EMAIL_VERIFICATION_REQUIRED" });
  });

  it("returns 401 when req.user is missing entirely (no requireSession upstream)", async () => {
    const res = await request(makeApp(undefined)).get("/sensitive");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "UNAUTHORIZED" });
  });
});
