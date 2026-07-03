// ─────────────────────────────────────────────────────────────────────────
// read_github — GitHub REST з GITHUB_PAT
// ─────────────────────────────────────────────────────────────────────────

import { env } from "../../env.js";
import { getOpenclawGithubAuth } from "./github-auth.js";
import { assertOpenClawRepoAllowed } from "./repoAllowlist.js";

export interface ReadGithubInput {
  /** "owner/repo". Default — env.OPENCLAW_GITHUB_REPO. */
  repo?: string | undefined;
  /** Один з трьох взаємовиключних режимів. */
  mode: "file" | "issue" | "pr";
  /** Для mode='file'. */
  filePath?: string | undefined;
  ref?: string | undefined;
  /** Для mode='issue' або 'pr'. */
  number?: number | undefined;
}

export interface ReadGithubOutput {
  url: string;
  status: number;
  body: unknown;
}

/**
 * Тонка обгортка над GitHub REST API. Token обов'язковий (fail-closed
 * якщо не задано).
 */
export async function readGithub(
  input: ReadGithubInput,
): Promise<ReadGithubOutput> {
  const auth = await getOpenclawGithubAuth();
  if (!auth) {
    throw new Error(
      "OpenClaw GitHub auth not configured (neither GitHub App nor PAT); read_github disabled",
    );
  }
  const token = auth.token;
  // T2 audit #3 — reject LLM-supplied repos outside the allowlist
  // (otherwise the same prompt-injection vector that lets the model
  // pick a tool call lets it choose ANY repo the App/PAT has scope on).
  const repo = assertOpenClawRepoAllowed(input.repo);

  let url: string;
  if (input.mode === "file") {
    if (!input.filePath) {
      throw new Error("read_github: filePath required for mode='file'");
    }
    const ref = input.ref ?? env.OPENCLAW_GITHUB_BASE_BRANCH;
    url = `https://api.github.com/repos/${repo}/contents/${encodeURI(input.filePath)}?ref=${encodeURIComponent(ref)}`;
  } else if (input.mode === "issue") {
    if (!input.number) {
      throw new Error("read_github: number required for mode='issue'");
    }
    url = `https://api.github.com/repos/${repo}/issues/${input.number}`;
  } else if (input.mode === "pr") {
    if (!input.number) {
      throw new Error("read_github: number required for mode='pr'");
    }
    url = `https://api.github.com/repos/${repo}/pulls/${input.number}`;
  } else {
    throw new Error(`read_github: unknown mode '${input.mode as string}'`);
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "OpenClaw-Bot",
    },
  });
  const body: unknown = await res.json().catch(() => null);
  return { url, status: res.status, body };
}
