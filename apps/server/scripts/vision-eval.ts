#!/usr/bin/env node
/**
 * `pnpm eval:vision` — зоровий стенд для `analyze-photo` і `refine-photo`
 * (спека `docs/90-work/planning/specs/ai-eval-harness-v2.md` § Зорові шляхи).
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
 *   pnpm eval:vision -- --out=docs/90-work/planning/vision-eval-2026-08-04.md
 *
 * Код виходу: 0 завжди (це звіт, не гейт), 1 — помилка розбору аргументів.
 */

import { parseArgs } from "node:util";
import process from "node:process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "./eval/cost.js";
import { toMarkdown } from "./eval/report.js";
import {
  VISION_PIPELINES,
  filterByModality,
  runVisionOne,
  type ModalityFilter,
} from "./eval/vision.js";
import type { RunResult } from "./eval/types.js";

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
    const [key, provider, model, label] = raw.split(":");
    const pipeline = pipelines.find((p) => p.key === key);
    if (!pipeline || provider !== "openrouter" || !model) {
      console.error(
        `Ignoring malformed --extra="${raw}" (expected pipeline:openrouter:model[:label])`,
      );
      continue;
    }
    pipeline.candidates.push({ provider, model, label: label ?? model });
  }

  const dryRun = values["dry-run"] === true;
  const repeats = Math.max(1, Number(values.repeat ?? 1) || 1);
  if (!dryRun) await loadCatalog();

  const dropped: ModalityFilter["dropped"] = [];
  const results: RunResult[] = [];
  for (const pipeline of pipelines) {
    const modality = filterByModality(pipeline.candidates, {
      enforce: !dryRun,
    });
    for (const d of modality.dropped) {
      if (!dropped.some((x) => x.candidate.model === d.candidate.model)) {
        dropped.push(d);
      }
    }
    for (const goldenCase of pipeline.cases) {
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
  const markdown = [
    toMarkdown(results, pipelines, generatedAt),
    ...modalitySection(dropped, !dryRun),
    "",
    "## Про зображення",
    "",
    "Голден-сет намальовано програмно (`scripts/eval/vision-images.ts`):",
    "плоскі заливки, диски й растровий шрифт 3×5, не фотографії. Тому судді",
    "міряють структуру відповіді (прод-нормалізатор), прочитаний текст",
    "етикетки і стриманість на порожньому кадрі — а не впізнавання страв.",
    "",
  ].join("\n");
  console.log(markdown);

  const repoRoot = resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "../../..",
  );
  const outPath =
    values.out ??
    `docs/90-work/planning/vision-eval-${generatedAt.slice(0, 10)}.md`;
  const absOutPath = resolve(repoRoot, outPath);
  mkdirSync(dirname(absOutPath), { recursive: true });
  writeFileSync(absOutPath, markdown, "utf-8");
  console.log(`\nWritten to ${absOutPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
