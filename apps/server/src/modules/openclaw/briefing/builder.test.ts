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
import {
  StubProvider,
  type LLMGenerateOpts,
  type LLMGenerateResult,
  type LLMProvider,
} from "../../../lib/llm/provider.js";
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

/**
 * O1 / Phase 2.A — proposals секція через LLMProvider override.
 * Перевіряємо happy / parse-fail / provider-error / stub / disabled.
 * Мокаємо тільки LLM (стандартні fetch-mocks залишають інші 5 секцій
 * на дефолтних not-configured-fallback-ах).
 */
class FakeLLMProvider implements LLMProvider {
  readonly name = "anthropic" as const;
  calls: LLMGenerateOpts[] = [];
  constructor(
    private readonly responder: (
      opts: LLMGenerateOpts,
    ) => Promise<LLMGenerateResult> | LLMGenerateResult,
  ) {}
  async generate(opts: LLMGenerateOpts): Promise<LLMGenerateResult> {
    this.calls.push(opts);
    return await this.responder(opts);
  }
}

describe("assembleMorningBriefing — O1 / Phase 2.A proposals (LLM)", () => {
  it("populates proposals from LLM response with reasoning", async () => {
    const llm = new FakeLLMProvider(() => ({
      ok: true,
      text: JSON.stringify({
        proposals: [
          "Закрити PR #101 (needs-review старший за 24h)",
          "Перевірити Sentry error spike по chat-stream",
          "Розписати growth-experiment у docs/strategy",
        ],
        reasoning:
          "PR-черга росте, Sentry показав error, growth блокує MRR — три фокуси максимізують impact.",
      }),
    }));
    const { data, markdown } = await assembleMorningBriefing(
      { nowMs: Date.parse("2026-05-13T06:00:00Z") },
      { llmProvider: llm },
    );
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]?.model).toBe("claude-sonnet-4-5-20250929");
    expect(llm.calls[0]?.endpoint).toBe(
      "internal/openclaw/briefing/morning/proposals",
    );
    expect(data.proposals?.proposals).toEqual([
      "Закрити PR #101 (needs-review старший за 24h)",
      "Перевірити Sentry error spike по chat-stream",
      "Розписати growth-experiment у docs/strategy",
    ]);
    expect(data.proposals?.reasoning).toContain("PR-черга росте");
    expect(markdown).toContain("🎯 Пропозиції на сьогодні");
    expect(markdown).toContain(
      "1. Закрити PR #101 (needs-review старший за 24h)",
    );
    // Proposals must appear above MRR section.
    const proposalsIdx = markdown.indexOf("🎯 Пропозиції");
    const stripeIdx = markdown.indexOf("💵 MRR / Stripe");
    expect(proposalsIdx).toBeLessThan(stripeIdx);
  });

  it("returns notConfigured when LLM provider is stub (Anthropic outage / dev)", async () => {
    const { data, markdown } = await assembleMorningBriefing(
      { nowMs: Date.parse("2026-05-13T06:00:00Z") },
      { llmProvider: new StubProvider() },
    );
    expect(data.proposals?.notConfigured).toBe(true);
    expect(data.proposals?.note).toContain("stub-режим");
    expect(markdown).toContain(
      "_LLM-провайдер не сконфігурований (`ANTHROPIC_API_KEY` / `LLM_PROVIDER`); next-action-и пропущено._",
    );
  });

  it("renders rate-limit note when LLM returned 429", async () => {
    const llm = new FakeLLMProvider(() => ({
      ok: false,
      error: "Anthropic rate-limit exceeded",
      status: 429,
      code: "rate_limited",
    }));
    const { data, markdown } = await assembleMorningBriefing(
      { nowMs: Date.parse("2026-05-13T06:00:00Z") },
      { llmProvider: llm },
    );
    expect(data.proposals?.notConfigured).toBeUndefined();
    expect(data.proposals?.proposals).toBeUndefined();
    expect(data.proposals?.note).toBe(
      "LLM rate-limit; фокус — roadmap-задача дня.",
    );
    expect(markdown).toContain("- LLM rate-limit");
  });

  it("renders timeout note when LLM provider timed out", async () => {
    const llm = new FakeLLMProvider(() => ({
      ok: false,
      error: "Request aborted",
      code: "timeout",
    }));
    const { data } = await assembleMorningBriefing(
      { nowMs: Date.parse("2026-05-13T06:00:00Z") },
      { llmProvider: llm },
    );
    expect(data.proposals?.note).toBe(
      "LLM timeout; фокус — roadmap-задача дня.",
    );
  });

  it("renders generic-error note when LLM returned non-classified failure", async () => {
    const llm = new FakeLLMProvider(() => ({
      ok: false,
      error: "Internal Server Error",
      status: 500,
      code: "anthropic_error",
    }));
    const { data } = await assembleMorningBriefing(
      { nowMs: Date.parse("2026-05-13T06:00:00Z") },
      { llmProvider: llm },
    );
    expect(data.proposals?.note).toBe(
      "LLM-пропозиції недоступні (див. Sentry).",
    );
  });

  it("renders parse-fail note when LLM returned non-JSON text", async () => {
    const llm = new FakeLLMProvider(() => ({
      ok: true,
      text: "Sorry I cannot generate proposals today.",
    }));
    const { data } = await assembleMorningBriefing(
      { nowMs: Date.parse("2026-05-13T06:00:00Z") },
      { llmProvider: llm },
    );
    expect(data.proposals?.proposals).toBeUndefined();
    expect(data.proposals?.note).toContain("невалідний JSON");
  });

  it("caps proposals to 3 even if LLM returned more", async () => {
    const llm = new FakeLLMProvider(() => ({
      ok: true,
      text: JSON.stringify({
        proposals: ["a", "b", "c", "d", "e"],
      }),
    }));
    const { data } = await assembleMorningBriefing(
      { nowMs: Date.parse("2026-05-13T06:00:00Z") },
      { llmProvider: llm },
    );
    expect(data.proposals?.proposals).toEqual(["a", "b", "c"]);
  });

  it("filters out empty strings + non-string items from proposals[]", async () => {
    const llm = new FakeLLMProvider(() => ({
      ok: true,
      text: JSON.stringify({
        proposals: ["valid", "", "  ", 42, "second", null],
      }),
    }));
    const { data } = await assembleMorningBriefing(
      { nowMs: Date.parse("2026-05-13T06:00:00Z") },
      { llmProvider: llm },
    );
    expect(data.proposals?.proposals).toEqual(["valid", "second"]);
  });

  it("skips LLM call entirely when includeProposals=false", async () => {
    const llm = new FakeLLMProvider(() => {
      throw new Error("should not be called");
    });
    const { data, markdown } = await assembleMorningBriefing(
      {
        nowMs: Date.parse("2026-05-13T06:00:00Z"),
        includeProposals: false,
      },
      { llmProvider: llm },
    );
    expect(llm.calls).toHaveLength(0);
    expect(data.proposals).toBeUndefined();
    expect(markdown).not.toContain("🎯 Пропозиції");
  });

  it("includes briefing data in LLM user message (Stripe + Sentry + PR signals)", async () => {
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
        match: (u) => u.startsWith("https://api.stripe.com/v1/charges"),
        respond: () =>
          makeJsonResponse({
            data: [{ amount: 25_000, paid: true }],
          }),
      },
      {
        match: (u) => u.includes("app.posthog.com"),
        respond: () => makeJsonResponse({ result: [{ aggregated_value: 5 }] }),
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
        respond: () => makeJsonResponse([]),
      },
    );
    const llm = new FakeLLMProvider(() => ({
      ok: true,
      text: JSON.stringify({
        proposals: ["one", "two", "three"],
      }),
    }));
    await assembleMorningBriefing(
      { nowMs: Date.parse("2026-05-13T06:00:00Z") },
      { llmProvider: llm },
    );
    expect(llm.calls).toHaveLength(1);
    const userMsg = llm.calls[0]?.messages[0]?.content ?? "";
    expect(userMsg).toContain("День звіту: 2026-05-12");
    expect(userMsg).toContain("Stripe:");
    expect(userMsg).toContain("PostHog:");
    expect(userMsg).toContain("Sentry:");
  });
});
