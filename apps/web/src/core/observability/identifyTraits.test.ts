// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "@sergeant/shared";

const getVibePicksMock = vi.fn();

vi.mock("../onboarding/vibePicks", async () => {
  const actual = await vi.importActual<
    typeof import("../onboarding/vibePicks")
  >("../onboarding/vibePicks");
  return {
    ...actual,
    getVibePicks: () => getVibePicksMock(),
  };
});

import { buildIdentifyTraits } from "./identifyTraits";

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildIdentifyTraits", () => {
  it("повертає всі чотири трейти, коли всі джерела доступні", () => {
    getVibePicksMock.mockReturnValue(["finyk", "fizruk"]);
    vi.stubGlobal("navigator", { language: "uk-UA" });

    const traits = buildIdentifyTraits(BASE_USER);

    expect(traits).toEqual({
      vibe: ["finyk", "fizruk"],
      plan: "free",
      locale: "uk-UA",
      signup_date: "2026-01-15",
    });
  });

  it("`signup_date` — це YYYY-MM-DD у UTC, не в локальному TZ", () => {
    // 2026-01-15 02:30 UTC = 2026-01-15 04:30 у Києві (UTC+2 взимку),
    // але також 2026-01-15 у Лос-Анджелесі (UTC-8) — там було б
    // 2026-01-14. Тест фіксує саме UTC-зріз.
    const traits = buildIdentifyTraits({
      ...BASE_USER,
      createdAt: "2026-01-15T02:30:00.000Z",
    });
    expect(traits.signup_date).toBe("2026-01-15");
  });

  it("опускає `vibe`, якщо vibe-picks порожні", () => {
    getVibePicksMock.mockReturnValue([]);
    const traits = buildIdentifyTraits(BASE_USER);
    expect(traits).not.toHaveProperty("vibe");
  });

  it("опускає `vibe`, якщо `getVibePicks` кинув (наприклад quota)", () => {
    getVibePicksMock.mockImplementation(() => {
      throw new Error("quota");
    });
    const traits = buildIdentifyTraits(BASE_USER);
    expect(traits).not.toHaveProperty("vibe");
  });

  it("опускає `signup_date`, якщо `createdAt` = null", () => {
    const traits = buildIdentifyTraits({ ...BASE_USER, createdAt: null });
    expect(traits).not.toHaveProperty("signup_date");
  });

  it("опускає `signup_date`, якщо `createdAt` зіпсований", () => {
    const traits = buildIdentifyTraits({
      ...BASE_USER,
      createdAt: "not-a-date",
    });
    expect(traits).not.toHaveProperty("signup_date");
  });

  it("обрізає `locale` до 16 символів (узгоджено з `Locale` schema)", () => {
    vi.stubGlobal("navigator", {
      language: "x".repeat(64),
    });
    const traits = buildIdentifyTraits(BASE_USER);
    expect(traits.locale).toHaveLength(16);
  });

  it("опускає `locale`, якщо `navigator.language` порожній", () => {
    vi.stubGlobal("navigator", { language: "   " });
    const traits = buildIdentifyTraits(BASE_USER);
    expect(traits).not.toHaveProperty("locale");
  });

  it("`plan` завжди `free` до запуску підписок", () => {
    expect(buildIdentifyTraits(BASE_USER).plan).toBe("free");
  });
});
