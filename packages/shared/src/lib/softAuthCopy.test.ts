import { describe, it, expect } from "vitest";
import { SOFT_AUTH_COPY_EXPERIMENT, getSoftAuthCopy } from "./softAuthCopy";

describe("getSoftAuthCopy — gain variant (S3.2 mainline)", () => {
  it("speaks of accumulated value for heavy users (5+/3+)", () => {
    const copy = getSoftAuthCopy("gain", { entryCount: 12, sessionDays: 5 });
    expect(copy.title).toBe("Готовий брати з собою?");
    expect(copy.body).toContain("12 записів");
    expect(copy.body).toContain("5 днів");
    // Banned: fear framing.
    expect(copy.body).not.toMatch(/не втратити/);
    expect(copy.body).not.toMatch(/небезпек/i);
  });

  it("affirms first-entry action without fear framing (1-4 entries)", () => {
    const copy = getSoftAuthCopy("gain", { entryCount: 1, sessionDays: 1 });
    expect(copy.title).toBe("Хочеш ці записи в телефоні?");
    expect(copy.body).toContain("1 запис");
    // Banned: lose-aversion phrasing of any kind.
    expect(copy.body).not.toMatch(/не втратити|небезпек|зник|пропад/i);
  });

  it("uses correct plural form for 2-4 entries", () => {
    expect(
      getSoftAuthCopy("gain", { entryCount: 3, sessionDays: 1 }).body,
    ).toContain("3 записи");
  });

  it("uses correct plural form for 5+ entries", () => {
    expect(
      getSoftAuthCopy("gain", { entryCount: 7, sessionDays: 1 }).body,
    ).toContain("7 записів");
  });

  it("uses correct plural for 11-14 (genitive special-case)", () => {
    expect(
      getSoftAuthCopy("gain", { entryCount: 11, sessionDays: 12 }).body,
    ).toContain("11 записів");
    expect(
      getSoftAuthCopy("gain", { entryCount: 14, sessionDays: 12 }).body,
    ).toContain("12 днів");
  });

  it("falls back to neutral copy when no entry signal", () => {
    const copy = getSoftAuthCopy("gain", { entryCount: 0, sessionDays: -1 });
    expect(copy.title).toBe("Хочеш на всіх пристроях?");
    // No entry-count interpolation when there's no signal — fixed copy.
    expect(copy.body).toBe(
      "Акаунт відкриває доступ з телефона та браузера. 20 секунд.",
    );
    // Banned: lose-aversion phrasing in the neutral fallback.
    expect(copy.body).not.toMatch(/не втратити|небезпек|зник|пропад/i);
  });

  it("treats sessionDays=-1 as 'no signal' and stays in the entry-only branch", () => {
    // -1 means HubDashboard hasn't measured yet; we must not promote
    // the heavy-user copy on a fresh render.
    const copy = getSoftAuthCopy("gain", { entryCount: 8, sessionDays: -1 });
    expect(copy.title).toBe("Хочеш ці записи в телефоні?");
  });
});

describe("getSoftAuthCopy — fear variant (preserved for A/B)", () => {
  it("matches the pre-S3.2 fear copy verbatim when entries exist", () => {
    const copy = getSoftAuthCopy("fear", { entryCount: 5, sessionDays: 3 });
    expect(copy.title).toBe("Зберегти на всіх пристроях?");
    expect(copy.body).toBe("У тебе 5 записів. Створи акаунт, щоб не втратити.");
  });

  it("falls back to the original neutral copy with no entries", () => {
    const copy = getSoftAuthCopy("fear", { entryCount: 0, sessionDays: -1 });
    expect(copy.title).toBe("Зберегти на всіх пристроях?");
    expect(copy.body).toBe(
      "Акаунт синхронізує твої дані між телефоном і браузером. 20 секунд.",
    );
  });
});

describe("SOFT_AUTH_COPY_EXPERIMENT", () => {
  it("declares both variants with gain as the mainline default", () => {
    expect(SOFT_AUTH_COPY_EXPERIMENT.id).toBe("soft_auth_copy_v1");
    expect(SOFT_AUTH_COPY_EXPERIMENT.variants).toEqual(["gain", "fear"]);
    expect(SOFT_AUTH_COPY_EXPERIMENT.weights).toEqual([1, 0]);
  });
});
