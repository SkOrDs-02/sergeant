#!/usr/bin/env node
// scripts/rag-eval-weekly.mjs
//
// Weekly cron-wrapper навколо `scripts/eval-rag-recall.mjs`. Робить 3 кроки:
//
//   1. Запускає eval CLI з `--output=<tmp>.json`. Mode за замовч. — `mock`
//      (sanity gate-machinery); n8n WF-28 може override-нути через CLI
//      argument `--mode=simulate --simulate-recall=0.45`, щоб локально
//      проганяти drill.
//   2. Якщо передано `--baseline=<path>` — CLI сам додасть
//      `baselineComparison` у summary. Цей wrapper не дублює логіку.
//   3. POST-ить summary JSON на `${API_BASE_URL}/api/internal/eval/rag-weekly`
//      з `Authorization: Bearer ${INTERNAL_API_KEY}`. Server:
//        - INSERT-ить у `n8n_failure_events`
//        - SET-ить Prom-gauge-и
//        - captureMessage у Sentry якщо `status != "pass"`
//        - auto-flip-ить kill-switch `mono_ai_memory_ingest` якщо `kill`
//
// Exit codes (mirror eval CLI):
//   0 — pass + endpoint OK
//   1 — warn + endpoint OK
//   2 — kill + endpoint OK
//   3 — env / eval / endpoint hard-fail
//
// Чому окремий wrapper, а не inline у n8n HTTP-node:
//   - Eval має output до Step Summary (locally / GH Action), яку n8n
//     HTTP-node не вміє.
//   - Endpoint-call retry-логіка ізольована від eval-логіки (eval бігає
//     ZE раз, endpoint може мати network-blip).
//   - Тестабельність — `node --test scripts/__tests__/rag-eval-weekly.test.mjs`
//     ганяє той самий код, що і cron, без n8n.
//
// Викликати:
//   pnpm eval:rag:weekly                       # mock + POST localhost
//   API_BASE_URL=https://api.sergeant.app \\
//     INTERNAL_API_KEY=xxx \\
//     pnpm eval:rag:weekly --mode=mock          # production
//
// Reaction playbook: `docs/observability/runbook.md` §
// «RagQualityGateDegraded» / «RagQualityGateKillSwitch».

