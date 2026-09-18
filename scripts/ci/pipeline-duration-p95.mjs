/**
 * CI Pipeline Duration P95 Reporter
 *
 * Fetches the last N successful CI runs from GitHub Actions API,
 * computes p50/p95/p99 duration metrics (total and per-job),
 * compares the current run against the baseline, and outputs
 * a markdown summary for GITHUB_STEP_SUMMARY and PR comments.
 *
 * Environment variables (injected by GitHub Actions):
 *   GITHUB_TOKEN        – repo-scoped token
 *   GITHUB_REPOSITORY   – owner/repo
 *   GITHUB_RUN_ID       – current workflow run id
 *   GITHUB_STEP_SUMMARY – path to write step summary markdown
 *   GITHUB_EVENT_PATH   – path to event payload JSON
 */

// ─── Helpers (exported for unit testing) ──────────────────────────

/**
 * Compute a percentile value from a sorted-ascending numeric array.
 * Uses the "nearest rank" method.
 * @param {number[]} sorted – already sorted ascending
 * @param {number} p – percentile (0–100)
 * @returns {number}
 */
export function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/**
 * Format seconds into "Xm Ys" human-readable string.
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  if (seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

/**
 * Compute deviation percentage of current vs baseline.
 * @param {number} current
 * @param {number} baseline
 * @returns {string} e.g. "+12.3%" or "-4.1%"
 */
export function deviation(current, baseline) {
  if (baseline === 0) return "N/A";
  const pct = ((current - baseline) / baseline) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/**
 * Build an ASCII sparkline from an array of numbers.
 * Uses block characters ▁▂▃▄▅▆▇█ to represent relative values.
 * @param {number[]} values
 * @returns {string}
 */
export function sparkline(values) {
  if (values.length === 0) return "";
  const blocks = "▁▂▃▄▅▆▇█";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((v) => {
      const idx = Math.round(((v - min) / range) * (blocks.length - 1));
      return blocks[idx];
    })
    .join("");
}

/**
 * Compute stats (p50, p95, p99) from an array of durations.
 * @param {number[]} durations – unsorted seconds
 * @returns {{ p50: number, p95: number, p99: number }}
 */
export function computeStats(durations) {
  const sorted = [...durations].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

/**
 * Render the full markdown report.
 * @param {{
 *   totalStats: { p50: number, p95: number, p99: number },
 *   currentTotal: number,
 *   jobStats: Record<string, { p50: number, p95: number, p99: number }>,
 *   currentJobs: Record<string, number>,
 *   recentTotals: number[],
 *   runCount: number,
 * }} data
 * @returns {string}
 */
export function renderMarkdown(data) {
  const {
    totalStats,
    currentTotal,
    jobStats,
    currentJobs,
    recentTotals,
    runCount,
  } = data;
  const lines = [];

  lines.push("<!-- ci-pipeline-duration-summary -->");
  lines.push("## \u23F1\uFE0F CI Pipeline Duration Report");
  lines.push("");
  lines.push(
    `Based on the last **${runCount}** successful runs on the default branch.`,
  );
  lines.push("");

  // Overall summary
  lines.push("### Overall Pipeline");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| p50 | ${formatDuration(totalStats.p50)} |`);
  lines.push(`| p95 | ${formatDuration(totalStats.p95)} |`);
  lines.push(`| p99 | ${formatDuration(totalStats.p99)} |`);
  lines.push(`| **Current run** | **${formatDuration(currentTotal)}** |`);
  lines.push(`| vs p95 | ${deviation(currentTotal, totalStats.p95)} |`);
  lines.push("");

  // Trend sparkline (last 7 days of data)
  if (recentTotals.length > 1) {
    lines.push(
      `**Trend (last ${recentTotals.length} runs):** \`${sparkline(recentTotals)}\``,
    );
    lines.push("");
  }

  // Per-job breakdown
  const jobNames = Object.keys(jobStats).sort();
  if (jobNames.length > 0) {
    lines.push("### Per-Job Breakdown");
    lines.push("");
    lines.push("| Job | p50 | p95 | p99 | Current | vs p95 |");
    lines.push("|-----|-----|-----|-----|---------|--------|");
    for (const name of jobNames) {
      const stats = jobStats[name];
      const cur = currentJobs[name];
      const curStr = cur != null ? formatDuration(cur) : "—";
      const devStr = cur != null ? deviation(cur, stats.p95) : "—";
      lines.push(
        `| ${name} | ${formatDuration(stats.p50)} | ${formatDuration(stats.p95)} | ${formatDuration(stats.p99)} | ${curStr} | ${devStr} |`,
      );
    }
    lines.push("");
  }

  // Threshold warning
  if (currentTotal > totalStats.p95 * 1.2) {
    lines.push(
      `> \u26A0\uFE0F **Warning:** Current run (${formatDuration(currentTotal)}) exceeds p95 + 20% threshold (${formatDuration(totalStats.p95 * 1.2)}). Consider reviewing slow jobs.`,
    );
    lines.push("");
  }

  return lines.join("\n");
}

