// @vitest-environment jsdom
//
// Pin behaviour of `formatRelativeUk` (PR-10 ux-roast 2026-Q2 / §10.3).
// Параметризуємо `now`, щоб тести були детерміністичні незалежно від
// реального годинника на CI / локалки.

import { describe, expect, it } from "vitest";
import { formatRelativeUk } from "./relativeTime.uk";

const NOW = new Date("2026-05-07T14:30:00Z");

describe("formatRelativeUk", () => {
  it("returns 'щойно' within the last minute", () => {
    expect(formatRelativeUk(NOW, NOW)).toBe("щойно");
    expect(formatRelativeUk(new Date(NOW.getTime() - 30_000), NOW)).toBe(
      "щойно",
    );
  });

  it("uses minute-grained relative copy under an hour", () => {
    const out = formatRelativeUk(new Date(NOW.getTime() - 5 * 60_000), NOW);
    // Intl.RelativeTimeFormat("uk", { numeric: "auto" }) → «5 хвилин тому»
    expect(out).toMatch(/хвилин/i);
    expect(out).toMatch(/тому/);
  });

  it("anchors today's events with «Сьогодні о HH:MM»", () => {
    // 09:00 UTC of the same UTC day як NOW (14:30 UTC).
    const earlierToday = new Date("2026-05-07T09:00:00Z");
    const out = formatRelativeUk(earlierToday, NOW);
    expect(out.startsWith("Сьогодні о ")).toBe(true);
    // Перевіряємо тільки префікс — точний час залежить від системного TZ
    // тестового runner-а (vitest у CI зазвичай UTC, локально — Kyiv).
  });

  it("uses «Вчора о HH:MM» for the previous calendar day", () => {
    const yesterday = new Date("2026-05-06T20:00:00Z");
    const out = formatRelativeUk(yesterday, NOW);
    expect(out.startsWith("Вчора о ")).toBe(true);
  });

  it("falls back to «N днів тому» between 2 and 6 days", () => {
    const threeDaysAgo = new Date("2026-05-04T14:30:00Z");
    const out = formatRelativeUk(threeDaysAgo, NOW);
    expect(out).toMatch(/(дні|днів|день)/);
    expect(out).toMatch(/тому/);
  });

  it("falls back to absolute date for older entries", () => {
    const old = new Date("2025-10-12T11:00:00Z");
    const out = formatRelativeUk(old, NOW);
    expect(out).toMatch(/2025/);
  });

  it("returns an empty string for invalid input", () => {
    expect(formatRelativeUk("not-a-date", NOW)).toBe("");
  });
});
