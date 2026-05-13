/**
 * OpenClaw write-tools (Phase 4, ADR-0036).
 *
 * Each function performs a single side-effecting action against an
 * external system (GitHub, Telegram supergroup, n8n, Sentry). Approval
 * is enforced on the **console** side: when the LLM emits a write-tool
 * call, the console intercepts it, posts an inline-keyboard to the
 * founder, and only after Approve does the console call these functions
 * via the `/api/internal/openclaw/write/*` HTTP endpoints. Server-side
 * we never perform a write without being explicitly invoked through
 * those endpoints (which require `INTERNAL_API_KEY`).
 *
 * Fail-soft policy: when an upstream secret/credential is missing, we
 * return `{ status: 'not_configured', note: '…' }` instead of throwing.
 * That keeps the audit-log clean (one row per attempt) and lets the
 * founder see exactly which integration is missing.
 */

import path from "node:path";
import { env } from "../../env.js";
import { getOpenclawGithubAuth } from "./github-auth.js";
import { assertOpenClawRepoAllowed } from "./repoAllowlist.js";

// ─────────────────────────────────────────────────────────────────────────
// commit_to_strategy_doc — open a GitHub PR with new/updated file in docs/strategy/
// ─────────────────────────────────────────────────────────────────────────

export const COMMIT_STRATEGY_DOC_ALLOWED_PREFIX = "docs/strategy/";

export interface CommitStrategyDocInput {
  /**
   * Repo-relative path. Must start with `docs/strategy/` and end with
   * `.md`. Path traversal (`..`) is blocked via `path.resolve`-prefix
   * check the same way `read_strategy_docs` does it.
   */
  path: string;
  /** Full file contents. We don't append — caller composes the new doc. */
  content: string;
  /** Short commit message (used in PR title + commit msg). */
  message: string;
  /** Optional repo override (defaults to OPENCLAW_GITHUB_REPO). */
  repo?: string | undefined;
}

export interface CommitStrategyDocOutput {
  status: "opened" | "not_configured" | "error";
  prUrl?: string;
  branch?: string;
  filePath?: string;
  note?: string;
}

export class OpenClawWriteAllowlistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenClawWriteAllowlistError";
  }
}

/**
 * Validate that `requested` is inside the strategy-docs prefix and
 * resolves cleanly (no `..`). Returns the normalized repo-relative path
 * or throws `OpenClawWriteAllowlistError`.
 */
export function assertStrategyDocPath(requested: string): string {
  const trimmed = requested.replace(/^\/+/, "");
  if (!trimmed.endsWith(".md")) {
    throw new OpenClawWriteAllowlistError(
      `commit_to_strategy_doc: path must end with .md (got '${requested}')`,
    );
  }
  const fakeRoot = "/__openclaw_root__";
  const resolved = path.resolve(fakeRoot, trimmed);
  const allowedRoot = path.resolve(
    fakeRoot,
    COMMIT_STRATEGY_DOC_ALLOWED_PREFIX,
  );
  if (
    resolved !== allowedRoot &&
    !resolved.startsWith(allowedRoot + path.sep)
  ) {
    throw new OpenClawWriteAllowlistError(
      `commit_to_strategy_doc: path '${requested}' is not under '${COMMIT_STRATEGY_DOC_ALLOWED_PREFIX}'`,
    );
  }
  return trimmed;
}