// ─── GitHub API helpers ───────────────────────────────────────────

/**
 * Fetch JSON from the GitHub API with pagination support.
 * @param {string} url
 * @param {string} token
 * @returns {Promise<any>}
 */
async function ghFetch(url, token) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${res.statusText} — ${url}`);
  }
  return res.json();
}

/**
 * Fetch the last N successful workflow runs for the default branch.
 * @param {string} repo – owner/repo
 * @param {string} workflowFile – e.g. "ci.yml"
 * @param {string} token
 * @param {number} count
 * @returns {Promise<Array<{ id: number, created_at: string, updated_at: string, run_started_at: string }>>}
 */
export async function fetchWorkflowRuns(repo, workflowFile, token, count = 50) {
  const perPage = Math.min(count, 100);
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${workflowFile}/runs?status=success&branch=main&per_page=${perPage}`;
  const data = await ghFetch(url, token);
  return (data.workflow_runs || []).slice(0, count);
}

/**
 * Fetch jobs for a specific run.
 * @param {string} repo
 * @param {number} runId
 * @param {string} token
 * @returns {Promise<Array<{ name: string, started_at: string, completed_at: string, status: string, conclusion: string }>>}
 */
export async function fetchRunJobs(repo, runId, token) {
  const url = `https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs?per_page=100`;
  const data = await ghFetch(url, token);
  return data.jobs || [];
}

/**
 * Compute duration in seconds from two ISO timestamps.
 * @param {string} start
 * @param {string} end
 * @returns {number}
 */
export function durationSeconds(start, end) {
  return (new Date(end).getTime() - new Date(start).getTime()) / 1000;
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const currentRunId = process.env.GITHUB_RUN_ID;
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;

  if (!token || !repo || !currentRunId) {
    console.error(
      "Missing required env vars: GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID",
    );
    process.exit(1);
  }

  const SAMPLE_SIZE = 50;

  console.log(`Fetching last ${SAMPLE_SIZE} successful runs for ${repo}…`);

  // Fetch historical runs
  const runs = await fetchWorkflowRuns(repo, "ci.yml", token, SAMPLE_SIZE);
  if (runs.length === 0) {
    console.log("No historical runs found. Skipping report.");
    return;
  }

  console.log(`Found ${runs.length} historical runs. Fetching job data…`);

  // Compute total durations for historical runs
  const totalDurations = [];
  /** @type {Record<string, number[]>} */
  const jobDurations = {};

  for (const run of runs) {
    const runDur = durationSeconds(
      run.run_started_at || run.created_at,
      run.updated_at,
    );
    totalDurations.push(runDur);

    const jobs = await fetchRunJobs(repo, run.id, token);
    for (const job of jobs) {
      if (!job.started_at || !job.completed_at) continue;
      const name = job.name;
      if (!jobDurations[name]) jobDurations[name] = [];
      jobDurations[name].push(
        durationSeconds(job.started_at, job.completed_at),
      );
    }
  }

  // Fetch current run data
  console.log(`Fetching current run ${currentRunId}…`);
  const currentRunData = await ghFetch(
    `https://api.github.com/repos/${repo}/actions/runs/${currentRunId}`,
    token,
  );
  const currentTotal = durationSeconds(
    currentRunData.run_started_at || currentRunData.created_at,
    currentRunData.updated_at,
  );

  const currentJobsRaw = await fetchRunJobs(repo, Number(currentRunId), token);
  /** @type {Record<string, number>} */
  const currentJobs = {};
  for (const job of currentJobsRaw) {
    if (job.started_at && job.completed_at) {
      currentJobs[job.name] = durationSeconds(job.started_at, job.completed_at);
    }
  }

  // Compute stats
  const totalStats = computeStats(totalDurations);
  /** @type {Record<string, { p50: number, p95: number, p99: number }>} */
  const jobStats = {};
  for (const [name, durations] of Object.entries(jobDurations)) {
    jobStats[name] = computeStats(durations);
  }

  // Recent totals for sparkline (last 20 runs in chronological order)
  const recentTotals = totalDurations.slice(0, 20).reverse();

  const markdown = renderMarkdown({
    totalStats,
    currentTotal,
    jobStats,
    currentJobs,
    recentTotals,
    runCount: runs.length,
  });

  // Write to GITHUB_STEP_SUMMARY
  if (summaryPath) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(summaryPath, markdown + "\n");
    console.log("Written to GITHUB_STEP_SUMMARY.");
  }

  // Output for downstream steps
  console.log("\n" + markdown);

  // Output as action output for the PR comment step
  const { appendFileSync: appendFile } = await import("node:fs");
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    const delimiter = `EOF_${Date.now()}`;
    appendFile(
      outputPath,
      `markdown<<${delimiter}\n${markdown}\n${delimiter}\n`,
    );
  }
}

// Only run main when executed directly (not imported for testing).
const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
