#!/usr/bin/env node
/**
 * PostHog release annotation poster.
 *
 * Викликається з GitHub Actions після кожного merge у `main` (момент,
 * коли Vercel/Railway тригерять production deploy) — постить event-line
 * у PostHog `Annotations API`, щоб усі дашборди показували вертикальну
 * мітку «релізу» поверх трендів (DAU, CWV, error-rate, funnel-drop).
 *
 * PostHog endpoint:
 *   POST {host}/api/projects/{project_id}/annotations/
 *   Authorization: Bearer <PERSONAL_API_KEY>
 *   Content-Type: application/json
 *   Body: { content, scope, date_marker }
 *
 * Документація: https://posthog.com/docs/data/annotations
 *
 * Required env (інакше — graceful no-op із exit 0):
 *   POSTHOG_PERSONAL_API_KEY  — *Personal* API key (не `phc_*` project key)
 *   POSTHOG_PROJECT_ID        — числовий project id
 * Optional env:
 *   POSTHOG_HOST              — дефолт `https://eu.posthog.com`
 *   POSTHOG_ANNOTATION_SCOPE  — `project` (default), `organization`, або
 *                               `dashboard_item` (потребує POSTHOG_DASHBOARD_ITEM)
 *   POSTHOG_DRY_RUN           — `1` → лише логує payload, без HTTP-виклику
 *
 * GitHub Actions injects:
 *   GITHUB_SHA, GITHUB_REF_NAME, GITHUB_RUN_ID, GITHUB_REPOSITORY,
 *   GITHUB_EVENT_PATH (для commit message з push event payload)
 *
 * Exit codes:
 *   0  — anotation created OR конфіг не виставлений (graceful skip)
 *   1  — конфіг виставлений, але PostHog API повернув не-2xx
 */

import { readFileSync } from "node:fs";

const DEFAULT_HOST = "https://eu.posthog.com";
const MAX_CONTENT_LEN = 400; // PostHog приймає до ~400 символів комфортно
const ALLOWED_SCOPES = new Set(["project", "organization", "dashboard_item"]);

// ─── Pure helpers (exported for unit testing) ─────────────────────────────

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {{host: string, projectId: string, apiKey: string, scope: string} | null}
 */
export function readConfig(env) {
  const apiKey = env.POSTHOG_PERSONAL_API_KEY;
  const projectId = env.POSTHOG_PROJECT_ID;
  if (!apiKey || !projectId) return null;
  const host = (env.POSTHOG_HOST || DEFAULT_HOST).replace(/\/+$/, "");
  const rawScope = env.POSTHOG_ANNOTATION_SCOPE || "project";
  const scope = ALLOWED_SCOPES.has(rawScope) ? rawScope : "project";
  return { host, projectId, apiKey, scope };
}

/**
 * Витягує commit message з GitHub Actions push event payload
 * (`event.head_commit.message`). Якщо payload недоступний (e.g.
 * workflow_dispatch) — повертає `null`.
 *
 * @param {string | undefined} eventPath
 * @param {(p: string) => string} [readFile]
 * @returns {string | null}
 */