export async function commitToStrategyDoc(
  input: CommitStrategyDocInput,
): Promise<CommitStrategyDocOutput> {
  const filePath = assertStrategyDocPath(input.path);
  const auth = await getOpenclawGithubAuth();
  if (!auth) {
    return {
      status: "not_configured",
      note: "OpenClaw GitHub auth not configured (neither GitHub App nor PAT); PR not opened.",
    };
  }
  const token = auth.token;
  // T2 audit #3 — assert at the tool boundary too (defense in depth);
  // the HTTP route already runs the same check at request entry.
  const repo = assertOpenClawRepoAllowed(input.repo);
  const baseBranch = env.OPENCLAW_GITHUB_BASE_BRANCH;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "OpenClaw-Bot",
  };

  const slug =
    filePath
      .replace(/^docs\/strategy\//, "")
      .replace(/\.md$/, "")
      .replace(/[^a-zA-Z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "strategy";
  const ts = Math.floor(Date.now() / 1000);
  const branch = `openclaw/strategy-${slug}-${ts}`;

  // 1) Get base SHA.
  const refRes = await fetch(
    `https://api.github.com/repos/${repo}/git/ref/heads/${baseBranch}`,
    { headers },
  );
  if (!refRes.ok) {
    return {
      status: "error",
      note: `Failed to read base ref: HTTP ${refRes.status}`,
    };
  }
  const refBody = (await refRes.json()) as { object?: { sha: string } };
  const baseSha = refBody.object?.sha;
  if (!baseSha) {
    return { status: "error", note: "Base ref response missing sha" };
  }

  // 2) Create branch.
  const createRefRes = await fetch(
    `https://api.github.com/repos/${repo}/git/refs`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
    },
  );
  if (!createRefRes.ok && createRefRes.status !== 422) {
    return {
      status: "error",
      note: `Failed to create branch: HTTP ${createRefRes.status}`,
    };
  }

  // 3) Probe for existing file (so we attach `sha` for update).
  let existingSha: string | undefined;
  const probeRes = await fetch(
    `https://api.github.com/repos/${repo}/contents/${encodeURI(filePath)}?ref=${encodeURIComponent(branch)}`,
    { headers },
  );
  if (probeRes.ok) {
    const probeBody = (await probeRes.json()) as { sha?: string };
    existingSha = probeBody.sha;
  }

  // 4) Create or update file on branch.
  const putRes = await fetch(
    `https://api.github.com/repos/${repo}/contents/${encodeURI(filePath)}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: input.message,
        content: Buffer.from(input.content, "utf-8").toString("base64"),
        branch,
        ...(existingSha ? { sha: existingSha } : {}),
      }),
    },
  );
  if (!putRes.ok) {
    return {
      status: "error",
      note: `Failed to write file: HTTP ${putRes.status}`,
    };
  }

  // 5) Open PR.
  const prRes = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: `chore(openclaw): ${input.message}`,
      head: branch,
      base: baseBranch,
      body: [
        `Strategy doc update from OpenClaw (Phase 4, ADR-0036).`,
        ``,
        `**File:** \`${filePath}\``,
        ``,
        `_PR opened automatically after the founder approved the proposed change in Telegram._`,
        `_Per ADR-0031 §3, OpenClaw never auto-merges; founder reviews and merges._`,
      ].join("\n"),
      maintainer_can_modify: true,
    }),
  });
  if (!prRes.ok) {
    return {
      status: "error",
      note: `Failed to open PR: HTTP ${prRes.status}`,
    };
  }
  const prBody = (await prRes.json()) as { html_url?: string };
  if (!prBody.html_url) {
    return { status: "error", note: "PR response missing html_url" };
  }
  return { status: "opened", prUrl: prBody.html_url, branch, filePath };
}

// ─────────────────────────────────────────────────────────────────────────
// create_github_issue — open an issue in OPENCLAW_GITHUB_REPO
// ─────────────────────────────────────────────────────────────────────────

export interface CreateGithubIssueInput {
  title: string;
  body: string;
  labels?: string[] | undefined;
  repo?: string | undefined;
}

export interface CreateGithubIssueOutput {
  status: "opened" | "not_configured" | "error";
  issueUrl?: string;
  issueNumber?: number;
  note?: string;
}

