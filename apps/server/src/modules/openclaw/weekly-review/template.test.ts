/**
 * O3 (Phase 2.B) — pure-template `buildWeeklyReview(data)` tests.
 *
 *   - happy-path (всі 5 секцій повні);
 *   - notConfigured-mode для кожної з 4 data-секцій (narrative завжди є);
 *   - partial-render для metrics (тільки this-window без prev);
 *   - стабільне сортування секцій (narrative → shipped → metrics → open
 *     commitments → alerts);
 *   - template-narrative footnote коли `source==='template'`.
 */

import { describe, expect, it } from "vitest";
import { buildWeeklyReview } from "./template.js";
import type { WeeklyReviewData } from "./types.js";

function makeData(overrides: Partial<WeeklyReviewData> = {}): WeeklyReviewData {
  return {
    generatedAt: "2026-05-15T18:00:00.000Z",
    windowStart: "2026-05-08",
    windowEnd: "2026-05-15",
    shipped: {
      mergedCount: 12,
      closedCount: 2,
      topMerged: [
        {
          number: 2659,
          title: "feat(agents): morning briefing cron",
          url: "https://github.com/Skords-01/Sergeant/pull/2659",
          author: "Skords-01",
        },
      ],
    },
    metrics: {
      windowDays: 7,
      grossUahThis: 12000,
      grossUahPrev: 9000,
      successCountThis: 28,
      successCountPrev: 22,
    },
    openCommitments: {
      openCount: 7,
      staleCount: 2,
      staleTop: [
        {
          number: 2500,
          title: "old WIP",
          url: "https://github.com/Skords-01/Sergeant/pull/2500",
          ageDays: 12,
        },
      ],
    },
    alerts: {
      level: "error",
      issueCount: 1,
      topIssues: [
        {
          title: "TypeError: foo",
          level: "error",
          count: "5",
          permalink: "https://sentry.io/organizations/sergeant/issues/1/",
        },
      ],
    },
    narrative: {
      source: "llm",
      text: "Сильний тиждень. Поверни увагу до stale-PR.",
      provider: "anthropic",
    },
    ...overrides,
  };
}

describe("buildWeeklyReview — happy path", () => {
  const md = buildWeeklyReview(makeData());

  it("includes header with window range", () => {
    expect(md).toContain("📅 *Тижневий ритуал — 2026-05-08 … 2026-05-15*");
  });

  it("renders all 5 sections in canonical order", () => {
    const narrativeIdx = md.indexOf("🎯 Пріоритети");
    const shippedIdx = md.indexOf("🚢 Shipped");
    const metricsIdx = md.indexOf("📊 Метрики");
    const openIdx = md.indexOf("🛠 Що зависло");
    const alertsIdx = md.indexOf("⚠️ Sentry alerts");
    expect(narrativeIdx).toBeGreaterThan(-1);
    expect(shippedIdx).toBeGreaterThan(narrativeIdx);
    expect(metricsIdx).toBeGreaterThan(shippedIdx);
    expect(openIdx).toBeGreaterThan(metricsIdx);
    expect(alertsIdx).toBeGreaterThan(openIdx);
  });

  it("renders LLM narrative without template-fallback note", () => {
    expect(md).toContain("Сильний тиждень. Поверни увагу до stale-PR.");
    expect(md).not.toContain("шаблонний summary");
  });

  it("renders merged + closed counts in shipped section", () => {
    expect(md).toContain("Merged за тиждень: 12");
    expect(md).toContain("Closed (без merge): 2");
  });

  it("renders top merged PR with link and author", () => {
    expect(md).toContain(
      "[#2659](https://github.com/Skords-01/Sergeant/pull/2659) feat(agents): morning briefing cron · @Skords-01",
    );
  });

  it("renders metrics with deltas", () => {
    expect(md).toContain("Платежі: 28 (+6 · +27% vs попередній)");
    expect(md).toMatch(/Gross revenue: 12\u00A0?000 ₴/);
  });

  it("renders open commitments stale top with age", () => {
    expect(md).toContain("Open PRs: 7 (з них stale: 2)");
    expect(md).toContain(
      "[#2500](https://github.com/Skords-01/Sergeant/pull/2500) old WIP · 12 дн",
    );
  });

  it("renders alerts section with level + count + permalink", () => {
    expect(md).toContain("Severity error: 1");
    expect(md).toContain(
      "[TypeError: foo](https://sentry.io/organizations/sergeant/issues/1/) · 5× · error",
    );
  });
});

describe("buildWeeklyReview — notConfigured branches", () => {
  it("renders github-not-configured hint for shipped + open commitments", () => {
    const md = buildWeeklyReview(
      makeData({
        shipped: { notConfigured: true },
        openCommitments: { notConfigured: true },
      }),
    );
    expect(md).toMatch(/Shipped[\s\S]*GitHub-доступу немає/);
    expect(md).toMatch(/Що зависло[\s\S]*GitHub-доступу немає/);
  });

  it("renders stripe-not-configured hint for metrics", () => {
    const md = buildWeeklyReview(
      makeData({
        metrics: { notConfigured: true, windowDays: 7 },
      }),
    );
    expect(md).toContain("STRIPE_SECRET_KEY не сконфігурований");
  });

  it("renders sentry-not-configured hint for alerts", () => {
    const md = buildWeeklyReview(makeData({ alerts: { notConfigured: true } }));
    expect(md).toContain("SENTRY_AUTH_TOKEN не сконфігурований");
  });
});

describe("buildWeeklyReview — partial / fallback paths", () => {
  it("renders metrics with only this-window (no prev) gracefully", () => {
    const md = buildWeeklyReview(
      makeData({
        metrics: {
          windowDays: 7,
          successCountThis: 10,
          grossUahThis: 5000,
        },
      }),
    );
    // succPrev defaults to 0 → "+10 vs попередній"
    expect(md).toContain("Платежі: 10 (+10 vs попередній)");
    expect(md).toMatch(/Gross revenue: 5\u00A0?000 ₴/);
  });

  it("appends template-fallback note when narrative source is template", () => {
    const md = buildWeeklyReview(
      makeData({
        narrative: {
          source: "template",
          text: "Спокійний тиждень.",
        },
      }),
    );
    expect(md).toContain("Спокійний тиждень.");
    expect(md).toContain("шаблонний summary");
  });

  it("hides empty topMerged / staleTop / topIssues sub-lists", () => {
    const md = buildWeeklyReview(
      makeData({
        shipped: { mergedCount: 0, closedCount: 0, topMerged: [] },
        openCommitments: { openCount: 0, staleCount: 0, staleTop: [] },
        alerts: { level: "error", issueCount: 0, topIssues: [] },
      }),
    );
    expect(md).not.toContain("- Топ:");
    expect(md).not.toContain("Найстаріші:");
    expect(md).toContain("Merged за тиждень: 0");
    expect(md).toContain("Open PRs: 0 (з них stale: 0)");
    expect(md).toContain("Severity error: 0");
  });
});