export function readCommitMessageFromEvent(
  eventPath,
  readFile = (p) => readFileSync(p, "utf8"),
) {
  if (!eventPath) return null;
  let raw;
  try {
    raw = readFile(eventPath);
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const msg = parsed?.head_commit?.message;
  if (typeof msg !== "string" || msg.length === 0) return null;
  return msg;
}

/**
 * @param {string} message
 * @returns {string}
 */
export function firstLine(message) {
  const idx = message.indexOf("\n");
  return idx === -1 ? message : message.slice(0, idx);
}

/**
 * @param {string} sha
 * @returns {string}
 */
export function shortSha(sha) {
  if (typeof sha !== "string") return "";
  return sha.slice(0, 7);
}

/**
 * Формує content-рядок для анотації.
 *
 *   "Release abc1234 (main): feat(web): posthog $pageview tracking …"
 *
 * Обрізаємо до MAX_CONTENT_LEN з ellipsis, щоб точно не впертись у
 * server-side ліміт PostHog.
 *
 * @param {{ sha: string, ref?: string, commitMessage?: string | null, runId?: string }} input
 * @returns {string}
 */
export function buildContent({ sha, ref, commitMessage, runId }) {
  const sha7 = shortSha(sha);
  const head = sha7 ? `Release ${sha7}` : "Release";
  const refSuffix = ref ? ` (${ref})` : "";
  const subject = commitMessage ? firstLine(commitMessage).trim() : "";
  const subjectSuffix = subject ? `: ${subject}` : "";
  const runSuffix = runId ? ` [run #${runId}]` : "";
  const full = `${head}${refSuffix}${subjectSuffix}${runSuffix}`;
  if (full.length <= MAX_CONTENT_LEN) return full;
  return full.slice(0, MAX_CONTENT_LEN - 1) + "…";
}

/**
 * @param {{ content: string, scope: string, dateMarker: string, dashboardItem?: string }} input
 * @returns {Record<string, unknown>}
 */
export function buildAnnotationPayload({
  content,
  scope,
  dateMarker,
  dashboardItem,
}) {
  /** @type {Record<string, unknown>} */
  const payload = {
    content,
    scope,
    date_marker: dateMarker,
  };
  if (scope === "dashboard_item" && dashboardItem) {
    payload.dashboard_item = dashboardItem;
  }
  return payload;
}

/**
 * @param {{ host: string, projectId: string }} cfg
 * @returns {string}
 */
export function buildAnnotationUrl({ host, projectId }) {
  return `${host}/api/projects/${encodeURIComponent(projectId)}/annotations/`;
}

// ─── HTTP layer ───────────────────────────────────────────────────────────

/**
 * @param {{
 *   host: string,
 *   projectId: string,
 *   apiKey: string,
 *   payload: Record<string, unknown>,
 *   fetchImpl?: typeof fetch,
 * }} args
 * @returns {Promise<{ ok: boolean, status: number, body: string, url: string }>}
 */
export async function postAnnotation({
  host,
  projectId,
  apiKey,
  payload,
  fetchImpl = fetch,
}) {
  const url = buildAnnotationUrl({ host, projectId });
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body, url };
}

// ─── Entry point ──────────────────────────────────────────────────────────

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   readFile?: (p: string) => string,
 *   now?: () => Date,
 *   logger?: Pick<Console, "log" | "warn" | "error">,
 * }} [deps]
 * @returns {Promise<number>} exit code
 */
export async function main(env, deps = {}) {
  const log = deps.logger ?? console;
  const now = deps.now ?? (() => new Date());
  const cfg = readConfig(env);
  if (!cfg) {
    log.warn(
      "[posthog-release-annotation] POSTHOG_PERSONAL_API_KEY / POSTHOG_PROJECT_ID не виставлені — пропускаю (no-op).",
    );
    return 0;
  }

  const sha = env.GITHUB_SHA || "";
  const ref = env.GITHUB_REF_NAME || "";
  const runId = env.GITHUB_RUN_ID || "";
  const commitMessage = readCommitMessageFromEvent(
    env.GITHUB_EVENT_PATH,
    deps.readFile,
  );
  const content = buildContent({ sha, ref, commitMessage, runId });
  const payload = buildAnnotationPayload({
    content,
    scope: cfg.scope,
    dateMarker: now().toISOString(),
    dashboardItem: env.POSTHOG_DASHBOARD_ITEM,
  });

  if (env.POSTHOG_DRY_RUN === "1") {
    log.log(
      `[posthog-release-annotation] DRY RUN → ${buildAnnotationUrl(cfg)} ${JSON.stringify(payload)}`,
    );
    return 0;
  }

  let result;
  try {
    result = await postAnnotation({
      host: cfg.host,
      projectId: cfg.projectId,
      apiKey: cfg.apiKey,
      payload,
      fetchImpl: deps.fetchImpl,
    });
  } catch (err) {
    log.error(
      `[posthog-release-annotation] HTTP error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }

  if (!result.ok) {
    log.error(
      `[posthog-release-annotation] PostHog responded ${result.status} for ${result.url}: ${result.body.slice(0, 500)}`,
    );
    return 1;
  }

  log.log(
    `[posthog-release-annotation] OK ${result.status} → ${content} (scope=${cfg.scope})`,
  );
  return 0;
}

// ─── CLI bootstrap ────────────────────────────────────────────────────────

const isMain = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (isMain) {
  main(process.env)
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(
        `[posthog-release-annotation] fatal: ${err instanceof Error ? err.stack || err.message : String(err)}`,
      );
      process.exit(1);
    });
}
