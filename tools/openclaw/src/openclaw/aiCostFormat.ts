/**
 * Pure formatter для `/ai_cost` slash-command reply (Telegram HTML).
 *
 * Wire-shape mirrors `apps/server/src/modules/openclaw/aiCostSummary.ts`
 * (`AiCostSummary`); ми redeclar-имо мінімально-необхідну форму, щоб
 * `tools/openclaw` не залежав від `apps/server` (той самий патерн, що
 * `WriteAuditListItem`/`PendingAlertItem`).
 *
 * HTTP-плумбінг — у `handler-info-commands.ts::ai_cost`; тут лише
 * деривація read-only string-у з готового JSON, щоб корнер-кейси
 * (порожні дані, missing-budget, single-day month) тестувались без
 * grammy-бота.
 */

// ─────────────────────────────────────────────────────────────────────────
// Wire types — точне дзеркало server `AiCostSummary` (struct only, no behaviour).
// ─────────────────────────────────────────────────────────────────────────

export interface ModelCostBreakdownItem {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestCount: number;
  estCostUsd: number;
}

export interface PeriodCostSummaryItem {
  startDay: string;
  endDay: string;
  models: ReadonlyArray<ModelCostBreakdownItem>;
  totalCostUsd: number;
  totalTokens: number;
}

export interface EndpointCostRowItem {
  provider: string;
  model: string;
  endpoint: string;
  estCostUsd: number;
}

export interface DailyCostPointItem {
  day: string;
  totalCostUsd: number;
  totalTokens: number;
  requestCount: number;
}

export interface AnthropicTrendBlockItem {
  days: number;
  startDay: string;
  endDay: string;
  points: ReadonlyArray<DailyCostPointItem>;
  totalCostUsd: number;
  totalTokens: number;
}

export interface AiCostSummaryResponse {
  generatedAt: string;
  todayKyiv: string;
  today: PeriodCostSummaryItem;
  week: PeriodCostSummaryItem;
  month: PeriodCostSummaryItem;
  topEndpoints: ReadonlyArray<EndpointCostRowItem>;
  voyage: { cumulativeSinceRestartUsd: number };
  budget: {
    anthropicMonthlyBudgetUsd: number;
    voyageMonthlyBudgetUsd: number;
  };
  projection: {
    avgDailySpendThisMonthUsd: number;
    eomProjectionUsd: number;
    daysElapsedInMonth: number;
    daysInMonth: number;
  };
  trend?: AnthropicTrendBlockItem;
}

// ─────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────

function fmtUsd(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";
  // ≥$0.10 — 2 decimals ($0.75, $50.00), <$0.10 — 4 decimals ($0.0500,
  // $0.0042) щоб дрібні embedding-витрати лишались читабельними.
  if (value >= 0.1) return `$${value.toFixed(2)}`;
  if (value > 0) return `$${value.toFixed(4)}`;
  return "$0.00";
}

function fmtPct(value: number, denominator: number): string {
  if (denominator <= 0) return "—";
  const pct = (value / denominator) * 100;
  if (!Number.isFinite(pct)) return "—";
  if (pct >= 100) return `${Math.round(pct)}%`;
  return `${pct.toFixed(1)}%`;
}

function fmtTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1_000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

// ASCII-render `MM-DD` з ISO `YYYY-MM-DD` (для trend-рядків у reply).
function fmtMonthDay(day: string): string {
  if (typeof day !== "string" || day.length < 10) return day;
  return day.slice(5, 10);
}

// 8-level Unicode block chars. Пустий cell-space беремо як `▁`
// (мінімальний, але видимий) — щоб sparkline не "схлопував" візуальну
// ширину на zero-fill днях.
const SPARK_GLYPHS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

/**
 * Pure-fn sparkline renderer. Нормалізує values→[0..7] за (min..max)
 * range і мапить на SPARK_GLYPHS. Range-based (а не tylko-max),
 * щоб усі 8 рівнів задіювалися рівномірно. Edge cases:
 *   - empty array → "" (caller відповідає за fallback-line).
 *   - всі однакові (включно з нулями) → рядок з N «▁» (візуально "flat").
 *   - одне max + інші нулі → max-точка = █, решта = ▁.
 *   - negative / NaN входи clamp-аться до 0 (в `ai_usage_daily` CHECK
 *     вже відсікає негативні values, але defensive).
 */
export function sparkline(values: ReadonlyArray<number>): string {
  if (values.length === 0) return "";
  const clamped = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  let min = Infinity;
  let max = -Infinity;
  for (const v of clamped) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  if (range === 0) {
    // Всі значення рівні (включно з усіма нулями) — render flat baseline.
    return SPARK_GLYPHS[0]!.repeat(clamped.length);
  }
  const last = SPARK_GLYPHS.length - 1;
  return clamped
    .map((v) => {
      const idx = Math.min(
        last,
        Math.max(0, Math.round(((v - min) / range) * last)),
      );
      return SPARK_GLYPHS[idx]!;
    })
    .join("");
}

/**
 * Render trend-section для Telegram HTML reply. Format:
 *
 *   <b>Trend (Nd, AAAA-AA-AA → AAAA-AA-AA):</b> $X.XX
 *   <code>▁▃▅█▅▃▁</code>
 *     MM-DD $X.XX (Yk tokens, Z req)
 *     ...
 */
