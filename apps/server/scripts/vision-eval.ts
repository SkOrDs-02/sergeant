#!/usr/bin/env node
/**
 * `pnpm eval:vision` — зоровий стенд для `analyze-photo`, `refine-photo`,
 * скану чека (`receipt-scan`) та імпорту скриншота виписки
 * (`statement-import`) (спека `docs/work/specs/ai-eval-harness-v2.md`
 * § Зорові шляхи). Транспорт — продовий `/messages` (`visionProdTransport.ts`).
 *
 * Чому окремо від `eval:models`: інший вхід (зображення), інші кандидати —
 * не кожна модель приймає картинки, тож список фільтрується за
 * `input_modalities` з живого каталогу OpenRouter, а не вгадується.
 *
 * Звіт — той самий `scripts/eval/report.ts`, що й у текстового стенду, разом
 * із обовʼязковою секцією повного тексту для розбіжностей із базовою моделлю.
 *
 * Режими:
 *   pnpm eval:vision                    # живий прогін (потрібні ключі)
 *   pnpm eval:vision -- --dry-run       # без мережі і без каталогу, $0
 *   pnpm eval:vision -- --pipeline=refine-photo
 *   pnpm eval:vision -- --repeat=3      # мінімум 3 у живому прогоні
 *   pnpm eval:vision -- --out=docs/work/specs/planning/vision-eval-2026-08-04.md
 *   pnpm eval:vision -- --extra=analyze-photo:openrouter:openai/gpt-6-luna:luna-none:none
 *                                       # 5-те поле — глибина; на `/messages` `none`
 *                                       # стає `thinking: {type: "disabled"}`
 *   pnpm eval:vision -- --extra='*:openrouter:google/gemini-3.7-flash:g37'
 *                                       # `*` — кандидат у кожен обраний пайплайн
 *   pnpm eval:vision -- --only-model=google/gemini-2.5-flash-lite,openai/gpt-6-luna
 *   pnpm eval:vision -- --json-out=/tmp/vision.json
 *                                       # сирі рядки (з `servedBy`, `gatewayCostUsd`)
 *   pnpm eval:vision -- --case=кавʼярня  # лише кейси з підрядком у назві
 *   pnpm eval:vision -- --rejudge=/tmp/a.json,/tmp/b.json
 *                                       # звіт зі збережених `--json-out` поточними
 *                                       # суддями, без мережі
 *   pnpm eval:vision -- --baseline=google/gemini-2.5-flash-lite
 *                                       # база для колонки «×база» у зведенні
 *
 * Код виходу: 0 завжди (це звіт, не гейт), 1 — помилка розбору аргументів.
 */

import { parseArgs } from "node:util";
import process from "node:process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "./eval/cost.js";
import { toMarkdown } from "./eval/report.js";
import {
  VISION_PIPELINES,
  filterByModality,
  rejudgeVisionResult,
  runVisionOne,
  type ModalityFilter,
} from "./eval/vision.js";
import type { RunResult } from "./eval/types.js";
import { pathSummaryMarkdown } from "./eval/visionSummary.js";
import { isReasoningEffort } from "../src/lib/llm/provider.js";

