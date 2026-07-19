// ─────────────────────────────────────────────────────────────────────────
// External-metrics tools ported from Sergeant Console agents (ADR-0032)
// ─────────────────────────────────────────────────────────────────────────
//
// ADR-0032: ports legacy Sergeant Console (ADR-0027) ops/marketing tools
// into OpenClaw, behind the same `/api/internal/openclaw/*` boundary so
// allowlist + audit guarantees still apply. Tools fail-soft when their
// upstream secrets are missing (returning a `not_configured: true` flag),
// the same way `read_workflow_logs` does for n8n.

import { env } from "../../env.js";
import { getOpenclawGithubAuth } from "./github-auth.js";
import { assertOpenClawRepoAllowed } from "./repoAllowlist.js";

// ─────────────────────────────────────────────────────────────────────────
// get_stripe_metrics — billing summary (ported from agents/ops.ts)
// ─────────────────────────────────────────────────────────────────────────

export interface GetStripeMetricsInput {
  /** Lookback window in days. Default 7, max 90. */
  days?: number | undefined;
}

export interface GetStripeMetricsOutput {
  notConfigured?: boolean;
  windowDays?: number;
  successfulCount?: number;
  failedCount?: number;
  grossAmountUah?: number;
  note?: string;
}

export async function getStripeMetrics(
  input: GetStripeMetricsInput,
): Promise<GetStripeMetricsOutput> {
  const stripeKey = process.env["STRIPE_SECRET_KEY"];
  if (!stripeKey) {
    return {
      notConfigured: true,
      note: "STRIPE_SECRET_KEY is not configured on the server.",
    };
  }
  const days = Math.max(1, Math.min(90, input.days ?? 7));
  const since = Math.floor(Date.now() / 1000) - days * 86_400;

  const res = await fetch(
    `https://api.stripe.com/v1/charges?created[gte]=${since}&limit=100`,
    { headers: { Authorization: `Bearer ${stripeKey}` } },
  );
  const data = (await res.json().catch(() => ({}))) as {
    data?: Array<{ amount: number; paid: boolean }>;
  };
  const charges = data.data ?? [];
  const successful = charges.filter((c) => c.paid);
  const failed = charges.filter((c) => !c.paid);
  const grossAmountUah = successful.reduce((sum, c) => sum + c.amount, 0) / 100;

  return {
    windowDays: days,
    successfulCount: successful.length,
    failedCount: failed.length,
    grossAmountUah,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// get_sentry_issues — open Sentry issues by severity (ported from agents/ops.ts)
// ─────────────────────────────────────────────────────────────────────────

export type SentryLevel = "fatal" | "error" | "warning";

export interface GetSentryIssuesInput {
  level?: SentryLevel | undefined;
  limit?: number | undefined;
}

export interface SentryIssueRecord {
  title: string;
  level: string;
  count: string;
  permalink: string;
}

export interface GetSentryIssuesOutput {
  notConfigured?: boolean;
  issues?: SentryIssueRecord[];
  note?: string;
}

export async function getSentryIssues(
  input: GetSentryIssuesInput,
): Promise<GetSentryIssuesOutput> {
  const token = process.env["SENTRY_AUTH_TOKEN"];
  const org = process.env["SENTRY_ORG"] ?? "sergeant";
  if (!token) {
    return {
      notConfigured: true,
      note: "SENTRY_AUTH_TOKEN is not configured on the server.",
    };
  }
  const level: SentryLevel = input.level ?? "error";
  const limit = Math.max(1, Math.min(50, input.limit ?? 10));

  const res = await fetch(
    `https://sentry.io/api/0/organizations/${org}/issues/?query=is:unresolved+level:${level}&limit=${limit}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const body = (await res.json().catch(() => null)) as
    SentryIssueRecord[] | { detail?: string } | null;

  if (!Array.isArray(body)) {
    return {
      issues: [],
      note: `Sentry API returned ${res.status}${
        body && "detail" in body ? `: ${body.detail}` : ""
      }`,
    };
  }
  return {
    issues: body.map((i) => ({
      title: i.title,
      level: i.level,
      count: i.count,
      permalink: i.permalink,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// get_server_stats — proxy /healthz (ported from agents/ops.ts)
// ─────────────────────────────────────────────────────────────────────────

export interface GetServerStatsOutput {
  source: "/healthz";
  status: number;
  body: unknown;
}

/**
 * Proxies a `GET /healthz` against the same server process. Used by
 * OpenClaw for "is the platform alive right now?" answers.
 *
 * Why hit our own process via HTTP instead of inlining health checks:
 *   - `/healthz` already aggregates DB / Redis / queue depth in one place
 *     and is exercised by Railway's health probe; reusing it keeps the
 *     answer consistent with what infra sees.
 *   - Future Phase 2 may move `/healthz` to a sidecar or shard — keeping
 *     the OpenClaw call HTTP-shaped lets that migration happen without
 *     touching tool code.
 */
export async function getServerStats(): Promise<GetServerStatsOutput> {
  const port = String(env.PORT);
  const baseUrl =
    process.env["SERVER_INTERNAL_URL"] ?? `http://localhost:${port}`;
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/healthz`, {
    headers: { Accept: "application/json" },
  });
  const body: unknown = await res.json().catch(() => null);
  return { source: "/healthz", status: res.status, body };
}

// ─────────────────────────────────────────────────────────────────────────
// get_posthog_stats — analytics summary (ported from agents/marketing.ts)
// ─────────────────────────────────────────────────────────────────────────

export interface GetPostHogStatsInput {
  /** Lookback window in days. Default 7. */
  days?: number | undefined;
}

export interface GetPostHogStatsOutput {
  notConfigured?: boolean;
  body?: unknown;
  note?: string;
}

export async function getPostHogStats(
  input: GetPostHogStatsInput,
): Promise<GetPostHogStatsOutput> {
  const apiKey = process.env["POSTHOG_API_KEY"];
  const projectId = process.env["POSTHOG_PROJECT_ID"];
  if (!apiKey || !projectId) {
    return {
      notConfigured: true,
      note: "POSTHOG_API_KEY or POSTHOG_PROJECT_ID is not configured.",
    };
  }
  const days = Math.max(1, Math.min(180, input.days ?? 7));
  const url =
    `https://app.posthog.com/api/projects/${projectId}/insights/trend/` +
    `?events=[{"id":"$pageview"}]&date_from=-${days}d`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const body: unknown = await res.json().catch(() => null);
  return { body };
}

// ─────────────────────────────────────────────────────────────────────────
// get_github_releases — recent merged releases (ported from agents/marketing.ts)
// ─────────────────────────────────────────────────────────────────────────

export interface GetGithubReleasesInput {
  /** Number of releases. Default 5, max 20. */
  limit?: number | undefined;
  /** owner/repo. Defaults to env.OPENCLAW_GITHUB_REPO. */
  repo?: string | undefined;
}

export interface GetGithubReleasesOutput {
  releases: Array<{
    tagName: string;
    name: string;
    publishedAt: string | null;
    bodyExcerpt: string;
  }>;
  note?: string;
}

export async function getGithubReleases(
  input: GetGithubReleasesInput,
): Promise<GetGithubReleasesOutput> {
  const limit = Math.max(1, Math.min(20, input.limit ?? 5));
  // T2 audit #3 — see readGithub for rationale.
  const repo = assertOpenClawRepoAllowed(input.repo);
  // GitHub allows unauthenticated access for public repo releases (60 RPH);
  // any auth (PAT or App-installation token) bumps the rate to 5000 RPH and
  // is required for private repos.
  const auth = await getOpenclawGithubAuth();
  const token = auth?.token ?? "";

  const res = await fetch(
    `https://api.github.com/repos/${repo}/releases?per_page=${limit}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "OpenClaw-Bot",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  );
  const body = (await res.json().catch(() => null)) as
    | Array<{
        name: string | null;
        tag_name: string;
        published_at: string | null;
        body: string | null;
      }>
    | { message?: string }
    | null;

  if (!Array.isArray(body)) {
    return {
      releases: [],
      note: `GitHub API returned ${res.status}${
        body && "message" in body ? `: ${body.message}` : ""
      }`,
    };
  }
  return {
    releases: body.map((r) => ({
      tagName: r.tag_name,
      name: r.name ?? r.tag_name,
      publishedAt: r.published_at,
      bodyExcerpt: (r.body ?? "").slice(0, 500),
    })),
  };
}