import { spawn } from "node:child_process";
import { readFile, unlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EVAL_SCRIPT = join(__dirname, "eval-rag-recall.mjs");

const DEFAULT_API_BASE = "http://127.0.0.1:3000";
const ENDPOINT_PATH = "/api/internal/eval/rag-weekly";

/**
 * @typedef {Object} WrapperOptions
 * @property {string} apiBaseUrl
 * @property {string} internalApiKey
 * @property {string[]} evalArgs   args to forward to eval-rag-recall.mjs
 * @property {boolean} skipPost     якщо true — не postить (для local-debug)
 * @property {number}  postTimeoutMs
 * @property {number}  postRetries
 */

/**
 * Парсить CLI-аргументи wrapper-а. Все, що не починається з `--api-base-url=`,
 * `--internal-api-key=`, `--skip-post`, `--post-timeout-ms=`, `--post-retries=` —
 * передається eval CLI без змін.
 */
export function parseWrapperArgs(argv) {
  const opts = {
    apiBaseUrl: process.env.API_BASE_URL ?? DEFAULT_API_BASE,
    internalApiKey: process.env.INTERNAL_API_KEY ?? "",
    evalArgs: [],
    skipPost: false,
    postTimeoutMs: 10_000,
    postRetries: 2,
  };
  for (const arg of argv) {
    if (arg.startsWith("--api-base-url=")) {
      opts.apiBaseUrl = arg.slice("--api-base-url=".length);
    } else if (arg.startsWith("--internal-api-key=")) {
      opts.internalApiKey = arg.slice("--internal-api-key=".length);
    } else if (arg === "--skip-post") {
      opts.skipPost = true;
    } else if (arg.startsWith("--post-timeout-ms=")) {
      opts.postTimeoutMs = Number(arg.slice("--post-timeout-ms=".length));
      if (!Number.isFinite(opts.postTimeoutMs) || opts.postTimeoutMs <= 0) {
        throw new Error(`Invalid --post-timeout-ms: ${arg}`);
      }
    } else if (arg.startsWith("--post-retries=")) {
      opts.postRetries = Number(arg.slice("--post-retries=".length));
      if (
        !Number.isInteger(opts.postRetries) ||
        opts.postRetries < 0 ||
        opts.postRetries > 10
      ) {
        throw new Error(`Invalid --post-retries: ${arg}`);
      }
    } else {
      opts.evalArgs.push(arg);
    }
  }
  return opts;
}

/**
 * Запускає eval CLI, повертає {summary, exitCode}. Бросає при I/O чи
 * shape-помилці.
 */
export async function runEval(opts) {
  const tmpDir = await mkdtemp(join(tmpdir(), "rag-eval-weekly-"));
  const outputPath = join(tmpDir, "summary.json");
  const args = [EVAL_SCRIPT, `--output=${outputPath}`, ...opts.evalArgs];

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn("node", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stdout.on("data", () => {});
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      // exit-code 0/1/2 = OK (status signal); 3+ = error
      if (code === null) {
        reject(
          new Error(`eval-rag-recall exited with null code; stderr=${stderr}`),
        );
        return;
      }
      if (code >= 3) {
        reject(
          new Error(
            `eval-rag-recall hard-failed (exit ${code}); stderr=${stderr}`,
          ),
        );
        return;
      }
      resolve(code);
    });
  });

  const raw = await readFile(outputPath, "utf-8");
  let summary;
  try {
    summary = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse eval summary JSON at ${outputPath}: ${err.message}`,
    );
  }

  // Cleanup (best-effort).
  try {
    await unlink(outputPath);
  } catch {
    /* best-effort */
  }

  return { summary, exitCode };
}

/**
 * POST summary на endpoint з retry-loop-ом. Bодин раз на success, інакше
 * throw після виставленої кількості retry-ів.
 */
export async function postSummary(opts, summary, fetchFn = fetch) {
  if (!opts.internalApiKey) {
    throw new Error(
      "INTERNAL_API_KEY not set (env or --internal-api-key=) — cannot POST.",
    );
  }
  const url = `${opts.apiBaseUrl.replace(/\/+$/, "")}${ENDPOINT_PATH}`;
  const body = JSON.stringify(summary);

  let lastErr;
  for (let attempt = 0; attempt <= opts.postRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.postTimeoutMs);
    try {
      const res = await fetchFn(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.internalApiKey}`,
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.status >= 200 && res.status < 300) {
        const json = await res.json().catch(() => ({}));
        return {
          ok: true,
          status: res.status,
          body: json,
          attempts: attempt + 1,
        };
      }
      lastErr = new Error(`endpoint returned non-2xx (status=${res.status})`);
    } catch (err) {
      clearTimeout(timer);
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
    // Exponential backoff (200, 400, 800ms) до повторного attempt.
    if (attempt < opts.postRetries) {
      await new Promise((resolve) =>
        setTimeout(resolve, 200 * Math.pow(2, attempt)),
      );
    }
  }
  throw lastErr ?? new Error("POST failed (no error captured)");
}

/**
 * Orchestrator: run eval → POST → exit зі статусом. Експортовано для
 * `node --test` без `process.exit` посеред CI.
 */
export async function runWrapper(
  argv,
  { fetchFn = fetch, logger = console } = {},
) {
  const opts = parseWrapperArgs(argv);
  const { summary, exitCode } = await runEval(opts);

  logger.log(
    `[rag-eval-weekly] status=${summary.status} ` +
      `mode=${summary.mode} ` +
      `recall@${summary.topK}=${summary.metrics.recallAtK.mean.toFixed(3)} ` +
      `p@1=${summary.metrics.precisionAt1.mean.toFixed(3)} ` +
      `mrr=${summary.metrics.mrr.mean.toFixed(3)}`,
  );

  if (opts.skipPost) {
    logger.log("[rag-eval-weekly] --skip-post → not posting; exiting.");
    return { summary, exitCode, postResult: null };
  }

  const postResult = await postSummary(opts, summary, fetchFn);
  logger.log(
    `[rag-eval-weekly] POST OK: recordId=${postResult.body.recordId} ` +
      `killSwitchActivated=${postResult.body.killSwitchActivated} ` +
      `attempts=${postResult.attempts}`,
  );

  return { summary, exitCode, postResult };
}

// CLI entrypoint: run when invoked directly (not imported).
const isMainModule =
  process.argv[1] && process.argv[1].endsWith("rag-eval-weekly.mjs");

if (isMainModule) {
  runWrapper(process.argv.slice(2))
    .then(({ exitCode }) => {
      process.exit(exitCode);
    })
    .catch((err) => {
      console.error(`[rag-eval-weekly] ERROR: ${err.message}`);
      process.exit(3);
    });
}