function modalitySection(
  dropped: ModalityFilter["dropped"],
  enforced: boolean,
): string[] {
  const lines = ["", "## Фільтр модальностей", ""];
  if (!enforced) {
    lines.push(
      "_Каталог OpenRouter не завантажувався (`--dry-run`) — фільтр не застосовано._",
    );
    return lines;
  }
  if (dropped.length === 0) {
    lines.push("_Усі кандидати приймають зображення._");
    return lines;
  }
  lines.push(
    "Відсіяні до прогону за `input_modalities` — це НЕ провал кейса:",
    "",
    "| Кандидат | Модель | Причина |",
    "| --- | --- | --- |",
  );
  for (const d of dropped) {
    lines.push(
      `| ${d.candidate.label} | \`${d.candidate.model}\` | ${d.reason} |`,
    );
  }
  return lines;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      pipeline: { type: "string" },
      out: { type: "string" },
      extra: { type: "string", multiple: true, default: [] },
      repeat: { type: "string" },
      "only-model": { type: "string" },
      "json-out": { type: "string" },
      baseline: { type: "string" },
      case: { type: "string" },
      rejudge: { type: "string" },
    },
  });

  const filter = values.pipeline
    ? new Set(values.pipeline.split(",").map((s) => s.trim()))
    : null;
  const pipelines = filter
    ? VISION_PIPELINES.filter((p) => filter.has(p.key))
    : VISION_PIPELINES;
  if (pipelines.length === 0) {
    console.error(`Unknown --pipeline="${values.pipeline ?? ""}"`);
    process.exitCode = 1;
    return;
  }

  // `--extra=pipeline:provider:model[:label]` — той самий контракт, що в
  // `model-eval.ts`. Без нього зоровий стенд можна було перевірити лише на
  // вшитій трійці кандидатів, і кожен новий кандидат вимагав правки коду.
  for (const raw of values.extra ?? []) {
    const [key, provider, model, label, effort] = raw.split(":");
    const targets =
      key === "*" ? pipelines : pipelines.filter((p) => p.key === key);
    if (
      targets.length === 0 ||
      provider !== "openrouter" ||
      !model ||
      (effort !== undefined && !isReasoningEffort(effort))
    ) {
      console.error(
        `Ignoring malformed --extra="${raw}" (expected pipeline:openrouter:model[:label[:effort]])`,
      );
      continue;
    }
    for (const pipeline of targets) {
      pipeline.candidates.push({
        provider,
        model,
        label: label ?? model,
        ...(effort === undefined ? {} : { reasoning: effort }),
      });
    }
  }

  if (values["only-model"]) {
    const only = new Set(values["only-model"].split(",").map((s) => s.trim()));
    for (const pipeline of pipelines) {
      pipeline.candidates = pipeline.candidates.filter((c) =>
        only.has(c.model),
      );
    }
  }

  // `--rejudge=a.json,b.json`: звіт зі збережених прогонів поточними
  // суддями, без мережі (правка судді не вимагає платного повтору).
  const rejudgeFiles = values.rejudge?.split(",").map((s) => s.trim()) ?? [];
  const dryRun = values["dry-run"] === true || rejudgeFiles.length > 0;
  const repeats = Math.max(1, Number(values.repeat ?? 1) || 1);
  if (!dryRun) await loadCatalog();

  const dropped: ModalityFilter["dropped"] = [];
  const results: RunResult[] = [];
  const onlyModels = values["only-model"]
    ? new Set(values["only-model"].split(",").map((s) => s.trim()))
    : null;
  for (const file of rejudgeFiles) {
    const saved = JSON.parse(readFileSync(resolve(file), "utf-8")) as {
      results: RunResult[];
    };
    for (const r of saved.results) {
      if (onlyModels && !onlyModels.has(r.candidate.model)) continue;
      if (!pipelines.some((p) => p.key === r.pipeline)) continue;
      const rejudged = rejudgeVisionResult(r);
      if (rejudged) results.push(rejudged);
    }
  }
  for (const pipeline of rejudgeFiles.length > 0 ? [] : pipelines) {
    const modality = filterByModality(pipeline.candidates, {
      enforce: !dryRun,
    });
    for (const d of modality.dropped) {
      if (!dropped.some((x) => x.candidate.model === d.candidate.model)) {
        dropped.push(d);
      }
    }
    const caseFilter = values.case?.toLowerCase();
    const cases = caseFilter
      ? pipeline.cases.filter((c) => c.name.toLowerCase().includes(caseFilter))
      : pipeline.cases;
    for (const goldenCase of cases) {
      for (const candidate of modality.kept) {
        for (let i = 0; i < repeats; i += 1) {
          results.push(
            await runVisionOne(pipeline, goldenCase, candidate, dryRun),
          );
        }
      }
    }
  }

  const generatedAt = new Date().toISOString();
  if (values["json-out"]) {
    writeFileSync(
      resolve(values["json-out"]),
      JSON.stringify({ generatedAt, results }, null, 2),
      "utf-8",
    );
  }
  const markdown = [
    toMarkdown(results, pipelines, generatedAt),
    ...pathSummaryMarkdown(
      results,
      values.baseline ?? "google/gemini-2.5-flash-lite",
    ),
    ...modalitySection(dropped, !dryRun),
    "",
    "## Про зображення",
    "",
    "Кадри їжі намальовано програмно (`scripts/eval/vision-images.ts`):",
    "плоскі заливки, диски й растровий шрифт 3×5, не фотографії. Тому судді",
    "міряють структуру відповіді (прод-нормалізатор), прочитаний текст",
    "етикетки і стриманість на порожньому кадрі — а не впізнавання страв.",
    "",
    "Чеки й виписки — синтетичні HTML-рендери (`scripts/eval/render-vision-docs.ts`,",
    "дані й істина в `scripts/eval/visionDocs.data.ts`, файли в",
    "`src/__fixtures__/vision-eval/`): рівний шрифт, без бліків і зминань,",
    "тож вони простіші за справжнє фото з каси (крім кейса «погане фото»).",
    "",
  ].join("\n");
  console.log(markdown);

  const repoRoot = resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "../../..",
  );
  const outPath =
    values.out ??
    `docs/work/specs/planning/vision-eval-${generatedAt.slice(0, 10)}.md`;
  const absOutPath = resolve(repoRoot, outPath);
  mkdirSync(dirname(absOutPath), { recursive: true });
  writeFileSync(absOutPath, markdown, "utf-8");
  console.log(`\nWritten to ${absOutPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
