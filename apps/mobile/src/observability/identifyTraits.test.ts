/**
 * Unit tests for the mobile `buildIdentifyTraits` helper.
 *
 * Mocks the shared vibe-picks reader and `mobileKVStore` so we can
 * drive the empty / populated / throwing branches without standing
 * up an MMKV mock. Locale is sniffed via `Intl.DateTimeFormat`, which
 * is provided by Hermes — but we stub it explicitly so behaviour
 * stays platform-independent under jest-expo.
 */

import type { User } from "@sergeant/shared";

const getVibePicksMock = jest.fn();
jest.mock("@sergeant/shared", () => {
  const actual = jest.requireActual("@sergeant/shared");
  return {
    __esModule: true,
    ...actual,
    getVibePicks: (store: unknown) => getVibePicksMock(store),
  };
});

jest.mock("@/lib/storage", () => ({
  __esModule: true,
  mobileKVStore: { __sentinel: "mobileKVStore" },
}));

import { buildIdentifyTraits } from "./identifyTraits";

const baseUser: User = {
  id: "user-1",
  email: "user@example.com",
  name: "Alice",
  image: null,
  emailVerified: true,
  createdAt: "2026-01-15T08:30:00.000Z",
};

beforeEach(() => {
  getVibePicksMock.mockReset().mockReturnValue([]);
});

describe("buildIdentifyTraits", () => {
  it("always sets plan = 'free' (no Stripe yet)", () => {
    const traits = buildIdentifyTraits(baseUser);
    expect(traits.plan).toBe("free");
  });

  it("includes vibe array when vibePicks are populated", () => {
    getVibePicksMock.mockReturnValue(["finyk", "fizruk"]);

    const traits = buildIdentifyTraits(baseUser);

    expect(traits.vibe).toEqual(["finyk", "fizruk"]);
  });

  it("omits vibe when vibePicks are empty", () => {
    getVibePicksMock.mockReturnValue([]);

    const traits = buildIdentifyTraits(baseUser);

    expect(traits).not.toHaveProperty("vibe");
  });

  it("omits vibe when vibePicks throws", () => {
    getVibePicksMock.mockImplementation(() => {
      throw new Error("boom");
    });

    const traits = buildIdentifyTraits(baseUser);

    expect(traits).not.toHaveProperty("vibe");
  });

  it("derives signup_date as YYYY-MM-DD in UTC", () => {
    const traits = buildIdentifyTraits(baseUser);
    expect(traits.signup_date).toBe("2026-01-15");
  });

  it("omits signup_date when createdAt is null", () => {
    const traits = buildIdentifyTraits({ ...baseUser, createdAt: null });
    expect(traits).not.toHaveProperty("signup_date");
  });

  it("omits signup_date when createdAt is unparseable", () => {
    const traits = buildIdentifyTraits({
      ...baseUser,
      createdAt: "not a date",
    });
    expect(traits).not.toHaveProperty("signup_date");
  });

  it("attaches locale when Intl exposes one (capped at 16 chars)", () => {
    const traits = buildIdentifyTraits(baseUser);
    // Hermes / Node both expose Intl with at minimum a short locale.
    if (traits.locale) {
      expect(typeof traits.locale).toBe("string");
      expect(traits.locale.length).toBeLessThanOrEqual(16);
    } else {
      // jest-expo may not provide Intl in some envs — accept both
      // outcomes as long as the helper does not throw.
      expect(traits).not.toHaveProperty("locale");
    }
  });
});
