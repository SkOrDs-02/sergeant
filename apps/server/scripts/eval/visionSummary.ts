/**
 * Зведення зорового стенду по прод-шляхах (чек, виписка, фото їжі).
 *
 * Загальний `report.ts` рахує по пайплайнах і кейсах; рішення ж «лишити
 * модель чи перейти» приймається по шляху, і для нього потрібні числа, яких
 * там немає: вигадки на пастках окремо від інших провалів, 429 окремо від
 * інших відмов (і ті 429, що проковтнув ретрай `anthropicMessages`), бите
 * JSON, обрізання на `max_tokens`, фактичний `usage.cost` і постачальник.
 */

import type { RunResult } from "./types.js";

const PATH_LABEL: Record<string, string> = {
  receipt: "Скан чека",
  statement: "Імпорт скриншота виписки",
  food: "Фото їжі (analyze + refine)",
};

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  );
  return sorted[Math.max(0, idx)] ?? null;
}

function modelKey(r: RunResult): string {
  return r.candidate.reasoning
    ? `${r.candidate.model} (${r.candidate.reasoning})`
    : r.candidate.model;
}

export interface PathStats {
  path: string;
  model: string;
  calls: number;
  answered: number;
  passed: number;
  abstainAnswered: number;
  fabricated: number;
  final429: number;
  /** 402 «бракує кредитів» — стан рахунку, не модель і не постачальник. */
  final402: number;
  finalOther: number;
  retried429: number;
  brokenJson: number;
  truncated: number;
  p50: number | null;
  p95: number | null;
  meanCostUsd: number | null;
  servedBy: string;
}

export function pathStats(results: RunResult[]): PathStats[] {
  const groups = new Map<string, RunResult[]>();
  for (const r of results) {
    const key = `${r.path ?? r.pipeline}\u0000${modelKey(r)}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const out: PathStats[] = [];
  for (const [key, rows] of groups) {
    const [path = "", model = ""] = key.split("\u0000");
    const answered = rows.filter((r) => !r.transportFailed);
    const lat = answered.map((r) => r.latencyMs).sort((a, b) => a - b);
    const costs = answered
      .map((r) => r.gatewayCostUsd)
      .filter((c): c is number => typeof c === "number");
    const providers = new Map<string, number>();
    for (const r of answered) {
      const p = r.servedBy ?? "—";
      providers.set(p, (providers.get(p) ?? 0) + 1);
    }
    const failed = rows.filter((r) => r.transportFailed);
    out.push({
      path,
      model,
      calls: rows.length,
      answered: answered.length,
      passed: answered.filter((r) => r.passedJudge).length,
      abstainAnswered: answered.filter((r) => r.abstain).length,
      fabricated: answered.filter((r) => r.fabricated).length,
      final429: failed.filter((r) => r.finalStatus === 429).length,
      final402: failed.filter((r) => r.finalStatus === 402).length,
      finalOther: failed.filter(
        (r) => r.finalStatus !== 429 && r.finalStatus !== 402,
      ).length,
      retried429: answered.reduce(
        (n, r) => n + (r.attemptStatuses ?? []).filter((s) => s === 429).length,
        0,
      ),
      brokenJson: answered.filter((r) => r.brokenJson).length,
      truncated: answered.filter((r) => r.stopReason === "max_tokens").length,
      p50: percentile(lat, 50),
      p95: percentile(lat, 95),
      meanCostUsd:
        costs.length > 0
          ? costs.reduce((a, b) => a + b, 0) / costs.length
          : null,
      servedBy: [...providers.entries()]
        .map(([p, n]) => `${p} ${n}`)
        .join(", "),
    });
  }
  return out;
}

const fmtMs = (v: number | null) => (v === null ? "—" : String(Math.round(v)));
const fmtUsd = (v: number | null) => (v === null ? "—" : `$${v.toFixed(6)}`);

export function pathSummaryMarkdown(
  results: RunResult[],
  baselineFor: (path: string) => string,
): string[] {
  const stats = pathStats(results);
  const lines = [
    "",
    "## Зведення по прод-шляхах",
    "",
    "Пройдено — з тих, що відповіли. Вигадки — на кейсах-пастках «чесно відмовитись» (у дужках скільки таких відповідей). 429 і інші відмови — фінальні, після ретраїв `anthropicMessages`; «429 у ретраях» — проковтнуті ретраєм у відповідях, що дійшли. Вартість — середній `usage.cost` на виклик; ×база — відносно бази шляху (за замовчуванням чинний прод-дефолт), назва бази — у підзаголовку.",
    "",
  ];
  for (const path of ["receipt", "statement", "food"]) {
    const rows = stats.filter((s) => s.path === path);
    if (rows.length === 0) continue;
    const baselineModel = baselineFor(path);
    // Ключ рядка несе глибину в дужках («openai/gpt-6-luna (none)»), тож
    // базу шукаємо за самим id моделі.
    const base =
      rows.find((r) => r.model.split(" ")[0] === baselineModel)?.meanCostUsd ??
      null;
    lines.push(
      `### ${PATH_LABEL[path] ?? path}`,
      "",
      `База: \`${baselineModel}\`.`,
      "",
      "| Модель | Пройдено | Вигадки | 429 | 402 (кредит) | Інші відмови | 429 у ретраях | Бите JSON | Обрізано | p50 / p95, мс | `usage.cost` | ×база | Постачальник |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    );
    for (const s of rows) {
      const ratio =
        base && s.meanCostUsd !== null
          ? `×${(s.meanCostUsd / base).toFixed(2)}`
          : "—";
      lines.push(
        `| \`${s.model}\` | ${s.passed}/${s.answered} | ${s.fabricated} (з ${s.abstainAnswered}) | ${s.final429} | ${s.final402} | ${s.finalOther} | ${s.retried429} | ${s.brokenJson} | ${s.truncated} | ${fmtMs(s.p50)} / ${fmtMs(s.p95)} | ${fmtUsd(s.meanCostUsd)} | ${ratio} | ${s.servedBy} |`,
      );
    }
    lines.push("");
    lines.push(
      ...caseMatrix(results.filter((r) => (r.path ?? r.pipeline) === path)),
    );
  }
  const spent = results.reduce((s, r) => s + (r.gatewayCostUsd ?? 0), 0);
  lines.push(`Разом \`usage.cost\` цього прогону: $${spent.toFixed(4)}.`, "");
  return lines;
}

function caseMatrix(rows: RunResult[]): string[] {
  const models = [...new Set(rows.map(modelKey))];
  const cases = [...new Set(rows.map((r) => `${r.pipeline}: ${r.caseName}`))];
  const out = [
    `| Кейс | ${models.map((m) => `\`${m}\``).join(" | ")} |`,
    `| --- | ${models.map(() => "---").join(" | ")} |`,
  ];
  for (const c of cases) {
    const cells = models.map((m) => {
      const rs = rows.filter(
        (r) => `${r.pipeline}: ${r.caseName}` === c && modelKey(r) === m,
      );
      const answered = rs.filter((r) => !r.transportFailed);
      const passed = answered.filter((r) => r.passedJudge).length;
      const lost = rs.length - answered.length;
      return `${passed}/${answered.length}${lost ? ` (+${lost} відм.)` : ""}`;
    });
    out.push(`| ${c} | ${cells.join(" | ")} |`);
  }
  out.push("");
  return out;
}