function trendSection(trend: AnthropicTrendBlockItem): string[] {
  const lines: string[] = [];
  lines.push(
    `<b>Trend (${trend.days}d, ${trend.startDay} → ${trend.endDay}):</b> ${fmtUsd(trend.totalCostUsd)}`,
  );
  if (trend.points.length === 0) {
    lines.push(`  └ даних немає`);
    return lines;
  }
  const spark = sparkline(trend.points.map((p) => p.totalCostUsd));
  // `<code>` забезпечує monospace у Telegram — вирівнювання sparkline.
  lines.push(`<code>${spark}</code>`);
  for (const p of trend.points) {
    lines.push(
      `  ${fmtMonthDay(p.day)}: ${fmtUsd(p.totalCostUsd)} (${fmtTokens(p.totalTokens)} tokens, ${p.requestCount} req)`,
    );
  }
  return lines;
}

function topModelsLine(period: PeriodCostSummaryItem, max: number = 3): string {
  if (period.models.length === 0) return "—";
  const slice = period.models.slice(0, max);
  return slice.map((m) => `${m.model} ${fmtUsd(m.estCostUsd)}`).join(", ");
}

/**
 * Telegram HTML-reply. Жодних raw `<` / `>` із даних — bucket-name-и
 * приходять із фіксованого `aiPricing.ts` enum, тому injection-risk
 * нульовий. Якщо у майбутньому додамо free-text endpoint-label-и,
 * треба пропустити їх через `escapeHtml`.
 */
export function formatAiCostMarkdown(summary: AiCostSummaryResponse): string {
  const lines: string[] = [];

  lines.push(`<b>AI cost — ${summary.todayKyiv} (Europe/Kyiv)</b>`);
  lines.push("");

  // Today
  lines.push(`<b>Сьогодні:</b> ${fmtUsd(summary.today.totalCostUsd)}`);
  if (summary.today.models.length > 0) {
    lines.push(`  └ ${topModelsLine(summary.today)}`);
    const totalRequests = summary.today.models.reduce(
      (a, m) => a + m.requestCount,
      0,
    );
    lines.push(
      `  └ ${fmtTokens(summary.today.totalTokens)} tokens, ${totalRequests} requests`,
    );
  }

  // Week
  lines.push("");
  lines.push(
    `<b>Цей тиждень (${summary.week.startDay} → ${summary.week.endDay}):</b> ${fmtUsd(summary.week.totalCostUsd)}`,
  );
  if (summary.week.models.length > 0) {
    lines.push(`  └ ${topModelsLine(summary.week)}`);
  }

  // Month + budget
  lines.push("");
  lines.push(
    `<b>Цей місяць (${summary.month.startDay} → ${summary.month.endDay}):</b> ${fmtUsd(summary.month.totalCostUsd)}`,
  );
  if (summary.month.models.length > 0) {
    lines.push(`  └ ${topModelsLine(summary.month)}`);
  }
  const budgetUsd = summary.budget.anthropicMonthlyBudgetUsd;
  if (budgetUsd > 0) {
    lines.push(
      `  └ бюджет Anthropic ${fmtUsd(budgetUsd)} — використано ${fmtPct(summary.month.totalCostUsd, budgetUsd)}`,
    );
  } else {
    lines.push(`  └ <i>ANTHROPIC_MONTHLY_BUDGET_USD не сконфігуровано</i>`);
  }
  lines.push(
    `  └ avg ${fmtUsd(summary.projection.avgDailySpendThisMonthUsd)}/день, EOM-projection ${fmtUsd(summary.projection.eomProjectionUsd)} (${summary.projection.daysElapsedInMonth}/${summary.projection.daysInMonth} днів)`,
  );

  // Top endpoints (Prom counter, since restart)
  lines.push("");
  if (summary.topEndpoints.length === 0) {
    lines.push(`<b>Top endpoints:</b> — (Prom-counter порожній)`);
  } else {
    lines.push(
      `<b>Top-${summary.topEndpoints.length} endpoints</b> (since restart):`,
    );
    for (const row of summary.topEndpoints) {
      lines.push(
        `  • ${row.provider}:${row.endpoint} (${row.model}) — ${fmtUsd(row.estCostUsd)}`,
      );
    }
  }

  // Voyage supplement
  lines.push("");
  if (summary.voyage.cumulativeSinceRestartUsd > 0) {
    const voyageBudget = summary.budget.voyageMonthlyBudgetUsd;
    const voyageLine =
      voyageBudget > 0 ? ` (бюджет ${fmtUsd(voyageBudget)}/міс)` : "";
    lines.push(
      `<b>Voyage embeddings:</b> ${fmtUsd(summary.voyage.cumulativeSinceRestartUsd)} since restart${voyageLine}`,
    );
  } else {
    lines.push(`<b>Voyage embeddings:</b> 0 (з моменту рестарту інстансу)`);
  }

  // Trend (якщо founder викликав `/ai_cost <N>`). Voyage у trend-секцію не
  // входить — ledger не пишеться (PR-12 покрив тільки Anthropic).
  if (summary.trend) {
    lines.push("");
    for (const line of trendSection(summary.trend)) {
      lines.push(line);
    }
    lines.push(
      `  <i>ℹ trend = Anthropic-only (Voyage не пишеться у ai_usage_daily ledger)</i>`,
    );
  }

  return lines.join("\n");
}
