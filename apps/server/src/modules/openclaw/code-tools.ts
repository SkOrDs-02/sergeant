/**
 * Code-understanding tools (PR-C1b).
 *
 * Thin proxies над GitHub REST API; auth уніфіковано через
 * `getOpenclawGithubAuth()` (Hard Rule #20 — лише GitHub App flow у
 * production, PAT тільки у dev/CI).
 *
 * Поверх існуючого `read_github` (mode='file'|'issue'|'pr') ми додаємо
 * чотири більш cilіспрямовані surfaces:
 *
 *   github_search — code/issues/pr search (`GET /search/{code,issues}`).
 *   github_tree   — list tree at ref (`GET /repos/.../git/trees/{ref}`).
 *   github_diff   — compare base...head (`GET /repos/.../compare/...`).
 *   github_prs    — list pulls (`GET /repos/.../pulls`).
 *
 * Усі повертають `{ url, status, body }` (mirror контракту `readGithub`),
 * де `body` — необроблений JSON-response GitHub. Plugin-tool-и фільтрують
 * до LLM-friendly формату.
 */

import { env } from "../../env.js";
import { logger } from "../../obs/logger.js";
import { getOpenclawGithubAuth } from "./github-auth.js";
import { assertOpenClawRepoAllowed } from "./repoAllowlist.js";

const GITHUB_API_VERSION = "2022-11-28";
const USER_AGENT = "OpenClaw-Bot";

interface GithubResponse {
  url: string;
  status: number;
  body: unknown;
}

async function callGithub(url: string): Promise<GithubResponse> {
  const auth = await getOpenclawGithubAuth();
  if (!auth) {
    throw new Error(
      "OpenClaw GitHub auth not configured (neither GitHub App nor PAT); code-tools disabled",
    );
  }
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${auth.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": USER_AGENT,
    },
  });
  const body: unknown = await res.json().catch(() => null);
  return { url, status: res.status, body };
}

function resolveRepo(input: { repo?: string | undefined }): string {
  // T2 audit #3 — the four code-understanding tools all flow through this
  // helper, so allowlist enforcement at this single chokepoint covers
  // github_search/tree/diff/prs in one place.
  return assertOpenClawRepoAllowed(input.repo);
}

function resolveRef(input: { ref?: string | undefined }): string {
  return input.ref ?? env.OPENCLAW_GITHUB_BASE_BRANCH;
}

// ─── github_search ─────────────────────────────────────────────────────

export type GithubSearchScope = "code" | "issues" | "prs";

export interface GithubSearchInput {
  /** Search scope. Default 'code'. */
  scope?: GithubSearchScope | undefined;
  /** Search query. Auto-prepended with `repo:<owner/repo>` for `code`. */
  query: string;
  /** "owner/repo" — defaults to env.OPENCLAW_GITHUB_REPO. */
  repo?: string | undefined;
  /** Page size 1..30. */
  perPage?: number | undefined;
  /** Page number 1..10. */
  page?: number | undefined;
}

export async function githubSearch(
  input: GithubSearchInput,
): Promise<GithubResponse> {
  const scope: GithubSearchScope = input.scope ?? "code";
  const repo = resolveRepo(input);
  const perPage = Math.max(1, Math.min(30, input.perPage ?? 10));
  const page = Math.max(1, Math.min(10, input.page ?? 1));

  let endpoint: "code" | "issues";
  let q = input.query.trim();
  if (!q) throw new Error("github_search: query required");

  if (scope === "code") {
    endpoint = "code";
    if (!/\brepo:/.test(q)) q = `repo:${repo} ${q}`;
  } else if (scope === "issues") {
    endpoint = "issues";
    if (!/\brepo:/.test(q)) q = `repo:${repo} ${q}`;
    if (!/\bis:/.test(q)) q = `is:issue ${q}`;
  } else if (scope === "prs") {
    endpoint = "issues";
    if (!/\brepo:/.test(q)) q = `repo:${repo} ${q}`;
    if (!/\bis:/.test(q)) q = `is:pr ${q}`;
  } else {
    throw new Error(`github_search: unknown scope '${scope as string}'`);
  }

  const params = new URLSearchParams({
    q,
    per_page: String(perPage),
    page: String(page),
  });
  const url = `https://api.github.com/search/${endpoint}?${params.toString()}`;
  return callGithub(url);
}

// ─── github_tree ───────────────────────────────────────────────────────

