#!/usr/bin/env node
/**
 * `pnpm eval:models` — стенд порівняння моделей по AI-шляхах застосунку.
 *
 * Що змінилось у v2 (спека `docs/work/specs/ai-eval-harness-v2.md`):
 *
 *  * **Реальні промпти.** Кожен пайплайн імпортує системний промпт із
 *    продового білдера (`buildCategorizePrompt`, `buildWeeklyDigestPrompt`,
 *    `buildCoachInsightPrompt`, `buildBatchPrompt`, нутриційні `build*Prompt`,
 *    `SYSTEM_PREFIX`). Копії в стенді немає — саме розходження копії з продом
 *    зробило попередню ітерацію недійсною. Прапорця `--real-system-prompt`
 *    більше немає: реальний промпт — єдиний режим.
 *  * **Пастки перед суддями.** У кожного кейса є поле `trap` — одне речення
 *    про те, що тут означає «неправильно». Воно друкується у звіті поруч із
 *    сирим текстом відповіді.
 *  * **Повний текст обовʼязковий.** Звіт друкує НЕОБРІЗАНУ відповідь для
 *    кожного кейса, де кандидат розійшовся з базовою моделлю або провалив
 *    суддю. Евристичні судді помиляються в обидва боки — цифрам без тексту
 *    вірити не можна.
 *  * **Вартість двома числами** — без кешу і з кешем, по N = 1, 3, 5, 10, 20
 *    повідомлень (`scripts/eval/cost.ts`).
 *  * **Покриття.** Додані `day-plan`, `week-plan`, `shopping-list`,
 *    `recommend-recipes`, `parse-pantry`, `coach-insight`. Зорові шляхи —
 *    окремий стенд `pnpm eval:vision`.
 *
 * Режими:
 *   pnpm eval:models                       # живий прогін (потрібні ключі)
 *   pnpm eval:models -- --dry-run          # StubProvider: без мережі, $0
 *   pnpm eval:models -- --pipeline=digest,mono
 *   pnpm eval:models -- --repeat=3         # мінімум 3 — розкид між
 *                                          # ідентичними прогонами буває
 *                                          # більшим за різницю між моделями
 *   pnpm eval:models -- --extra=digest:openrouter:some/model-id:label
 *   pnpm eval:models -- --extra=coach-insight:openrouter:anthropic/claude-sonnet-5.5:s55-none:none
 *                                          # 5-те поле — reasoning.effort
 *   pnpm eval:models -- --out=docs/work/specs/planning/model-eval-2026-08-04.md
 *   pnpm eval:models -- --provider-prefs='{"quantizations":["fp8","unknown"]}'
 *                                          # додаткові поля `provider` OpenRouter
 *                                          # (quantizations, ignore); deny лишається
 *   pnpm eval:models -- --only-model=z-ai/glm-5.2,deepseek/deepseek-v4-flash
 *                                          # лише кандидати з цими id
 *   pnpm eval:models -- --json-out=/tmp/run.json
 *                                          # сирі рядки (з `servedBy`, `gatewayCostUsd`)
 *
 * Код виходу: 0 завжди (це звіт, не гейт), 1 — помилка розбору аргументів.
 */

