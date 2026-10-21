/**
 * Markdown-звіт стенду.
 *
 * AI-DANGER: секція «Повний текст» — не косметика й не опція форматування.
 * У попередній ітерації евристичні судді помилилися ШІСТЬ разів в обидва
 * боки: зарахували шкідливу пораду (модель поставила підписки 340 грн/міс
 * поперед боргу 42 000 під 32% річних) і завалили правильну поведінку
 * (модель зробила `query_transactions` перед видаленням, а суддя чекав
 * відсутності виклику). Без сирого тексту цифрам у таблицях вірити не можна.
 * Не «оптимізуй» цю секцію в обрізаний sample.
 */

import {
  SESSION_LENGTHS,
  priceFor,
  sessionCostNoCache,
  sessionCostWithCache,
  splitPrefixTokens,
} from "./cost.js";
import type { Candidate, Pipeline, RunResult } from "./types.js";

function fmtCost(v: number | null): string {
  if (v == null) return "?";
  return `$${(v * 1000).toFixed(4)}/1k`;
}

function candidateKey(r: RunResult): string {
  return `${r.candidate.label}\u0000${r.candidate.model}`;
}

/**
 * AI-CONTEXT (B47): транспортна помилка (мережа, HTTP 401/429, timeout) — це
 * «модель не відповіла», не «модель відповіла неправильно». До цього фікса
 * `passed = rows.filter((r) => r.passedJudge).length` рахувався проти ВСІХ
 * рядків, тож 6 HTTP-401 у зоровому звіті рендерились як `0/6` — «модель
 * провалила всі пастки». Зі знаменника точності транспортні провали
 * виключено; їх рахує окрема колонка, щоб читач не сплутав «не відповіла» з
 * «відповіла погано».
 */