export async function createGithubIssue(
  input: CreateGithubIssueInput,
): Promise<CreateGithubIssueOutput> {
  const auth = await getOpenclawGithubAuth();
  if (!auth) {
    return {
      status: "not_configured",
      note: "OpenClaw GitHub auth not configured (neither GitHub App nor PAT); issue not opened.",
    };
  }
  const token = auth.token;
  // T2 audit #3 — see commitToStrategyDoc for rationale.
  const repo = assertOpenClawRepoAllowed(input.repo);
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "OpenClaw-Bot",
    },
    body: JSON.stringify({
      title: input.title,
      body: [
        input.body,
        "",
        "---",
        "_Issue opened automatically by OpenClaw (Phase 4, ADR-0036) after founder approval._",
      ].join("\n"),
      labels: input.labels,
    }),
  });
  if (!res.ok) {
    return { status: "error", note: `GitHub returned HTTP ${res.status}` };
  }
  const body = (await res.json()) as {
    html_url?: string;
    number?: number;
  };
  if (!body.html_url || typeof body.number !== "number") {
    return { status: "error", note: "Issue response missing html_url/number" };
  }
  return {
    status: "opened",
    issueUrl: body.html_url,
    issueNumber: body.number,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// post_to_topic — Sergeant Ops supergroup forum-topic message via Sergeant_alert_bot
// ─────────────────────────────────────────────────────────────────────────

/**
 * Allowlist of supergroup forum topics OpenClaw can post into. Mirrors
 * REPORTING-MATRIX.md (single source of truth for who-hears-what).
 *
 * Phase 4 intentionally omits `digest` / `revenue` (we don't want OpenClaw
 * spamming founder-facing digests) and `incidents` / `meta` (production
 * alert lanes — n8n owns these). Surface that's open: ops, engineering,
 * growth — places where OpenClaw can post a synthesized observation.
 */
export const POST_TO_TOPIC_ALLOWLIST: ReadonlySet<string> = new Set([
  "ops",
  "engineering",
  "growth",
]);

const TOPIC_ENV_VAR: Record<string, string> = {
  ops: "TELEGRAM_TOPIC_OPS",
  engineering: "TELEGRAM_TOPIC_ENGINEERING",
  growth: "TELEGRAM_TOPIC_GROWTH",
};

export interface PostToTopicInput {
  /** Topic key from REPORTING-MATRIX.md (allowlist above). */
  topic: string;
  text: string;
}

export interface PostToTopicOutput {
  status: "posted" | "not_configured" | "error";
  topic: string;
  messageId?: number | undefined;
  note?: string | undefined;
}

export async function postToTopic(
  input: PostToTopicInput,
): Promise<PostToTopicOutput> {
  if (!POST_TO_TOPIC_ALLOWLIST.has(input.topic)) {
    throw new OpenClawWriteAllowlistError(
      `post_to_topic: topic '${input.topic}' is not in allowlist (${[...POST_TO_TOPIC_ALLOWLIST].join(", ")})`,
    );
  }
  const botToken = process.env["SERGEANT_ALERT_BOT_TOKEN"];
  const chatId = process.env["SERGEANT_OPS_CHAT_ID"];
  const threadIdRaw = process.env[TOPIC_ENV_VAR[input.topic]!];
  if (!botToken || !chatId || !threadIdRaw) {
    return {
      status: "not_configured",
      topic: input.topic,
      note: "SERGEANT_ALERT_BOT_TOKEN / SERGEANT_OPS_CHAT_ID / topic env var missing.",
    };
  }
  const threadId = Number(threadIdRaw);
  if (!Number.isFinite(threadId)) {
    return {
      status: "error",
      topic: input.topic,
      note: `Topic env var '${TOPIC_ENV_VAR[input.topic]}' is not a number.`,
    };
  }

  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_thread_id: threadId,
        text: input.text,
        disable_notification: true,
      }),
    },
  );
  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    result?: { message_id?: number };
    description?: string;
  } | null;
  if (!res.ok || !body?.ok) {
    return {
      status: "error",
      topic: input.topic,
      note: `Telegram API returned ${res.status}${body?.description ? `: ${body.description}` : ""}`,
    };
  }
  return {
    status: "posted",
    topic: input.topic,
    messageId: body.result?.message_id,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// pause_workflow — n8n REST PATCH workflow active=false
// ─────────────────────────────────────────────────────────────────────────

export interface PauseWorkflowInput {
  workflowId: string;
  /** Optional human reason — recorded in audit-log; n8n doesn't store it. */
  reason?: string | undefined;
}

export interface PauseWorkflowOutput {
  status: "paused" | "not_configured" | "error";
  workflowId: string;
  note?: string;
}

export async function pauseWorkflow(
  input: PauseWorkflowInput,
): Promise<PauseWorkflowOutput> {
  const baseUrl = process.env["N8N_API_URL"];
  const apiKey = process.env["N8N_API_KEY"];
  if (!baseUrl || !apiKey) {
    return {
      status: "not_configured",
      workflowId: input.workflowId,
      note: "N8N_API_URL / N8N_API_KEY not configured; workflow not paused.",
    };
  }
  // n8n exposes a dedicated /deactivate endpoint that bypasses validation
  // we'd hit if we PATCH-ed the full workflow body.
  const url = `${baseUrl.replace(/\/+$/, "")}/api/v1/workflows/${encodeURIComponent(input.workflowId)}/deactivate`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "X-N8N-API-KEY": apiKey, Accept: "application/json" },
  });
  if (!res.ok) {
    return {
      status: "error",
      workflowId: input.workflowId,
      note: `n8n API returned HTTP ${res.status}: ${await res.text().catch(() => "")}`,
    };
  }
  return { status: "paused", workflowId: input.workflowId };
}

