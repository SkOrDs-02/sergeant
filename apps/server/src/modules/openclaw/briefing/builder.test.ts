/**
 * Юніти для `assembleMorningBriefing()` — orchestrator що збирає
 * 5 секцій з мокнутих джерел. Стратегія мокінгу:
 *   - Stripe, PostHog, Sentry, GitHub викликають `fetch` напряму —
 *     підмінюємо `globalThis.fetch`.
 *   - n8n викликається через окремий `n8nFetch` всередині `n8n.ts`,
 *     який сам делегує у `globalThis.fetch`. Не залежимо від креденшалів
 *     — patch-имо env-ключі `N8N_API_URL` / `N8N_API_KEY`.
 *   - `github-auth` має окремий module-mock (як у `code-tools.test.ts`),
 *     щоб обійти GitHub App OIDC-handshake.
 *
 * Перевіряємо:
 *   - happy-path (всі джерела повертають OK) — markdown містить
 *     метрики;
 *   - кожна з 5 секцій у `notConfigured`-мoді — markdown містить hint;
 *   - rejected-promise секція — markdown має `note` + інші секції
 *     зрендерені.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../env.js";
import { assembleMorningBriefing } from "./builder.js";

vi.mock("../github-auth.js", () => ({
  getOpenclawGithubAuth: vi.fn(async () => ({
    token: "fake-token",
    source: "github_app" as const,
  })),
}));

// AI-NOTE: n8n.ts читає env через `readN8nCreds()` що дивиться у
// `env.N8N_API_URL` / `env.N8N_API_KEY`. Підмінюємо їх Object.defineProperty
// (env заморожено `Object.freeze` у env.ts).
const ENV_KEYS = [
  "N8N_API_URL",
  "N8N_API_KEY",
  "STRIPE_SECRET_KEY",
  "POSTHOG_API_KEY",
  "POSTHOG_PROJECT_ID",
  "SENTRY_AUTH_TOKEN",
  "SENTRY_ORG",
] as const;
type PatchableKey = (typeof ENV_KEYS)[number];

const originalEnv: Record<PatchableKey, unknown> = ENV_KEYS.reduce(
  (acc, key) => {
    acc[key] = (env as unknown as Record<string, unknown>)[key];
    return acc;
  },
  {} as Record<PatchableKey, unknown>,
);

const originalProcessEnv: Record<string, string | undefined> = {};
const PROCESS_ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "POSTHOG_API_KEY",
  "POSTHOG_PROJECT_ID",
  "SENTRY_AUTH_TOKEN",
  "SENTRY_ORG",
];

function patchEnv(overrides: Partial<Record<PatchableKey, unknown>>): void {
  for (const [key, value] of Object.entries(overrides)) {
    Object.defineProperty(env, key, {
      value,
      writable: false,
      configurable: true,
      enumerable: true,
    });
    if (typeof value === "string") {
      process.env[key] = value;
    } else if (value == null) {
      delete process.env[key];
    }
  }
}

interface FakeRoute {
  match: (url: string) => boolean;
  respond: () => Response;
}

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let routes: FakeRoute[] = [];
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  routes = [];
  originalFetch = globalThis.fetch;
  for (const key of PROCESS_ENV_KEYS) {
    originalProcessEnv[key] = process.env[key];
  }
  globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    for (const route of routes) {
      if (route.match(url)) return route.respond();
    }
    return makeJsonResponse({ note: "unmatched-test-route", url }, 599);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  // Restore env snapshot.
  for (const key of ENV_KEYS) {
    Object.defineProperty(env, key, {
      value: originalEnv[key],
      writable: false,
      configurable: true,
      enumerable: true,
    });
  }
  for (const key of PROCESS_ENV_KEYS) {
    if (originalProcessEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalProcessEnv[key];
    }
  }
});

describe("assembleMorningBriefing — happy path", () => {
  beforeEach(() => {
    patchEnv({
      STRIPE_SECRET_KEY: "sk_test_xxx",
      POSTHOG_API_KEY: "phx_xxx",
      POSTHOG_PROJECT_ID: "1",
      SENTRY_AUTH_TOKEN: "sntryu_xxx",
      SENTRY_ORG: "sergeant",
      N8N_API_URL: "https://n8n.example.com",
      N8N_API_KEY: "n8n-key",
    });

    routes.push(
      {
        match: (u) => u.startsWith("https://api.stripe.com/v1/charges"),
        respond: () =>
          makeJsonResponse({
            data: [
              { amount: 50_000, paid: true },
              { amount: 30_000, paid: true },
              { amount: 10_000, paid: false },
            ],
          }),
      },
      {
        match: (u) =>
          u.includes("app.posthog.com") && u.includes("subscription_started"),
        respond: () => makeJsonResponse({ result: [{ aggregated_value: 4 }] }),
      },
      {
        match: (u) => u.includes("app.posthog.com"),
        respond: () =>
          makeJsonResponse({ result: [{ aggregated_value: 312 }] }),
      },
      {
        match: (u) => u.startsWith("https://api.github.com/repos/"),
        respond: () =>
          makeJsonResponse([
            {
              number: 101,
              title: "feat: foo",
              html_url: "https://github.com/x/y/pull/101",
              requested_reviewers: [],
              requested_teams: [],
              draft: false,
            },
            {
              number: 100,
              title: "fix: bar",
              html_url: "https://github.com/x/y/pull/100",
              requested_reviewers: [{ login: "alice" }],
              requested_teams: [],
              draft: false,
            },
            {
              number: 99,
              title: "WIP",
              html_url: "https://github.com/x/y/pull/99",
              requested_reviewers: [],
              requested_teams: [],
              draft: true,
            },
          ]),
      },
      {
        match: (u) => u.includes("n8n.example.com/api/v1/workflows"),
        respond: () =>
          makeJsonResponse({
            data: [
              { id: "wf1", name: "alpha", active: true },
              { id: "wf2", name: "beta", active: true },
              { id: "wf3", name: "gamma", active: false },
            ],
          }),
      },
      {
        match: (u) => u.startsWith("https://sentry.io/api/0/organizations"),
        respond: () =>
          makeJsonResponse([
            {
              title: "TypeError: foo",
              level: "error",
              count: "5",
              permalink: "https://sentry.io/issue/1/",
            },
            {
              title: "RangeError",
              level: "error",
              count: "2",
              permalink: "https://sentry.io/issue/2/",
            },
          ]),
      },
    );
  });

  it("returns markdown with reporting date for yesterday in Europe/Kyiv", async () => {
    // 2026-05-13 06:00 UTC = 2026-05-13 09:00 Kyiv → reportingDate is 2026-05-12.
    const nowMs = Date.parse("2026-05-13T06:00:00Z");
    const { markdown, data } = await assembleMorningBriefing({ nowMs });
    expect(data.reportingDate).toBe("2026-05-12");
    expect(markdown).toContain("🌅 *Морній брифінг — 2026-05-12*");
  });

  it("populates stripe section with successful + failed counts", async () => {
    const { data, markdown } = await assembleMorningBriefing({
      nowMs: Date.parse("2026-05-13T06:00:00Z"),
    });
    expect(data.stripe.successfulCount).toBe(2);
    expect(data.stripe.failedCount).toBe(1);
    expect(data.stripe.grossAmountUah).toBe(800);
    expect(markdown).toContain("Платежі за вчора: 2 успішних, 1 failed");
  });

  it("populates signups with pageviews + subscription_started", async () => {
    const { data, markdown } = await assembleMorningBriefing({
      nowMs: Date.parse("2026-05-13T06:00:00Z"),
    });
    expect(data.signups.pageviewCount).toBe(312);
    expect(data.signups.subscriptionStartedCount).toBe(4);
    expect(markdown).toContain("`subscription_started` events: 4");
  });

  it("populates PR-queue with open + needs-review counts (drafts excluded)", async () => {
    const { data } = await assembleMorningBriefing({
      nowMs: Date.parse("2026-05-13T06:00:00Z"),
    });
    expect(data.prQueue.openCount).toBe(2);
    expect(data.prQueue.needsReviewCount).toBe(1);
    expect(data.prQueue.topPrs).toHaveLength(2);
  });

  it("populates workflows with total + active counts", async () => {
    const { data, markdown } = await assembleMorningBriefing({
      nowMs: Date.parse("2026-05-13T06:00:00Z"),
    });
    expect(data.workflows.totalCount).toBe(3);
    expect(data.workflows.activeCount).toBe(2);
    expect(data.workflows.inactiveCount).toBe(1);
    expect(markdown).toContain("Total: 3 (active 2, inactive 1)");
  });

  it("populates alerts with Sentry issues capped at 3", async () => {
    const { data } = await assembleMorningBriefing({
      nowMs: Date.parse("2026-05-13T06:00:00Z"),
    });
    expect(data.alerts.issueCount).toBe(2);
    expect(data.alerts.topIssues).toHaveLength(2);
  });
});

describe("assembleMorningBriefing — not-configured paths", () => {
  it("marks stripe as notConfigured when STRIPE_SECRET_KEY missing", async () => {
    patchEnv({
      STRIPE_SECRET_KEY: undefined,
      POSTHOG_API_KEY: undefined,
      POSTHOG_PROJECT_ID: undefined,
      SENTRY_AUTH_TOKEN: undefined,
      N8N_API_URL: undefined,
      N8N_API_KEY: undefined,
    });
    const { data, markdown } = await assembleMorningBriefing({
      nowMs: Date.parse("2026-05-13T06:00:00Z"),
    });
    expect(data.stripe.notConfigured).toBe(true);
    expect(data.signups.notConfigured).toBe(true);
    expect(data.workflows.notConfigured).toBe(true);
    expect(data.alerts.notConfigured).toBe(true);
    expect(markdown).toContain("_STRIPE_SECRET_KEY не сконфігурований");
    expect(markdown).toContain(
      "_POSTHOG_API_KEY / POSTHOG_PROJECT_ID не сконфігуровані",
    );
    expect(markdown).toContain("_SENTRY_AUTH_TOKEN не сконфігурований");
    expect(markdown).toContain("_N8N_API_URL / N8N_API_KEY не сконфігуровані");
  });
});

describe("assembleMorningBriefing — partial / error tolerance", () => {
  it("captures Sentry 502 in note while rendering other sections", async () => {
    patchEnv({
      STRIPE_SECRET_KEY: "sk_test",
      POSTHOG_API_KEY: "phx",
      POSTHOG_PROJECT_ID: "1",
      SENTRY_AUTH_TOKEN: "sntryu",
      N8N_API_URL: "https://n8n.example.com",
      N8N_API_KEY: "n8n",
    });
    routes.push(
      {
        match: (u) => u.startsWith("https://api.stripe.com/"),
        respond: () => makeJsonResponse({ data: [] }),
      },
      {
        match: (u) => u.includes("app.posthog.com"),
        respond: () => makeJsonResponse({ result: [] }),
      },
      {
        match: (u) => u.startsWith("https://api.github.com/repos/"),
        respond: () => makeJsonResponse([]),
      },
      {
        match: (u) => u.includes("n8n.example.com"),
        respond: () => makeJsonResponse({ data: [] }),
      },
      {
        match: (u) => u.startsWith("https://sentry.io/"),
        respond: () =>
          new Response(JSON.stringify({ detail: "Bad Gateway" }), {
            status: 502,
            headers: { "content-type": "application/json" },
          }),
      },
    );
    const { data, markdown } = await assembleMorningBriefing({
      nowMs: Date.parse("2026-05-13T06:00:00Z"),
    });
    expect(data.alerts.note).toContain("Sentry API returned 502");
    expect(markdown).toContain("Sentry API returned 502");
    // Інші секції все ще рендеряться.
    expect(markdown).toContain("Платежі за вчора:");
    expect(markdown).toContain("Open PRs: 0");
  });

  it("captures GitHub 4xx as note", async () => {
    patchEnv({
      STRIPE_SECRET_KEY: "sk_test",
      POSTHOG_API_KEY: "phx",
      POSTHOG_PROJECT_ID: "1",
      SENTRY_AUTH_TOKEN: "sntryu",
      N8N_API_URL: "https://n8n.example.com",
      N8N_API_KEY: "n8n",
    });
    routes.push(
      {
        match: (u) => u.startsWith("https://api.stripe.com/"),
        respond: () => makeJsonResponse({ data: [] }),
      },
      {
        match: (u) => u.includes("app.posthog.com"),
        respond: () => makeJsonResponse({ result: [] }),
      },
      {
        match: (u) => u.startsWith("https://api.github.com/repos/"),
        respond: () =>
          new Response(JSON.stringify({ message: "Not Found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          }),
      },
      {
        match: (u) => u.includes("n8n.example.com"),
        respond: () => makeJsonResponse({ data: [] }),
      },
      {
        match: (u) => u.startsWith("https://sentry.io/"),
        respond: () => makeJsonResponse([]),
      },
    );
    const { data } = await assembleMorningBriefing({
      nowMs: Date.parse("2026-05-13T06:00:00Z"),
    });
    expect(data.prQueue.openCount).toBeUndefined();
    expect(data.prQueue.note).toContain("GitHub API повернув 404");
  });
});