function summarySection(results: RunResult[]): string[] {
  const lines = [
    "## Підсумок по кандидатах",
    "",
    "| Кандидат | Модель | Пройшло | Не відповіли (транспорт) | Голос | Медіанна затримка (мс) | Сер. вартість |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  // Медіана, не середнє: один 35-секундний reasoning-викид інакше сховав би
  // кандидата, швидкого на всіх інших кейсах.
  const byCandidate = new Map<string, RunResult[]>();
  for (const r of results) {
    const bucket = byCandidate.get(candidateKey(r));
    if (bucket) bucket.push(r);
    else byCandidate.set(candidateKey(r), [r]);
  }
  for (const rows of byCandidate.values()) {
    const first = rows[0];
    if (!first) continue;
    const transportFailed = rows.filter((r) => r.transportFailed);
    const answered = rows.filter((r) => !r.transportFailed);
    const passed = answered.filter((r) => r.passedJudge).length;
    const passedCell = answered.length ? `${passed}/${answered.length}` : "—";
    const sorted = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const costs = rows
      .map((r) => r.costUsd)
      .filter((c): c is number => c != null);
    const avgCost = costs.length
      ? costs.reduce((a, b) => a + b, 0) / costs.length
      : null;
    const voiced = rows.filter((r) => r.voiceFails !== null);
    const voiceCell = voiced.length
      ? `${voiced.filter((r) => r.voiceFails?.length === 0).length}/${voiced.length}`
      : "—";
    lines.push(
      `| ${first.candidate.label} | \`${first.candidate.model}\` | ${passedCell} | ${transportFailed.length}/${rows.length} | ${voiceCell} | ${mid} | ${fmtCost(avgCost)} |`,
    );
  }
  return lines;
}

function detailSection(results: RunResult[]): string[] {
  const lines = [
    "",
    "## По кейсах",
    "",
    "| Пайплайн | Кейс | Кандидат | Модель | OK | Суддя | Голос | Затримка (мс) | In | Out | Cache read | Вартість |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of results) {
    const voiceCell =
      r.voiceFails === null
        ? "—"
        : r.voiceFails.length === 0
          ? "✅"
          : `❌ ${r.voiceFails.join(", ")}`;
    // Транспортний провал (B47) дублювати як «❌» у колонці судді — брехня:
    // модель не відповідала, а не відповіла неправильно. Колонка OK уже несе
    // цей факт; тут — власна позначка, щоб порожня колонка судді не
    // прочиталась як «модель провалила пастку».
    const judgeCell = r.transportFailed
      ? `⚠️ транспорт${r.error ? ` — ${r.error}` : ""}`
      : r.passedJudge
        ? "✅"
        : `❌${r.judgeReason ? ` ${r.judgeReason}` : ""}`;
    lines.push(
      `| ${r.pipeline} | ${r.caseName} | ${r.candidate.label} | \`${r.candidate.model}\` | ${r.ok ? "✅" : "❌"} | ${judgeCell} | ${voiceCell} | ${r.latencyMs} | ${r.inputTokens ?? "?"} | ${r.outputTokens ?? "?"} | ${r.cacheReadTokens ?? "—"} | ${fmtCost(r.costUsd)} |`,
    );
  }
  return lines;
}

/**
 * Розбіжність із базовою моделлю = інший вердикт судді, інший стан голосу
 * або інший факт успіху виклику. Плюс завжди друкуємо провали судді —
 * саме там евристика найчастіше й помиляється.
 */
function divergences(results: RunResult[]): RunResult[] {
  const baselineByCase = new Map<string, RunResult>();
  for (const r of results) {
    const key = `${r.pipeline}\u0000${r.caseName}`;
    if (!baselineByCase.has(key)) baselineByCase.set(key, r);
  }
  const out: RunResult[] = [];
  for (const r of results) {
    const key = `${r.pipeline}\u0000${r.caseName}`;
    const baseline = baselineByCase.get(key);
    const diverged =
      baseline !== undefined &&
      baseline !== r &&
      (baseline.passedJudge !== r.passedJudge ||
        baseline.ok !== r.ok ||
        (baseline.voiceFails ?? []).join(",") !==
          (r.voiceFails ?? []).join(","));
    if (diverged || !r.passedJudge) out.push(r);
  }
  return out;
}

/**
 * Довжина markdown-огорожі для сирого тексту моделі має ПЕРЕВИЩУВАТИ
 * найдовший ряд бектиків усередині самого тексту.
 *
 * AI-DANGER: моделі часто повертають відповідь, уже обгорнуту власним
 * ```json-блоком. Фіксована трибектикова огорожа навколо такого тексту
 * ламається за CommonMark: рядок-закривач ВБУДОВАНОГО блоку (голий "```",
 * без інфо-рядка) закриває і ЗОВНІШНЮ огорожу теж — вона зникає раніше, ніж
 * мала. Наступний голий "```" (той, яким ця функція хотіла закрити зовнішню
 * огорожу сама) читається вже не як закривач, а як НОВИЙ відкривач — і все,
 * що йде далі (включно з `<details>` для базової моделі), провалюється
 * всередину цього небажаного блока. Prettier це навіть «підтверджує»,
 * піднімаючи зовнішню огорожу до 4 бектиків при форматуванні — але сам факт
 * підйому доводить, що джерело вже породило колізію. Побачено живцем у
 * закоміченому `vision-eval-2026-08-25.md` (рядки 112, 157, 205, 242, 279,
 * 316, 353, 388, 425, 460, 517, 568 — усюди, де відповідь моделі мала
 * власний код-блок).
 *
 * Фікс — не «закрити рівно один раз» (огорожа й так закривається рівно
 * один раз у коді), а зробити довжину огорожі гарантовано БІЛЬШОЮ за
 * будь-який ряд бектиків усередині вмісту, як і радить CommonMark для
 * вкладених блоків.
 */
function codeFence(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const maxRun = runs.reduce((max, run) => Math.max(max, run.length), 0);
  return "`".repeat(Math.max(3, maxRun + 1));
}

function fullTextSection(results: RunResult[]): string[] {
  const diverged = divergences(results);
  const lines = [
    "",
    "## Повний текст (розбіжності з базовою моделлю та провали судді)",
    "",
    "Евристичний суддя не ухвалює рішення — він звужує, що читати очима.",
    "Нижче сирі відповіді ЦІЛКОМ, без обрізання.",
    "",
  ];
  if (diverged.length === 0) {
    lines.push("_Розбіжностей і провалів судді немає._");
    return lines;
  }
  const seenBaselines = new Set<string>();
  for (const r of diverged) {
    const key = `${r.pipeline}\u0000${r.caseName}`;
    const baseline = results.find(
      (x) => `${x.pipeline}\u0000${x.caseName}` === key,
    );
    lines.push(
      `### ${r.pipeline} / ${r.caseName} — ${r.candidate.label} (\`${r.candidate.model}\`)`,
      "",
      `**Пастка:** ${r.trap}`,
      "",
      `**Суддя:** ${
        r.transportFailed
          ? "⚠️ транспорт — модель не відповіла"
          : r.passedJudge
            ? "✅ пройшов"
            : `❌ провалив${r.judgeReason ? ` — ${r.judgeReason}` : ""}`
      }${
        r.voiceFails?.length ? ` · голос: ❌ ${r.voiceFails.join(", ")}` : ""
      }${r.error ? ` · помилка: ${r.error}` : ""}`,
      "",
      `${codeFence(r.text)}text`,
      r.text || "(порожня відповідь)",
      codeFence(r.text),
      "",
    );
    if (baseline && baseline !== r && !seenBaselines.has(key)) {
      seenBaselines.add(key);
      lines.push(
        `<details><summary>Базова модель для порівняння — ${baseline.candidate.label}</summary>`,
        "",
        `${codeFence(baseline.text)}text`,
        baseline.text || "(порожня відповідь)",
        codeFence(baseline.text),
        "",
        "</details>",
        "",
      );
    }
  }
  return lines;
}

/**
 * Вартість сесії по N = 1, 3, 5, 10, 20. Друга колонка порожня там, де
 * кешу немає за побудовою (одноразові фонові задачі на кшталт
 * `internal/mcc-batch` — прод не ставить там `cache_control`).
 */
function costSection(results: RunResult[], pipelines: Pipeline[]): string[] {
  const lines = [
    "",
    "## Вартість: без кешу і з кешем",
    "",
    "Формула кешу — `2 + 0.1·(N−1)` на стабільний префікс при TTL=1h;",
    "обґрунтування живе у `src/modules/chat/promptCache.ts` (§ TTL).",
    "Колонка «з кешем» — ПРОЄКЦІЯ: сам стенд шле `system` без `cache_control`,",
    "тож `Cache read` у таблиці вище буде 0. Порожньо там, де прод кешу не",
    "ставить взагалі.",
    "",
    `| Пайплайн | Кандидат | Модель | ${SESSION_LENGTHS.map((n) => `N=${n}`).join(" | ")} |`,
    `| --- | --- | --- | ${SESSION_LENGTHS.map(() => "---").join(" | ")} |`,
  ];

  const byKey = new Map<string, RunResult[]>();
  for (const r of results) {
    if (!r.ok || r.inputTokens == null || r.outputTokens == null) continue;
    const key = `${r.pipeline}\u0000${candidateKey(r)}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(r);
    else byKey.set(key, [r]);
  }

  for (const rows of byKey.values()) {
    const first = rows[0];
    if (!first) continue;
    const pipeline = pipelines.find((p) => p.key === first.pipeline);
    const price = priceFor(first.candidate.model);
    if (!pipeline || !price) continue;

    const avg = (pick: (r: RunResult) => number): number =>
      rows.reduce((sum, r) => sum + pick(r), 0) / rows.length;
    const inputTokens = avg((r) => r.inputTokens ?? 0);
    const outputTokens = avg((r) => r.outputTokens ?? 0);
    // Довжину user-репліки беремо з першого кейса — пайплайн має один
    // system, а кейси різняться лише реплікою.
    const sampleUser = pipeline.cases[0]?.user ?? "";
    const { prefixTokens, freshTokens } = splitPrefixTokens(
      inputTokens,
      pipeline.system ?? "",
      sampleUser,
    );

    const cells = SESSION_LENGTHS.map((messages) => {
      const input = {
        prefixTokens,
        freshTokens,
        outputTokens,
        price,
        messages,
      };
      const plain = sessionCostNoCache(input);
      if (!pipeline.cacheable) return `$${plain.toFixed(5)} / —`;
      const cached = sessionCostWithCache(input);
      return `$${plain.toFixed(5)} / $${cached.toFixed(5)}`;
    });

    lines.push(
      `| ${first.pipeline} | ${first.candidate.label} | \`${first.candidate.model}\` | ${cells.join(" | ")} |`,
    );
  }
  return lines;
}

