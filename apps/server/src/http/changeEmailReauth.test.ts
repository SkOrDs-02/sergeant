import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, verifyMock, limiterCalls } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  verifyMock: vi.fn(),
  limiterCalls: [] as Array<{ key: string; limit: number; subject: string }>,
}));

vi.mock("../auth.js", () => ({
  auth: { api: { getSession: getSessionMock } },
}));
vi.mock("../modules/me/verifyAccountPassword.js", () => ({
  verifyAccountPassword: verifyMock,
}));
// Лімітер підміняємо записувачем: тут перевіряється, ЩО і ДЛЯ КОГО він
// рахує, а сам механізм бакетів покритий `rateLimit.test.ts`.
vi.mock("./rateLimit.js", () => ({
  rateLimitExpress:
    (opts: { key: string; limit: number; subject: () => string }) =>
    (_req: Request, _res: Response, next: NextFunction) => {
      limiterCalls.push({
        key: opts.key,
        limit: opts.limit,
        subject: opts.subject(),
      });
      next();
    },
}));

import { authPasswordCheckFailuresTotal } from "../obs/metrics.js";
import { changeEmailReauth, isChangeEmailPath } from "./changeEmailReauth.js";

// sec-06 (рішення власника 2026-10-23): change-email лише з поточним паролем,
// OAuth-only — зі сесією ≤ 10 хв, не частіше 3 разів на добу.

const FRESH = () => new Date(Date.now() - 60 * 1000);
const OLD = () => new Date(Date.now() - 60 * 60 * 1000);

function run(body: unknown, url = "/api/auth/change-email") {
  const req = {
    method: "POST",
    originalUrl: url,
    headers: {},
    body,
  } as unknown as Request;
  const next = vi.fn();
  return changeEmailReauth(req, {} as Response, next).then(() => next);
}

function errorOf(next: ReturnType<typeof vi.fn>) {
  const err = next.mock.calls[0]?.[0] as
    { status?: number; code?: string } | undefined;
  return err ? { status: err.status, code: err.code } : undefined;
}

beforeEach(() => {
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({
    user: { id: "u1" },
    session: { createdAt: OLD() },
  });
  verifyMock.mockReset();
  limiterCalls.length = 0;
  authPasswordCheckFailuresTotal.reset();
});

describe("changeEmailReauth", () => {
  it("акаунт з паролем без пароля в тілі → 400 INVALID_PASSWORD, ліміт не чіпаємо", async () => {
    verifyMock.mockResolvedValue({ ok: false, reason: "invalid_password" });
    const next = await run({ newEmail: "new@example.com" });
    expect(errorOf(next)).toEqual({ status: 400, code: "INVALID_PASSWORD" });
    expect(verifyMock).toHaveBeenCalledWith("u1", undefined);
    expect(limiterCalls).toEqual([]);
    const { values } = await authPasswordCheckFailuresTotal.get();
    expect(
      values.find((v) => v.labels["route"] === "change_email")?.value,
    ).toBe(1);
  });

  it("вірний пароль → далі через добовий ліміт 3 на користувача", async () => {
    verifyMock.mockResolvedValue({ ok: true, method: "password" });
    const next = await run({ newEmail: "new@example.com", password: "pw" });
    expect(next).toHaveBeenCalledWith();
    expect(limiterCalls).toEqual([
      { key: "api:change-email:user", limit: 3, subject: "u:u1" },
    ]);
  });

  it("OAuth-only зі старою сесією → 403 SESSION_NOT_FRESH", async () => {
    verifyMock.mockResolvedValue({ ok: true, method: "no_password" });
    const next = await run({ newEmail: "new@example.com" });
    expect(errorOf(next)).toEqual({ status: 403, code: "SESSION_NOT_FRESH" });
    expect(limiterCalls).toEqual([]);
  });

  it("OAuth-only зі свіжою сесією → проходить", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "u1" },
      session: { createdAt: FRESH() },
    });
    verifyMock.mockResolvedValue({ ok: true, method: "no_password" });
    const next = await run({ newEmail: "new@example.com" });
    expect(next).toHaveBeenCalledWith();
    expect(limiterCalls).toHaveLength(1);
  });

  it("sec-16: newEmail довший за 254 → 400 INVALID_EMAIL ще до сесії й листа", async () => {
    const next = await run({
      newEmail: `${"a".repeat(249)}@b.com`,
      password: "pw",
    });
    expect(errorOf(next)).toEqual({ status: 400, code: "INVALID_EMAIL" });
    expect(getSessionMock).not.toHaveBeenCalled();
    expect(limiterCalls).toHaveLength(0);
  });

  it("sec-16: newEmail рівно 254 символи проходить далі", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "u1" },
      session: { createdAt: FRESH() },
    });
    verifyMock.mockResolvedValue("no_password");
    const next = await run({ newEmail: `${"a".repeat(248)}@b.com` });
    expect(errorOf(next)?.code).not.toBe("INVALID_EMAIL");
    expect(getSessionMock).toHaveBeenCalled();
  });

  it("password не рядок → 400 без звірки", async () => {
    const next = await run({ newEmail: "new@example.com", password: ["a"] });
    expect(errorOf(next)?.status).toBe(400);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("без сесії — пропускаємо, 401 віддасть сам Better Auth", async () => {
    getSessionMock.mockResolvedValue(null);
    const next = await run({ newEmail: "new@example.com" });
    expect(next).toHaveBeenCalledWith();
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("інші шляхи не чіпає", async () => {
    const next = await run({}, "/api/auth/change-password");
    expect(next).toHaveBeenCalledWith();
    expect(getSessionMock).not.toHaveBeenCalled();
  });
});

describe("isChangeEmailPath", () => {
  it("ловить ті форми шляху, які роутер Better Auth зведе до /change-email", () => {
    expect(isChangeEmailPath("/api/auth/change-email")).toBe(true);
    expect(isChangeEmailPath("/api/auth/change-email?x=1")).toBe(true);
    expect(isChangeEmailPath("/api/auth/./change-email")).toBe(true);
    expect(isChangeEmailPath("/api/auth/x/../change-email")).toBe(true);
    expect(isChangeEmailPath("/api/auth/change-email/")).toBe(true);
    expect(isChangeEmailPath("/api/auth/change-password")).toBe(false);
    expect(isChangeEmailPath("/api/auth/change-email-x")).toBe(false);
  });
});
