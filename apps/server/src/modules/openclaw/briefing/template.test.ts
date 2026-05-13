/**
 * Юніти для pure-template `buildMorningBriefing(data)`. Перевіряємо:
 *
 *   - happy-path (всі 5 секцій повні) — header + кожна секція з даними;
 *   - кожна з 5 секцій у `notConfigured`-мoді — рендериться hint, без
 *     зайвих метрик;
 *   - partial (тільки кілька полів) — рендериться `_не виміряно_`
 *     fallback або порожні counts;
 *   - сортування: header → MRR → signups → PR → workflows → alerts.
 */

import { describe, expect, it } from "vitest";
import { buildMorningBriefing } from "./template.js";
import type { MorningBriefingData } from "./types.js";

function makeData(
  overrides: Partial<MorningBriefingData> = {},
): MorningBriefingData {
  return {
    generatedAt: "2026-05-13T06:00:00.000Z",
    reportingDate: "2026-05-12",
    stripe: {
      windowDays: 1,
      successfulCount: 12,
      failedCount: 1,
      grossAmountUah: 5400,
    },
    signups: {
      windowDays: 1,
      pageviewCount: 312,
      subscriptionStartedCount: 4,
    },
    prQueue: {
      openCount: 7,
      needsReviewCount: 3,
      topPrs: [
        {
          number: 101,
          title: "feat(server): add briefing",
          url: "https://github.com/Skords-01/Sergeant/pull/101",
          needsReview: true,
        },
        {
          number: 100,
          title: "chore(deps): bump zod",
          url: "https://github.com/Skords-01/Sergeant/pull/100",
          needsReview: false,
        },
      ],
    },
    workflows: {
      totalCount: 18,
      activeCount: 16,
      inactiveCount: 2,
      failingCount: 0,
    },
    alerts: {
      level: "error",
      issueCount: 2,
      topIssues: [
        {
          title: "TypeError: foo",
          level: "error",
          count: "5",
          permalink: "https://sentry.io/organizations/sergeant/issues/1/",
        },
      ],
    },
    ...overrides,
  };
}

describe("buildMorningBriefing — happy path", () => {
  const md = buildMorningBriefing(makeData());

  it("includes header with reporting date", () => {
    expect(md).toContain("🌅 *Морній брифінг — 2026-05-12*");
  });

  it("renders all 5 hardcoded sections in order", () => {
    const headerIdx = md.indexOf("Морній брифінг");
    const stripeIdx = md.indexOf("💵 MRR / Stripe");
    const signupsIdx = md.indexOf("👥 Signups / PostHog");
    const prIdx = md.indexOf("🔀 PR-черга / GitHub");
    const wfIdx = md.indexOf("⚙️ n8n workflow-и");
    const alertsIdx = md.indexOf("🚨 User-facing alerts / Sentry");

    expect(headerIdx).toBeGreaterThanOrEqual(0);
    expect(stripeIdx).toBeGreaterThan(headerIdx);
    expect(signupsIdx).toBeGreaterThan(stripeIdx);
    expect(prIdx).toBeGreaterThan(signupsIdx);
    expect(wfIdx).toBeGreaterThan(prIdx);
    expect(alertsIdx).toBeGreaterThan(wfIdx);
  });

  it("renders stripe metrics with success/failed counts", () => {
    expect(md).toContain("Платежі за вчора: 12 успішних, 1 failed");
    expect(md).toMatch(/Gross revenue: 5[\s\u00a0]?400 UAH/);
  });

  it("renders signups with pageviews + subscription_started counts", () => {
    expect(md).toContain("Pageviews за вчора: 312");
    expect(md).toContain("`subscription_started` events: 4");
  });

  it("renders PR queue with open + needs-review counts and top list", () => {
    expect(md).toContain("Open PRs: 7 (з них needs-review: 3)");
    expect(md).toContain(
      "[#101](https://github.com/Skords-01/Sergeant/pull/101) feat(server): add briefing · needs-review",
    );
    expect(md).toContain(
      "[#100](https://github.com/Skords-01/Sergeant/pull/100) chore(deps): bump zod",
    );
  });

  it("renders workflow health counts", () => {
    expect(md).toContain("Total: 18 (active 16, inactive 2)");
    expect(md).toContain("Failing: 0");
  });

  it("renders Sentry alerts with top issues", () => {
    expect(md).toContain("Unresolved `error` issues: 2");
    expect(md).toContain(
      "[TypeError: foo](https://sentry.io/organizations/sergeant/issues/1/) · error · 5×",
    );
  });

  it("ends with a single trailing newline (Telegram-friendly)", () => {
    expect(md.endsWith("\n")).toBe(true);
    expect(md.endsWith("\n\n")).toBe(false);
  });
});