function promptSection(pipelines: Pipeline[]): string[] {
  const lines = [
    "",
    "## Промпти (джерело)",
    "",
    "| Пайплайн | Продовий білдер | system | Кейсів |",
    "| --- | --- | --- | --- |",
  ];
  for (const p of pipelines) {
    lines.push(
      `| ${p.key} | \`${p.promptOrigin}\` | ${
        p.system === undefined
          ? "— (прод шле все user-реплікою)"
          : `${p.system.length} симв.`
      } | ${p.cases.length} |`,
    );
  }
  return lines;
}

/**
 * Кандидати, відсіяні через `--skip-unavailable`.
 *
 * Друкуються ОКРЕМИМ блоком угорі звіту, а не мовчки зникають: саме мовчазне
 * зникнення (у вигляді заглушки) і дало B44, коли «0/18» читалось як провал
 * моделі, якої не викликали. Пропущений кандидат має бути видно.
 */
function skippedSection(skipped: Candidate[]): string[] {
  if (skipped.length === 0) return [];
  return [
    "> **Відсіяно за `--skip-unavailable`.** Ці кандидати НЕ прогонялись —",
    "> для їхнього провайдера немає ключа. Це не результат і не нуль:",
    "> їх просто немає в таблицях нижче.",
    ">",
    ...skipped.map(
      (c) => `> - \`${c.model}\` — ${c.label} (provider=${c.provider})`,
    ),
    "",
  ];
}

