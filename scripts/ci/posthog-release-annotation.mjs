#!/usr/bin/env node
/**
 * Постить release annotation у PostHog після деплою з `main`.
 *
 * AI-CONTEXT: анотація малюється вертикальною лінією поверх УСІХ
 * PostHog-дашбордів (Founder Pulse, FTUX overview, Hub tab perf). Сенс —
 * відповісти на «чому о 14:30 просів DAU / підскочив error rate» одним
 * поглядом на графік, не ходячи звіряти час деплою в GitHub.
 *
 * AI-CONTEXT: цей файл був ОПИСАНИЙ у
 * `docs/03-operations/observability/frontend.md` § Release annotations як
 * наявний, але ніколи не існував — ні в робочому дереві, ні в історії git
 * (перевірено `git log --all --diff-filter=D`). Тому в проєкті 167740 на
 * 2026-08-10 було рівно 0 анотацій. Док описував намір як факт; цей скрипт
 * закриває розрив у бік реалізації.
 *
 * **Fail-open за задумом.** Без `POSTHOG_PERSONAL_API_KEY` скрипт виходить
 * з кодом 0 і друкує причину. Анотація — зручність для тріажу, а не гейт:
 * якщо секрет не заведений (або протух), це не привід червонити `main`
 * після кожного мерджу. Реальні помилки API теж не валять збірку —
 * логуються як `::warning`.
 *
 * Використання:
 *   node scripts/ci/posthog-release-annotation.mjs
 *   node scripts/ci/posthog-release-annotation.mjs --dry-run
 *
 * Env:
 *   POSTHOG_PERSONAL_API_KEY  (secret, обовʼязковий для реального постингу)
 *   POSTHOG_PROJECT_ID        (дефолт 167740 — sergeant-prod)
 *   POSTHOG_HOST              (дефолт https://eu.posthog.com)
 *   GITHUB_SHA / GITHUB_RUN_ID / GITHUB_REF_NAME  (виставляє Actions)
 */

import { execFileSync } from "node:child_process";

const DEFAULT_HOST = "https://eu.posthog.com";
const DEFAULT_PROJECT_ID = "167740";

/** Максимальна довжина `content` — PostHog ріже довші, краще вкоротити самим. */
const MAX_CONTENT = 400;

const dryRun = process.argv.includes("--dry-run");

function readSubject(sha) {
  // `%s` — тільки перший рядок commit-меседжу. Тіло не потрібне: анотація
  // має бути читабельною в тултипі графіка, а не повним описом PR.
  try {
    return execFileSync("git", ["log", "-1", "--pretty=%s", sha], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

function buildContent({ sha, branch, subject, runId }) {
  const shortSha = sha ? sha.slice(0, 7) : "unknown";
  const parts = [`Release ${shortSha}`];
  if (branch) parts[0] += ` (${branch})`;
  if (subject) parts.push(subject);
  const tail = runId ? ` [run #${runId}]` : "";
  const base = parts.join(": ");
  const room = MAX_CONTENT - tail.length;
  return (base.length > room ? `${base.slice(0, room - 1)}…` : base) + tail;
}

async function main() {
  const apiKey = process.env["POSTHOG_PERSONAL_API_KEY"];
  const projectId = process.env["POSTHOG_PROJECT_ID"] || DEFAULT_PROJECT_ID;
  const host = (process.env["POSTHOG_HOST"] || DEFAULT_HOST).replace(
    /\/+$/,
    "",
  );
  const sha = process.env["GITHUB_SHA"] || "";
  const branch = process.env["GITHUB_REF_NAME"] || "";
  const runId = process.env["GITHUB_RUN_ID"] || "";

  const content = buildContent({
    sha,
    branch,
    subject: readSubject(sha || "HEAD"),
    runId,
  });

  // `date_marker` — момент деплою. Беремо час запуску скрипта: він іде
  // одразу після успішного деплою, тож похибка — секунди.
  const payload = {
    content,
    scope: "project",
    date_marker: new Date().toISOString(),
  };

  const url = `${host}/api/projects/${projectId}/annotations/`;

  if (dryRun) {
    console.log("[dry-run] POST", url);
    console.log("[dry-run] payload:", JSON.stringify(payload, null, 2));
    console.log(
      apiKey
        ? "[dry-run] POSTHOG_PERSONAL_API_KEY присутній."
        : "[dry-run] POSTHOG_PERSONAL_API_KEY ВІДСУТНІЙ — реальний запуск був би skip.",
    );
    return;
  }

  if (!apiKey) {
    // Fail-open — див. AI-CONTEXT угорі.
    console.log(
      "POSTHOG_PERSONAL_API_KEY не заданий — анотацію пропущено. " +
        "Заведи секрет у Settings → Secrets → Actions, щоб вмикнути.",
    );
    return;
  }

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.log(`::warning::PostHog annotation request failed: ${error}`);
    return;
  }

  if (!response.ok) {
    // Тіло відповіді може містити echo нашого payload, але НЕ токен —
    // він живе тільки в заголовку, який ми не логуємо.
    const body = await response.text().catch(() => "<no body>");
    console.log(
      `::warning::PostHog annotation rejected (HTTP ${response.status}): ${body.slice(0, 500)}`,
    );
    return;
  }

  console.log(`✅ PostHog annotation posted: ${content}`);
}

await main();
