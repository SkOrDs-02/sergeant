import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyMock } = vi.hoisted(() => ({ verifyMock: vi.fn() }));

vi.mock("../../auth.js", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("./verifyAccountPassword.js", () => ({
  verifyAccountPassword: verifyMock,
}));

import {
  REAUTH_FRESH_MAX_AGE_MS,
  isSessionFresh,
  reauthenticate,
} from "./reauth.js";

// Рішення власника 2026-10-23 (sec-06, sec-10): пароль, а для OAuth-only —
// сесія ≤ 10 хв. Головне, що тут стережеться: OAuth-only зі СТАРОЮ сесією не
// проходить (раніше `verifyAccountPassword` віддавав `ok` і роут пропускав).

const NOW = Date.parse("2026-10-23T12:00:00Z");
const now = () => NOW;

beforeEach(() => {
  verifyMock.mockReset();
});

describe("isSessionFresh", () => {
  it("межа 10 хв: трохи молодша проходить, рівно межа і старша — ні", () => {
    expect(REAUTH_FRESH_MAX_AGE_MS).toBe(10 * 60 * 1000);
    expect(
      isSessionFresh(new Date(NOW - REAUTH_FRESH_MAX_AGE_MS + 1), NOW),
    ).toBe(true);
    expect(isSessionFresh(new Date(NOW - REAUTH_FRESH_MAX_AGE_MS), NOW)).toBe(
      false,
    );
    expect(
      isSessionFresh(new Date(NOW - 60 * 60 * 1000).toISOString(), NOW),
    ).toBe(false);
  });

  it("відсутня або зламана дата — не свіжа (fail-closed)", () => {
    expect(isSessionFresh(undefined, NOW)).toBe(false);
    expect(isSessionFresh(null, NOW)).toBe(false);
    expect(isSessionFresh("not a date", NOW)).toBe(false);
    expect(isSessionFresh({}, NOW)).toBe(false);
  });
});

describe("reauthenticate", () => {
  it("невірний пароль → INVALID_PASSWORD, сесію не дивимось", async () => {
    verifyMock.mockResolvedValue({ ok: false, reason: "invalid_password" });
    const load = vi.fn();
    expect(await reauthenticate("u1", "bad", load, now)).toEqual({
      ok: false,
      code: "INVALID_PASSWORD",
    });
    expect(load).not.toHaveBeenCalled();
  });

  it("вірний пароль → ok без lookup-а сесії", async () => {
    verifyMock.mockResolvedValue({ ok: true, method: "password" });
    const load = vi.fn();
    expect(await reauthenticate("u1", "good", load, now)).toEqual({
      ok: true,
      method: "password",
    });
    expect(load).not.toHaveBeenCalled();
  });

  it("OAuth-only зі старою сесією → SESSION_NOT_FRESH", async () => {
    verifyMock.mockResolvedValue({ ok: true, method: "no_password" });
    const outcome = await reauthenticate(
      "u1",
      undefined,
      async () => new Date(NOW - 60 * 60 * 1000),
      now,
    );
    expect(outcome).toEqual({ ok: false, code: "SESSION_NOT_FRESH" });
  });

  it("OAuth-only зі свіжою сесією → ok (fresh_session)", async () => {
    verifyMock.mockResolvedValue({ ok: true, method: "no_password" });
    const outcome = await reauthenticate(
      "u1",
      undefined,
      async () => new Date(NOW - 60 * 1000),
      now,
    );
    expect(outcome).toEqual({ ok: true, method: "fresh_session" });
  });
});