export interface GithubTreeInput {
  /** ref (branch/sha/tag). Default — env.OPENCLAW_GITHUB_BASE_BRANCH. */
  ref?: string | undefined;
  /** "owner/repo" — defaults to env.OPENCLAW_GITHUB_REPO. */
  repo?: string | undefined;
  /** Recursive tree (рекомендовано false для top-level). */
  recursive?: boolean | undefined;
}

export async function githubTree(
  input: GithubTreeInput,
): Promise<GithubResponse> {
  const repo = resolveRepo(input);
  const ref = resolveRef(input);
  const recursive = input.recursive === true;
  const params = new URLSearchParams();
  if (recursive) params.set("recursive", "1");
  const url = `https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(ref)}${params.toString() ? `?${params.toString()}` : ""}`;
  return callGithub(url);
}

// ─── github_diff ───────────────────────────────────────────────────────

export interface GithubDiffInput {
  /** Базова ref для compare (наприклад `main`). */
  base: string;
  /** Цільова ref (наприклад `feature/x` або PR-head sha). */
  head: string;
  /** "owner/repo" — defaults to env.OPENCLAW_GITHUB_REPO. */
  repo?: string | undefined;
}

export async function githubDiff(
  input: GithubDiffInput,
): Promise<GithubResponse> {
  const repo = resolveRepo(input);
  if (!input.base.trim() || !input.head.trim()) {
    throw new Error("github_diff: both base and head are required");
  }
  // GitHub compare-syntax: `<base>...<head>`. Need to encode each ref
  // independently — `encodeURIComponent` ламає slash, тому encode-ять
  // лише ref-part.
  // eslint-disable-next-line sergeant-design/no-ellipsis-dots -- GitHub compare-API syntax requires literal `...` between refs
  const url = `https://api.github.com/repos/${repo}/compare/${encodeURIComponent(input.base)}...${encodeURIComponent(input.head)}`;
  return callGithub(url);
}

// ─── github_prs ────────────────────────────────────────────────────────

export interface GithubPrsInput {
  /** "owner/repo" — defaults to env.OPENCLAW_GITHUB_REPO. */
  repo?: string | undefined;
  /** open/closed/all. Default 'open'. */
  state?: "open" | "closed" | "all" | undefined;
  /** GitHub username, фільтрує по author. */
  author?: string | undefined;
  /** Branch name (head filter). */
  head?: string | undefined;
  /** Base branch filter. */
  base?: string | undefined;
  /** Sort: created|updated|popularity|long-running. Default 'updated'. */
  sort?: "created" | "updated" | "popularity" | "long-running" | undefined;
  /** Direction: asc|desc. Default 'desc'. */
  direction?: "asc" | "desc" | undefined;
  /** 1..30 (для LLM-context-window). */
  perPage?: number | undefined;
  /** Page number. */
  page?: number | undefined;
}

export async function githubPrs(
  input: GithubPrsInput,
): Promise<GithubResponse> {
  const repo = resolveRepo(input);
  const params = new URLSearchParams({
    state: input.state ?? "open",
    sort: input.sort ?? "updated",
    direction: input.direction ?? "desc",
    per_page: String(Math.max(1, Math.min(30, input.perPage ?? 10))),
    page: String(Math.max(1, input.page ?? 1)),
  });
  if (input.head) params.set("head", input.head);
  if (input.base) params.set("base", input.base);

  // Author не підтримується нативно на /pulls — використовуємо
  // /search/issues якщо переданий. Для простоти, якщо author передано —
  // routи через github_search('prs').
  if (input.author && input.author.trim()) {
    const searchUrl = `https://api.github.com/search/issues?${new URLSearchParams(
      {
        q: `repo:${repo} is:pr state:${input.state ?? "open"} author:${input.author.trim()}`,
        per_page: String(Math.max(1, Math.min(30, input.perPage ?? 10))),
        page: String(Math.max(1, input.page ?? 1)),
      },
    ).toString()}`;
    return callGithub(searchUrl);
  }

  const url = `https://api.github.com/repos/${repo}/pulls?${params.toString()}`;
  return callGithub(url);
}

// ─── debug helper ─────────────────────────────────────────────────────

/**
 * Test-utility: лог-канал, що використовується tools-and-poller'ом, але
 * нікому з оборонного коду перевіряти не треба. Експортуємо лише для тестів.
 */
export const _internalLogger = logger;