import { parseArgs } from "node:util";
import process from "node:process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "./eval/cost.js";
import { PIPELINES } from "./eval/pipelines.js";
import { toMarkdown } from "./eval/report.js";
import { candidateProviderAvailable, runOne } from "./eval/run.js";
import type { Candidate, RunResult } from "./eval/types.js";
import {
  isReasoningEffort,
  REASONING_EFFORTS,
} from "../src/lib/llm/provider.js";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      // Гейт B44 фейлить прогін, коли кандидат резолвиться не у власного
      // провайдера (немає ключа). Це правильно за замовчуванням, але робить
      // неможливим легітимний сценарій «маю лише OpenRouter-ключ, хочу
      // порівняти OpenRouter-моделі». Прапорець ВІДСІВАЄ таких кандидатів і
      // називає їх у звіті — на відміну від мовчазної заглушки, через яку
      // й зʼявився B44: пропущений кандидат видно, підмінений — ні.
      "skip-unavailable": { type: "boolean", default: false },
      pipeline: { type: "string" },
      out: { type: "string" },
      extra: { type: "string", multiple: true, default: [] },
      "max-tokens": { type: "string" },
      repeat: { type: "string" },
      "provider-prefs": { type: "string" },
      "only-model": { type: "string" },
      "json-out": { type: "string" },
    },
  });

  let providerPrefs: Record<string, unknown> | undefined;
  if (values["provider-prefs"]) {
    try {
      const parsed: unknown = JSON.parse(values["provider-prefs"]);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("not an object");
      }
      providerPrefs = parsed as Record<string, unknown>;
    } catch {
      console.error(
        `Invalid --provider-prefs="${values["provider-prefs"]}" (expected JSON object)`,
      );
      process.exitCode = 1;
      return;
    }
  }
  const onlyModels = values["only-model"]
    ? new Set(values["only-model"].split(",").map((s) => s.trim()))
    : null;

  const maxTokensOverride = values["max-tokens"]
    ? Number(values["max-tokens"])
    : null;
  if (maxTokensOverride !== null && !Number.isFinite(maxTokensOverride)) {
    console.error(`Invalid --max-tokens="${values["max-tokens"]}"`);
    process.exitCode = 1;
    return;
  }

  const filter = values.pipeline
    ? new Set(values.pipeline.split(",").map((s) => s.trim()))
    : null;
  const pipelines = filter
    ? PIPELINES.filter((p) => filter.has(p.key))
    : PIPELINES;

  for (const raw of values.extra ?? []) {
    const [key, provider, model, label, effort] = raw.split(":");
    const pipeline = pipelines.find((p) => p.key === key);
    if (
      !pipeline ||
      (provider !== "anthropic" && provider !== "openrouter") ||
      !model ||
      (effort !== undefined && !isReasoningEffort(effort))
    ) {
      console.error(
        `Ignoring malformed --extra="${raw}" (expected pipeline:provider:model[:label[:effort]], effort one of ${REASONING_EFFORTS.join("|")})`,
      );
      continue;
    }
    pipeline.candidates.push({
      provider,
      model,
      label: label ?? "extra candidate",
      ...(effort === undefined ? {} : { reasoning: effort }),
    });
  }

  if (onlyModels) {
    for (const pipeline of pipelines) {
      pipeline.candidates = pipeline.candidates.filter((c) =>
        onlyModels.has(c.model),
      );
    }
  }

  const repeats = Math.max(1, Number(values.repeat ?? 1) || 1);
  const dryRun = values["dry-run"] === true;
  const skipUnavailable = values["skip-unavailable"] === true;
  if (!dryRun) await loadCatalog();

  const skipped: Candidate[] = [];
  if (skipUnavailable && !dryRun) {
    for (const pipeline of pipelines) {
      const available = pipeline.candidates.filter((c) => {
        if (candidateProviderAvailable(c)) return true;
        if (!skipped.some((s) => s.label === c.label && s.model === c.model)) {
          skipped.push(c);
        }
        return false;
      });
      pipeline.candidates = available;
    }
    for (const c of skipped) {
      console.error(
        `[skip-unavailable] пропущено "${c.label}" (\`${c.model}\`, provider=${c.provider}) — ключа немає`,
      );
    }
  }

  const results: RunResult[] = [];
  for (const pipeline of pipelines) {
    if (maxTokensOverride !== null) pipeline.maxTokens = maxTokensOverride;
    for (const goldenCase of pipeline.cases) {
      for (const candidate of pipeline.candidates) {
        // Повтори підряд, а не окремими прогонами: один запуск — одна
        // таблиця, і розкид видно в ній, а не при ручному зведенні звітів.
        for (let i = 0; i < repeats; i += 1) {
          results.push(
            await runOne(
              pipeline,
              goldenCase,
              candidate,
              dryRun,
              providerPrefs,
            ),
          );
        }
      }
    }
  }

  const generatedAt = new Date().toISOString();
  if (values["json-out"]) {
    writeFileSync(
      resolve(values["json-out"]),
      JSON.stringify({ generatedAt, providerPrefs, results }, null, 2),
      "utf-8",
    );
  }
  const markdown = toMarkdown(results, pipelines, generatedAt, skipped);
  console.log(markdown);

  // `scripts/` лежить на apps/server/scripts — три рівні під коренем репо.
  // Резолвимо шляхи виводу від кореня (не від cwd, який pnpm ставить у
  // apps/server), щоб `--out=docs/...` збігався з прикладами вище.
  const repoRoot = resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "../../..",
  );
  const outPath =
    values.out ??
    `docs/work/specs/planning/model-eval-${generatedAt.slice(0, 10)}.md`;
  const absOutPath = resolve(repoRoot, outPath);
  mkdirSync(dirname(absOutPath), { recursive: true });
  writeFileSync(absOutPath, markdown, "utf-8");
  console.log(`\nWritten to ${absOutPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
