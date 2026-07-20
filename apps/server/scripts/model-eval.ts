#!/usr/bin/env node
/**
 * `pnpm eval:models` — model-routing re-benchmark harness.
 *
 * Context. `getLLMProvider()` (`src/lib/llm/provider.ts`) already lets every
 * pipeline swap models via env without a code change (see `docs/90-work/
 * planning/specs/model-routing-benchmark-pro-tier.md`). What was missing was
 * a repeatable way to compare candidate models on quality × cost × latency
 * across pipelines before flipping the env default in production.
 *
 * What this script does. For each pipeline below it sends a small golden
 * prompt to every candidate model through the SAME `getLLMProvider()` +
 * `invokeLLM()` path production code uses (no separate HTTP client), records
 * latency + token usage, runs a cheap heuristic pass/fail check, estimates
 * cost from the token-price table, and prints + writes a markdown table.
 *
 * Golden-set scope (v1, intentionally small — see spec § Ризики). Each
 * pipeline gets ONE representative prompt and a pass/fail heuristic, not a
 * full eval suite with human-rated quality scoring. This proves the harness
 * mechanism and benchmarks TODAY's known-good models; treat pass/fail as a
 * smoke signal, not a quality verdict — read the raw `text` column for that.
 *
 * Adding a new candidate WITHOUT a code change:
 *   pnpm eval:models -- --extra=digest:openrouter:some/new-model-id:short-label
 * (repeat --extra for multiple). Verify the model id against the live
 * OpenRouter catalog first — see spec § Ризики "OpenRouter model-id дрейф".
 *
 * Modes:
 *   pnpm eval:models                  # uses whatever ANTHROPIC_API_KEY /
 *                                      # OPENROUTER_API_KEY are in .env; with
 *                                      # neither set, getLLMProvider()
 *                                      # fail-softs to StubProvider (safe,
 *                                      # $0, proves the harness plumbing).
 *   pnpm eval:models -- --dry-run     # force StubProvider for every call —
 *                                      # explicit no-network / no-cost mode
 *                                      # (CI / sandboxed dev).
 *   pnpm eval:models -- --pipeline=digest,coach   # filter to a subset.
 *   pnpm eval:models -- --out=docs/90-work/planning/model-eval-2026-08-01.md
 *
 * Exit codes: 0 always (this is a report tool, not a gate) unless argument
 * parsing fails (1).
 */

import { parseArgs } from "node:util";
import process from "node:process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getLLMProvider,
  invokeLLM,
  type LLMProviderName,
} from "../src/lib/llm/provider.js";
import { env } from "../src/env/env.js";

interface Candidate {
  provider: Extract<LLMProviderName, "anthropic" | "openrouter">;
  model: string;
  label: string;
}

interface Pipeline {
  key: string;
  label: string;
  system: string;
  user: string;
  maxTokens: number;
  candidates: Candidate[];
  /** Cheap pass/fail smoke check — NOT a quality score. */
  judge: (text: string) => boolean;
}

const nonEmptyUk = (text: string): boolean =>
  text.trim().length > 3 && /[Ѐ-ӿ]/.test(text);

