import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import {
  HEALTH_CONSENT_REQUIRED_CODE,
  HEALTH_CONSENT_REQUIRED_MESSAGE,
} from "@sergeant/shared";

const { hasHealthDataConsentMock } = vi.hoisted(() => ({
  hasHealthDataConsentMock: vi.fn(),
}));
vi.mock("../db.js", () => ({ pool: { query: vi.fn() } }));
vi.mock("../modules/ai-memory/consent.js", () => ({
  hasHealthDataConsent: hasHealthDataConsentMock,
}));
vi.mock("../obs/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  requireHealthConsent,
  resolveHealthConsent,
  scrubGoalWithoutHealthConsent,
} from "./healthConsent.js";

const req = (user: { id: string } | undefined, body?: unknown): Request =>
  ({ user, body }) as unknown as Request;
const res = {} as Response;

/** Запускає middleware і повертає те, з чим викликано `next`. */
function run(
  mw: (r: Request, s: Response, n: (e?: unknown) => void) => void,
  r: Request,
): Promise<unknown> {
  return new Promise((resolve) => mw(r, res, (e) => resolve(e)));
}

beforeEach(() => {
  hasHealthDataConsentMock.mockReset();
});

describe("resolveHealthConsent", () => {
  it("без користувача — false, БД не чіпаємо", async () => {
    await expect(resolveHealthConsent(undefined)).resolves.toBe(false);
    expect(hasHealthDataConsentMock).not.toHaveBeenCalled();
  });

  it("віддає збережену згоду", async () => {
    hasHealthDataConsentMock.mockResolvedValue(true);
    await expect(resolveHealthConsent("u1")).resolves.toBe(true);
    hasHealthDataConsentMock.mockResolvedValue(false);
    await expect(resolveHealthConsent("u1")).resolves.toBe(false);
  });

  it("збій БД = fail-closed", async () => {
    hasHealthDataConsentMock.mockRejectedValue(new Error("db down"));
    await expect(resolveHealthConsent("u1")).resolves.toBe(false);
  });
});

describe("requireHealthConsent", () => {
  it("зі згодою пропускає далі", async () => {
    hasHealthDataConsentMock.mockResolvedValue(true);
    await expect(
      run(requireHealthConsent(), req({ id: "u1" })),
    ).resolves.toBeUndefined();
  });

  it("без згоди — 403 з кодом і текстом-дією (не «доступ заборонено»)", async () => {
    hasHealthDataConsentMock.mockResolvedValue(false);
    await expect(
      run(requireHealthConsent(), req({ id: "u1" })),
    ).resolves.toMatchObject({
      status: 403,
      code: HEALTH_CONSENT_REQUIRED_CODE,
      message: HEALTH_CONSENT_REQUIRED_MESSAGE,
    });
  });

  it("без згоди при збої БД — теж 403 (fail-closed)", async () => {
    hasHealthDataConsentMock.mockRejectedValue(new Error("db down"));
    await expect(
      run(requireHealthConsent(), req({ id: "u1" })),
    ).resolves.toMatchObject({ status: 403 });
  });

  it("appliesTo=false — перевірки немає", async () => {
    await expect(
      run(
        requireHealthConsent(() => false),
        req({ id: "u1" }),
      ),
    ).resolves.toBeUndefined();
    expect(hasHealthDataConsentMock).not.toHaveBeenCalled();
  });
});

describe("scrubGoalWithoutHealthConsent", () => {
  it("без згоди прибирає preferences.goal, решту лишає", async () => {
    hasHealthDataConsentMock.mockResolvedValue(false);
    const body = { preferences: { goal: "lose", servings: 2 } };
    await run(scrubGoalWithoutHealthConsent(), req({ id: "u1" }, body));
    expect(body.preferences).toEqual({ servings: 2 });
  });

  it("зі згодою тіло не чіпає", async () => {
    hasHealthDataConsentMock.mockResolvedValue(true);
    const body = { preferences: { goal: "lose" } };
    await run(scrubGoalWithoutHealthConsent(), req({ id: "u1" }, body));
    expect(body.preferences).toEqual({ goal: "lose" });
  });

  it("без preferences.goal — БД не питаємо", async () => {
    await run(scrubGoalWithoutHealthConsent(), req({ id: "u1" }, {}));
    expect(hasHealthDataConsentMock).not.toHaveBeenCalled();
  });
});
