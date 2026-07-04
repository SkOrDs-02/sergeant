// ─────────────────────────────────────────────────────────────────────────
// record_decision — Postgres INSERT + GitHub PR (best-effort)
// ─────────────────────────────────────────────────────────────────────────

import type { Pool } from "pg";
import { toLocalISODate } from "@sergeant/shared";
import { logger } from "../../obs/logger.js";
import { env } from "../../env.js";
import { getOpenclawGithubAuth } from "./github-auth.js";
import {
  insertDecision,
  attachDecisionPrUrl,
  type RecordDecisionInput,
} from "./store.js";

export interface RecordDecisionResult {
  decisionId: number;
  prUrl: string | null;
  prError?: string;
}

/**
 * INSERT у `openclaw_decisions` + open PR (best-effort). Якщо GitHub PAT
 * не задано — `prUrl=null` і `prError` пояснює причину. Caller-у
 * (audit-trail у `openclaw_invocations`) показує deferred-state і founder
 * може повторити вручну у Phase 2.
 *
 * Slug для filename:
 *   `<YYYY-MM-DD>-<slug-from-topic>.md`
 * де slug — lowercase + non-alnum → `-` + truncate-ується до 50 chars.
 */
export async function recordDecision(
  pool: Pool,
  input: RecordDecisionInput,
): Promise<RecordDecisionResult> {
  const decisionId = await insertDecision(pool, input);

  const auth = await getOpenclawGithubAuth();
  if (!auth) {
    return {
      decisionId,
      prUrl: null,
      prError:
        "OpenClaw GitHub auth not configured (neither GitHub App nor PAT); PR not opened",
    };
  }
  const token = auth.token;

  try {
    const prUrl = await openDecisionPr(token, {
      decisionId,
      topic: input.topic,
      context: input.context,
      decision: input.decision,
      rationale: input.rationale,
      ...(input.alternatives !== undefined
        ? { alternatives: input.alternatives }
        : {}),
    });
    await attachDecisionPrUrl(pool, decisionId, prUrl);
    return { decisionId, prUrl };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.warn({
      msg: "openclaw_record_decision_pr_failed",
      decisionId,
      error: message,
    });
    return { decisionId, prUrl: null, prError: message };
  }
}

function decisionSlug(topic: string): string {
  return (
    topic
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "decision"
  );
}

function decisionMarkdown(input: {
  decisionId: number;
  topic: string;
  context: string;
  decision: string;
  rationale: string;
  alternatives?: string | undefined;
}): string {
  const date = toLocalISODate();
  return [
    `# ${input.topic}`,
    "",
    `**Date:** ${date}`,
    `**Decision ID (Postgres):** ${input.decisionId}`,
    `**Recorded by:** OpenClaw (ADR-0031)`,
    "",
    `## Context`,
    "",
    input.context,
    "",
    `## Decision`,
    "",
    input.decision,
    "",
    `## Rationale`,
    "",
    input.rationale,
    "",
    ...(input.alternatives
      ? ["## Alternatives considered", "", input.alternatives, ""]
      : []),
  ].join("\n");
}

async function openDecisionPr(
  token: string,
  input: {
    decisionId: number;
    topic: string;
    context: string;
    decision: string;
    rationale: string;
    alternatives?: string | undefined;
  },
): Promise<string> {
  const repo = env.OPENCLAW_GITHUB_REPO;
  const baseBranch = env.OPENCLAW_GITHUB_BASE_BRANCH;
  const date = toLocalISODate();
  const slug = decisionSlug(input.topic);
  const branch = `openclaw/decision-${input.decisionId}-${slug}`;
  const filePath = `docs/decisions/${date}-${slug}.md`;
  const markdown = decisionMarkdown(input);

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "OpenClaw-Bot",
  };

  // 1) Get base SHA.
  const refRes = await fetch(
    `https://api.github.com/repos/${repo}/git/ref/heads/${baseBranch}`,
    { headers },
  );
  if (!refRes.ok) {
    throw new Error(`Failed to read base ref: HTTP ${refRes.status}`);
  }
  const refBody = (await refRes.json()) as { object?: { sha: string } };
  const baseSha = refBody.object?.sha;
  if (!baseSha) throw new Error("Base ref has no sha");

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
    throw new Error(`Failed to create branch: HTTP ${createRefRes.status}`);
  }

  // 3) Create file on branch (Contents API). Якщо існує — не перезаписуємо
  // (PUT з sha вимагав би GET спочатку; для нового decision-у file точно
  // ще не існує бо filename має decisionId).
  const putRes = await fetch(
    `https://api.github.com/repos/${repo}/contents/${encodeURI(filePath)}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `chore(openclaw): record decision #${input.decisionId} — ${input.topic}`,
        content: Buffer.from(markdown, "utf-8").toString("base64"),
        branch,
      }),
    },
  );
  if (!putRes.ok) {
    throw new Error(`Failed to create file: HTTP ${putRes.status}`);
  }

  // 4) Open PR.
  const prRes = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: `chore(openclaw): decision #${input.decisionId} — ${input.topic}`,
      head: branch,
      base: baseBranch,
      body: [
        markdown,
        "",
        "---",
        "",
        `_PR opened automatically by OpenClaw. Postgres row: \`openclaw_decisions.id=${input.decisionId}\`._`,
        `_Per ADR-0031 §3, OpenClaw never auto-merges; founder reviews and merges._`,
      ].join("\n"),
      maintainer_can_modify: true,
    }),
  });
  if (!prRes.ok) {
    throw new Error(`Failed to open PR: HTTP ${prRes.status}`);
  }
  const prBody = (await prRes.json()) as { html_url?: string };
  if (!prBody.html_url) throw new Error("PR response missing html_url");
  return prBody.html_url;
}