// ─────────────────────────────────────────────────────────────────────────
// mute_alert — Sentry API: mute issue (set status=ignored with optional snooze)
// ─────────────────────────────────────────────────────────────────────────

export interface MuteAlertInput {
  /** Sentry issue id (numeric or short hash). */
  issueId: string;
  /**
   * Optional ISO-8601 datetime — when to auto-unmute. If omitted, mute
   * is indefinite until manually changed.
   */
  untilIso?: string | undefined;
}

export interface MuteAlertOutput {
  status: "muted" | "not_configured" | "error";
  issueId: string;
  untilIso?: string | undefined;
  note?: string | undefined;
}

export async function muteSentryAlert(
  input: MuteAlertInput,
): Promise<MuteAlertOutput> {
  const token = process.env["SENTRY_AUTH_TOKEN"];
  if (!token) {
    return {
      status: "not_configured",
      issueId: input.issueId,
      note: "SENTRY_AUTH_TOKEN is not configured; alert not muted.",
    };
  }

  const ignoreUntil = input.untilIso ? Date.parse(input.untilIso) : NaN;
  const ignoreDuration = Number.isFinite(ignoreUntil)
    ? Math.max(1, Math.round((ignoreUntil - Date.now()) / 60_000))
    : undefined;

  const res = await fetch(
    `https://sentry.io/api/0/issues/${encodeURIComponent(input.issueId)}/`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: "ignored",
        ...(ignoreDuration ? { ignoreDuration } : {}),
      }),
    },
  );
  if (!res.ok) {
    return {
      status: "error",
      issueId: input.issueId,
      note: `Sentry API returned HTTP ${res.status}`,
    };
  }
  return {
    status: "muted",
    issueId: input.issueId,
    untilIso: input.untilIso,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Tool name registry (single source of truth — used by console executor)
// ─────────────────────────────────────────────────────────────────────────

/**
 * All write-tool names. Console-side `createOpenClawToolExecutor` consults
 * this set to decide whether to intercept (write) or HTTP-pass-through (read).
 */
export const OPENCLAW_WRITE_TOOL_NAMES: readonly string[] = [
  "commit_to_strategy_doc",
  "create_github_issue",
  "post_to_topic",
  "pause_workflow",
  "mute_alert",
] as const;