describe("buildMorningBriefing — not configured per section", () => {
  it("shows STRIPE_SECRET_KEY hint when stripe.notConfigured=true", () => {
    const md = buildMorningBriefing(
      makeData({ stripe: { notConfigured: true } }),
    );
    expect(md).toContain("_STRIPE_SECRET_KEY не сконфігурований");
    expect(md).not.toContain("Gross revenue:");
  });

  it("shows POSTHOG_API_KEY hint when signups.notConfigured=true", () => {
    const md = buildMorningBriefing(
      makeData({ signups: { notConfigured: true } }),
    );
    expect(md).toContain(
      "_POSTHOG_API_KEY / POSTHOG_PROJECT_ID не сконфігуровані",
    );
    expect(md).not.toContain("Pageviews");
  });

  it("shows GitHub-auth hint when prQueue.notConfigured=true", () => {
    const md = buildMorningBriefing(
      makeData({ prQueue: { notConfigured: true } }),
    );
    expect(md).toContain("_GitHub-доступу немає");
    expect(md).not.toContain("Open PRs:");
  });

  it("shows N8N hint when workflows.notConfigured=true", () => {
    const md = buildMorningBriefing(
      makeData({ workflows: { notConfigured: true } }),
    );
    expect(md).toContain("_N8N_API_URL / N8N_API_KEY не сконфігуровані");
    expect(md).not.toContain("Total:");
  });

  it("shows SENTRY hint when alerts.notConfigured=true", () => {
    const md = buildMorningBriefing(
      makeData({ alerts: { notConfigured: true } }),
    );
    expect(md).toContain("_SENTRY_AUTH_TOKEN не сконфігурований");
    expect(md).not.toContain("Unresolved");
  });
});

describe("buildMorningBriefing — partial data", () => {
  it("uses '_не виміряно_' fallback when stripe has no grossAmountUah", () => {
    const md = buildMorningBriefing(
      makeData({
        stripe: { windowDays: 1, successfulCount: 0, failedCount: 0 },
      }),
    );
    expect(md).toContain("Gross revenue: _не виміряно_");
  });

  it("uses '_не виміряно_' for missing pageviews", () => {
    const md = buildMorningBriefing(
      makeData({
        signups: { windowDays: 1, subscriptionStartedCount: 2 },
      }),
    );
    expect(md).toContain("Pageviews: _не виміряно_");
    expect(md).toContain("`subscription_started` events: 2");
  });

  it("uses '_не виміряно_' for missing subscription_started", () => {
    const md = buildMorningBriefing(
      makeData({
        signups: { windowDays: 1, pageviewCount: 100 },
      }),
    );
    expect(md).toContain("Pageviews за вчора: 100");
    expect(md).toContain("`subscription_started` events: _не виміряно_");
  });

  it("omits topPrs list when empty/undefined but still shows counts", () => {
    const md = buildMorningBriefing(
      makeData({
        prQueue: { openCount: 3, needsReviewCount: 0 },
        alerts: { level: "error", issueCount: 0 },
      }),
    );
    expect(md).toContain("Open PRs: 3 (з них needs-review: 0)");
    expect(md).not.toContain("Топ:");
  });

  it("renders zero-state for workflows with all defaults", () => {
    const md = buildMorningBriefing(makeData({ workflows: {} }));
    expect(md).toContain("Total: 0 (active 0, inactive 0)");
    expect(md).toContain("Failing: 0");
  });

  it("emits warning marker when workflows have failing > 0", () => {
    const md = buildMorningBriefing(
      makeData({
        workflows: {
          totalCount: 5,
          activeCount: 4,
          inactiveCount: 1,
          failingCount: 2,
        },
      }),
    );
    expect(md).toContain("Failing (last run): 2 ⚠️");
  });

  it("renders alerts.note when present", () => {
    const md = buildMorningBriefing(
      makeData({
        alerts: { issueCount: 0, note: "Sentry API повернув 502" },
      }),
    );
    expect(md).toContain("- Sentry API повернув 502");
  });
});

describe("buildMorningBriefing — formatting edge cases", () => {
  it("handles multi-day window for stripe (windowDays > 1)", () => {
    const md = buildMorningBriefing(
      makeData({
        stripe: {
          windowDays: 7,
          successfulCount: 30,
          failedCount: 2,
          grossAmountUah: 12_500,
        },
      }),
    );
    expect(md).toContain("Платежі за 7 дн: 30 успішних, 2 failed");
  });

  it("formats decimal UAH with two fraction digits", () => {
    const md = buildMorningBriefing(
      makeData({
        stripe: {
          windowDays: 1,
          successfulCount: 1,
          failedCount: 0,
          grossAmountUah: 1234.5,
        },
      }),
    );
    expect(md).toMatch(/1[\s\u00a0]?234,5(?:0)? UAH/);
  });

  it("escapes nothing — title special chars pass through (caller responsibility)", () => {
    const md = buildMorningBriefing(
      makeData({
        prQueue: {
          openCount: 1,
          needsReviewCount: 1,
          topPrs: [
            {
              number: 200,
              title: "fix: <html> & escapes",
              url: "https://example.com/pulls/200",
              needsReview: false,
            },
          ],
        },
      }),
    );
    expect(md).toContain(
      "[#200](https://example.com/pulls/200) fix: <html> & escapes",
    );
  });

  it("returns a stable, idempotent string for the same input", () => {
    const data = makeData();
    expect(buildMorningBriefing(data)).toEqual(buildMorningBriefing(data));
  });
});
