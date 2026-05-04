/**
 * Jest coverage for `buildIdentifyTraits` (mobile). Mirrors the web
 * suite — same toleration semantics, but reads vibe-picks via
 * `mobileKVStore` (MMKV) instead of localStorage.
 */

const getVibePicksMock = jest.fn();

jest.mock("@sergeant/shared", () => {
  const actual = jest.requireActual("@sergeant/shared") as object;
  return {
    __esModule: true,
    ...actual,
    getVibePicks: (...args: unknown[]) => getVibePicksMock(...args),
  };
});

jest.mock("@/lib/storage", () => ({
  __esModule: true,
  mobileKVStore: { getString: jest.fn(), setString: jest.fn() },
}));

import type { User } from "@sergeant/shared";

import { buildIdentifyTraits } from "../observability/identifyTraits";

const BASE_USER: User = {
  id: "user-123",
  email: "test@example.com",
  name: "Тест",
  image: null,
  emailVerified: true,
  createdAt: "2026-01-15T08:30:00.000Z",
};

beforeEach(() => {
  getVibePicksMock.mockReset().mockReturnValue([]);
});

describe("buildIdentifyTraits (mobile)", () => {
  it("повертає plan + vibe + signup_date коли всі джерела заповнені", () => {
    getVibePicksMock.mockReturnValue(["finyk", "fizruk"]);

    const traits = buildIdentifyTraits(BASE_USER);

    expect(traits).toEqual({
      vibe: ["finyk", "fizruk"],
      plan: "free",
      signup_date: "2026-01-15",
    });
  });

  it("опускає vibe, якщо vibe-picks порожні", () => {
    getVibePicksMock.mockReturnValue([]);
    const traits = buildIdentifyTraits(BASE_USER);
    expect(traits).not.toHaveProperty("vibe");
  });

  it("опускає vibe, якщо getVibePicks кинув", () => {
    getVibePicksMock.mockImplementation(() => {
      throw new Error("MMKV unavailable");
    });
    const traits = buildIdentifyTraits(BASE_USER);
    expect(traits).not.toHaveProperty("vibe");
  });

  it("опускає signup_date, якщо createdAt = null", () => {
    const traits = buildIdentifyTraits({ ...BASE_USER, createdAt: null });
    expect(traits).not.toHaveProperty("signup_date");
  });

  it("опускає signup_date, якщо createdAt не парситься", () => {
    const traits = buildIdentifyTraits({
      ...BASE_USER,
      createdAt: "not-a-date",
    });
    expect(traits).not.toHaveProperty("signup_date");
  });

  it("signup_date — це YYYY-MM-DD у UTC", () => {
    const traits = buildIdentifyTraits({
      ...BASE_USER,
      createdAt: "2026-01-15T02:30:00.000Z",
    });
    expect(traits.signup_date).toBe("2026-01-15");
  });

  it("plan завжди 'free' до запуску білінгу", () => {
    const traits = buildIdentifyTraits(BASE_USER);
    expect(traits.plan).toBe("free");
  });
});
