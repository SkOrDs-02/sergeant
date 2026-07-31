import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";
import type { Request, Response } from "express";

/**
 * F2 — per-account бакет на credential-флоу
 * (`docs/90-work/planning/specs/beta-security-readiness.md`).
 *
 * Тест перевіряє саме те, що ламається тихо: **на чому ключується бакет**.
 * Якщо `subject` колись зникне, ліміт мовчки відкотиться на per-IP і знову
 * стане обходимим орендою адрес — жоден інший тест цього не помітить, бо
 * ліміт як такий продовжить працювати.
 *
 * `rateLimitExpress` замоканий: нас цікавить контракт виклику, а справжня
 * механіка бакетів (Redis/PG/in-memory) вже покрита `rateLimit.test.ts`.
 */
interface CapturedOptions {
  key: string;
  subject?: () => string;
}
const middlewareSpy = vi.fn((_req: Request, _res: Response, next: () => void) =>
  next(),
);
const rateLimitExpress = vi.fn((_opts: CapturedOptions) => middlewareSpy);

vi.mock("./rateLimit.js", () => ({
  rateLimitExpress: (...args: unknown[]) =>
    (rateLimitExpress as unknown as (...a: unknown[]) => unknown)(...args),
}));

import { authAccountRateLimit } from "./authMiddleware.js";

function run(url: string, body: unknown, method = "POST") {
  const req = { originalUrl: url, method, body } as unknown as Request;
  const res = {} as Response;
  const next = vi.fn();
  authAccountRateLimit(req, res, next);
  return { next, req };
}

/** Те саме перетворення, яке має робити middleware. */
function expectedSubject(email: string) {
  return `a:${createHash("sha256").update(email.toLowerCase()).digest("hex")}`;
}

describe("authAccountRateLimit", () => {
  beforeEach(() => {
    rateLimitExpress.mockClear();
    middlewareSpy.mockClear();
  });

  it("keys the bucket on the targeted email, not the caller IP", () => {
    run("/api/auth/sign-in", { email: "Victim@Example.COM" });

    expect(rateLimitExpress).toHaveBeenCalledTimes(1);
    const opts = rateLimitExpress.mock.calls[0]?.[0];
    expect(opts?.key).toBe("api:auth:account");
    // Нормалізація регістру обовʼязкова: інакше `Victim@` і `victim@`
    // отримали б різні бакети, і атакеру вистачило б міняти регістр.
    expect(opts?.subject?.()).toBe(expectedSubject("victim@example.com"));
  });

  it("uses one bucket for the same account across different IPs", () => {
    run("/api/auth/sign-in", { email: "a@b.com" });
    run("/api/auth/sign-in", { email: "a@b.com" });

    const first = rateLimitExpress.mock.calls[0]?.[0];
    const second = rateLimitExpress.mock.calls[1]?.[0];
    // Subject не залежить від запиту взагалі — саме тому зміна IP не дає
    // атакеру свіжий бакет.
    expect(first?.subject?.()).toBe(second?.subject?.());
  });

  it("covers password-reset flows", () => {
    run("/api/auth/request-password-reset", { email: "a@b.com" });
    run("/api/auth/forget-password", { email: "a@b.com" });
    expect(rateLimitExpress).toHaveBeenCalledTimes(2);
  });

  it("skips sign-up — the email is not yet an account to protect", () => {
    const { next } = run("/api/auth/sign-up", { email: "new@b.com" });
    expect(rateLimitExpress).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("passes through when there is no email to key on", () => {
    // `reset-password` несе токен, не email — ключувати нічим.
    const { next } = run("/api/auth/reset-password", { token: "t", email: "" });
    expect(rateLimitExpress).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("ignores non-credential requests", () => {
    const { next } = run("/api/auth/get-session", {}, "GET");
    expect(rateLimitExpress).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