export function toMarkdown(
  results: RunResult[],
  pipelines: Pipeline[],
  generatedAt: string,
  skipped: Candidate[] = [],
): string {
  const dry = results.filter((row) => row.executionMode === "dry-run");
  if (dry.length > 0) {
    if (dry.length !== results.length) {
      throw new Error(
        "Cannot mix dry-run and live model results in one benchmark",
      );
    }
    return [
      "<!-- AUTO-GENERATED FILE. Generator: apps/server/scripts/eval/report.ts. -->",
      "# Перевірка стенду моделей",
      "",
      "**DRY RUN — моделі не викликались.**",
      "",
      `Згенеровано: ${generatedAt}`,
      "",
      "Це перевірка підготовки викликів через StubProvider. Якість, затримка й",
      "вартість кандидатів тут не вимірюються; порівнювати їх за цим звітом не можна.",
      "",
      "| Пайплайн | Кейс | Оголошений кандидат |",
      "| --- | --- | --- |",
      ...dry.map(
        (row) =>
          `| ${row.pipeline} | ${row.caseName} | \`${row.candidate.model}\` |`,
      ),
      ...promptSection(pipelines),
      "",
    ].join("\n");
  }
  return [
    "<!-- AUTO-GENERATED FILE. Do not edit by hand. Generator: `pnpm --filter @sergeant/server eval:models` / `eval:vision` (apps/server/scripts/eval/report.ts). -->",
    "",
    "# Звіт стенду моделей",
    "",
    `Згенеровано: ${generatedAt}`,
    "",
    "Кожен пайплайн подає моделі ТОЙ САМИЙ системний промпт, що й прод —",
    "імпортом з продового білдера, не копією (таблиця «Промпти» нижче).",
    "Судді бувають структурні (проганяють відповідь через прод-парсер —",
    "їм можна вірити) і евристичні (лише звужують, що читати очима).",
    "Рішення ухвалюється читанням секції «Повний текст», не колонкою «Суддя».",
    "",
    ...skippedSection(skipped),
    ...summarySection(results),
    ...costSection(results, pipelines),
    ...detailSection(results),
    ...fullTextSection(results),
    ...promptSection(pipelines),
    "",
  ].join("\n");
}