const oneOf = (options: string[]) => (text: string) =>
  options.includes(
    text
      .trim()
      .toLowerCase()
      .replace(/[."'\s]/g, ""),
  );

// Model-eval 2026-07 defaults — today's known-good models already wired
// through env.ts. Extend via --extra rather than hardcoding tomorrow's
// unverified OpenRouter ids here (see file-header note).
const PIPELINES: Pipeline[] = [
  {
    key: "classify",
    label: "Finyk classify (cheap-router)",
    system:
      "Класифікуй повідомлення користувача в одну з категорій: chat, tool_use, question. Відповідай ЛИШЕ одним словом, без пунктуації.",
    user: "Онови мій бюджет на харчування до 5000 грн цього місяця.",
    maxTokens: 10,
    judge: oneOf(["chat", "tool_use", "question"]),
    candidates: [
      {
        provider: "anthropic",
        model: env.CLASSIFY_MODEL,
        label: "current default (Anthropic)",
      },
      {
        provider: "openrouter",
        model: "google/gemini-2.5-flash-lite",
        label: "OpenRouter Gemini Flash Lite",
      },
    ],
  },
  {
    key: "digest",
    label: "Weekly-digest AI-commentary",
    system:
      "Ти фінансовий аналітик. Дай короткий коментар (1-2 речення) українською до наведених даних тижня.",
    user: "Витрати: 4500 грн (+12% до попереднього тижня). Дохід: 25000 грн.",
    maxTokens: 150,
    judge: nonEmptyUk,
    candidates: [
      {
        provider: "anthropic",
        model: env.DIGEST_MODEL,
        label: "current default (Anthropic)",
      },
      {
        provider: "openrouter",
        model: "google/gemini-2.5-flash-lite",
        label: "OpenRouter Gemini Flash Lite",
      },
    ],
  },
  {
    key: "chat",
    label: "Chat tool-result synthesis",
    system:
      "Ти персональний фінансовий помічник. Дай коротку пораду (1 речення) українською на основі підсумку.",
    user: "Транзакція: кава 120 грн, категорія «їжа поза домом», це 8-ма кава цього тижня.",
    maxTokens: 150,
    judge: nonEmptyUk,
    candidates: [
      {
        provider: "anthropic",
        model: env.CHAT_MODEL_SYNTHESIS,
        label: "current default (premium tier)",
      },
      {
        provider: "anthropic",
        model: env.AI_PRO_STANDARD_CHAT_MODEL,
        label: "current standard tier",
      },
      {
        provider: "anthropic",
        model: env.AI_PRO_FLOOR_CHAT_MODEL,
        label: "current floor tier",
      },
    ],
  },
  {
    key: "coach",
    label: "Coach proactive daily insight",
    system:
      "Ти персональний AI-коуч. Сформулюй ОДНЕ коротке проактивне повідомлення дня (2-3 речення) українською, тепло але конкретно.",
    user: "Цього тижня: 3 тренування (звичайно 4), витрати на 15% нижчі за середні, 2 звички виконано з 3.",
    maxTokens: 300,
    judge: nonEmptyUk,
    candidates: [
      {
        provider: "openrouter",
        model: env.OPENROUTER_COACH_MODEL,
        label: "current default (OpenRouter premium)",
      },
      {
        provider: "openrouter",
        model: env.AI_PRO_STANDARD_COACH_MODEL,
        label: "current standard tier",
      },
    ],
  },
  {
    key: "nutrition",
    label: "Nutrition day-hint",
    system:
      "Ти нутриціолог-помічник. Запропонуй одну коротку пораду щодо харчування українською (1-2 речення).",
    user: "Сьогодні: 1800 ккал, білка 60г. Ціль: 2200 ккал, 120г білка.",
    maxTokens: 150,
    judge: nonEmptyUk,
    candidates: [
      {
        provider: "anthropic",
        model: env.NUTRITION_MODEL,
        label: "current default (Anthropic)",
      },
      {
        provider: "openrouter",
        model: "google/gemini-2.5-flash-lite",
        label: "OpenRouter Gemini Flash Lite",
      },
    ],
  },
  {
    key: "mono",
    label: "Mono/Finyk MCC batch-enrichment",
    system:
      "Класифікуй категорію транзакції за описом. Відповідай ОДНИМ словом: groceries, transport, dining, other.",
    user: "Опис: Сільпо, MCC 5411.",
    maxTokens: 10,
    judge: oneOf(["groceries", "transport", "dining", "other"]),
    candidates: [
      {
        provider: "anthropic",
        model: env.MONO_ENRICHMENT_MODEL,
        label: "current default (Anthropic)",
      },
      {
        provider: "openrouter",
        model: "google/gemini-2.5-flash-lite",
        label: "OpenRouter Gemini Flash Lite",
      },
    ],
  },
];

// USD / 1M tokens (input, output). Point-in-time snapshot — reverify against
// provider pricing pages before trusting cost columns; unknown model ids
// fall back to `null` (cost column prints "?").
const PRICE_PER_1M: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "google/gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "openai/gpt-5.1": { input: 1.25, output: 10 },
  // OpenRouter candidates priced from the live catalog (2026-07-20). Reverify
  // before trusting — provider prices drift. Thinking models (kimi*, glm-5*,
  // qwen3.7*) returned empty content at these pipelines' small token budgets,
  // so their cost is academic here; kept for reference only.
  "google/gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
  "deepseek/deepseek-v3.2": { input: 0.269, output: 0.4 },
  "deepseek/deepseek-v4-flash": { input: 0.098, output: 0.196 },
  "z-ai/glm-4.7-flash": { input: 0.061, output: 0.4 },
  "z-ai/glm-5.2": { input: 0.974, output: 3.062 },
  "qwen/qwen3.5-flash-02-23": { input: 0.07, output: 0.26 },
  "qwen/qwen3.7-plus": { input: 0.32, output: 1.28 },
  "moonshotai/kimi-k2.6": { input: 0.684, output: 3.42 },
  "moonshotai/kimi-k3": { input: 3, output: 15 },
};

interface RunResult {
  pipeline: string;
  candidate: Candidate;
  ok: boolean;
  passedJudge: boolean;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  text: string;
  error?: string;
}

function estimateCost(
  model: string,
  inputTokens: number | null,
  outputTokens: number | null,
): number | null {
  const price = PRICE_PER_1M[model];
  if (!price || inputTokens == null || outputTokens == null) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

async function runOne(
  pipeline: Pipeline,
  candidate: Candidate,
  dryRun: boolean,
): Promise<RunResult> {
  const provider = getLLMProvider({
    provider: dryRun ? "stub" : candidate.provider,
    stubResponse: { text: "stub" },
  });
  const t0 = Date.now();
  const result = await invokeLLM(provider, {
    model: candidate.model,
    system: pipeline.system,
    messages: [{ role: "user", content: pipeline.user }],
    maxTokens: pipeline.maxTokens,
    endpoint: `internal/model-eval/${pipeline.key}`,
    timeoutMs: 30_000,
  });
  const latencyMs = Date.now() - t0;

  if (!result.ok) {
    return {
      pipeline: pipeline.key,
      candidate,
      ok: false,
      passedJudge: false,
      latencyMs,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      text: "",
      error: `${result.code ?? "error"}: ${result.error}`,
    };
  }

  const inputTokens = result.usage?.inputTokens ?? null;
  const outputTokens = result.usage?.outputTokens ?? null;
  return {
    pipeline: pipeline.key,
    candidate,
    ok: true,
    passedJudge: pipeline.judge(result.text),
    latencyMs,
    inputTokens,
    outputTokens,
    costUsd: estimateCost(candidate.model, inputTokens, outputTokens),
    text: result.text.replace(/\n/g, " ").slice(0, 80),
  };
}

function fmtCost(v: number | null): string {
  if (v == null) return "?";
  return `$${(v * 1000).toFixed(4)}/1k`;
}

function toMarkdown(results: RunResult[], generatedAt: string): string {
  const lines: string[] = [
    "# Model-eval report",
    "",
    `Generated: ${generatedAt}`,
    "",
    "Pass/fail is a cheap heuristic smoke-check per pipeline, not a human-rated",
    "quality score — read the `sample` column and re-run with real traffic",
    "before trusting a candidate blindly. Cost is estimated from a point-in-time",
    "price table in `model-eval.ts` — reverify before committing to a swap.",
    "",
    "| Pipeline | Candidate | Provider | Model | OK | Judge | Latency (ms) | In tok | Out tok | Est. cost | Sample |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of results) {
    lines.push(
      `| ${r.pipeline} | ${r.candidate.label} | ${r.candidate.provider} | \`${r.candidate.model}\` | ${r.ok ? "✅" : "❌"} | ${r.passedJudge ? "✅" : "❌"} | ${r.latencyMs} | ${r.inputTokens ?? "?"} | ${r.outputTokens ?? "?"} | ${fmtCost(r.costUsd)} | ${r.error ?? r.text} |`,
    );
  }
  return lines.join("\n") + "\n";
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      pipeline: { type: "string" },
      out: { type: "string" },
      extra: { type: "string", multiple: true, default: [] },
    },
  });

  const filter = values.pipeline
    ? new Set(values.pipeline.split(",").map((s) => s.trim()))
    : null;
  const pipelines = filter
    ? PIPELINES.filter((p) => filter.has(p.key))
    : PIPELINES;

  for (const raw of values.extra ?? []) {
    const [key, provider, model, label] = raw.split(":");
    const pipeline = pipelines.find((p) => p.key === key);
    if (
      !pipeline ||
      (provider !== "anthropic" && provider !== "openrouter") ||
      !model
    ) {
      console.error(
        `Ignoring malformed --extra="${raw}" (expected pipeline:provider:model[:label])`,
      );
      continue;
    }
    pipeline.candidates.push({
      provider,
      model,
      label: label ?? "extra candidate",
    });
  }

  const results: RunResult[] = [];
  for (const pipeline of pipelines) {
    for (const candidate of pipeline.candidates) {
      results.push(
        await runOne(pipeline, candidate, values["dry-run"] === true),
      );
    }
  }

  const generatedAt = new Date().toISOString();
  const markdown = toMarkdown(results, generatedAt);
  console.log(markdown);

  // `scripts/` sits at apps/server/scripts — three levels below the repo
  // root. Resolve output paths against the repo root (not cwd, which pnpm
  // sets to apps/server) so `--out=docs/...` matches the usage examples.
  const repoRoot = resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "../../..",
  );
  const outPath =
    values.out ??
    `docs/90-work/planning/model-eval-${generatedAt.slice(0, 10)}.md`;
  const absOutPath = resolve(repoRoot, outPath);
  mkdirSync(dirname(absOutPath), { recursive: true });
  writeFileSync(absOutPath, markdown, "utf-8");
  console.log(`\nWritten to ${absOutPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
