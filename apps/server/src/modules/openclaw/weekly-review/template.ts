/**
 * O3 (Phase 2.B) — pure markdown-формат тижневого ритуалу. Без I/O і без
 * `process.env` читань: усі дані приходять через `WeeklyReviewData`,
 * який збирає `builder.ts`. Цей файл — єдиний source-of-truth для того,
 * як weekly review виглядає у founder-DM-і.
 *
 * Дизайн:
 *   - 5 секцій у фіксованому порядку (narrative / shipped / metrics /
 *     open commitments / alerts) — narrative першою, бо це найважливіше
 *     для скимання у Telegram.
 *   - Кожна секція з даними має 3 modes: `not_configured` / partial /
 *     full — mirrors morning-briefing pattern.
 *   - Markdown — Telegram MarkdownV2 light-subset (`*bold*`, `_italic_`,
 *     [link](url)).
 *   - Жодних emoji у user-input — лише фіксовані header-emoji.
 *
 * Тестується unit-ами у `template.test.ts`.
 */

import type {
  WeeklyAlertsSection,
  WeeklyMetricsSection,
  WeeklyNarrativeSection,
  WeeklyOpenCommitmentsSection,
  WeeklyReviewData,
  WeeklyShippedSection,
} from "./types.js";

/**
 * Головний entrypoint — `data` → markdown.
 */
export function buildWeeklyReview(data: WeeklyReviewData): string {
  const lines: string[] = [];
  lines.push(formatHeader(data));
  lines.push("");
  lines.push(...formatNarrativeSection(data.narrative));
  lines.push("");
  lines.push(...formatShippedSection(data.shipped));
  lines.push("");
  lines.push(...formatMetricsSection(data.metrics));
  lines.push("");
  lines.push(...formatOpenCommitmentsSection(data.openCommitments));
  lines.push("");
  lines.push(...formatAlertsSection(data.alerts));
  return lines.join("\n").trimEnd() + "\n";
}

function formatHeader(data: WeeklyReviewData): string {
  return `📅 *Тижневий ритуал — ${data.windowStart} … ${data.windowEnd}*`;
}

function formatNarrativeSection(s: WeeklyNarrativeSection): string[] {
  const lines: string[] = ["*🎯 Пріоритети на наступний тиждень*"];
  lines.push(s.text.trim());
  if (s.source === "template") {
    lines.push("_(шаблонний summary; LLM-pass недоступний)_");
  }
  return lines;
}

function formatShippedSection(s: WeeklyShippedSection): string[] {
  const lines: string[] = ["*🚢 Shipped*"];
  if (s.notConfigured) {
    lines.push(
      "- _GitHub-доступу немає (OPENCLAW_GITHUB_REPO або token не сконфігуровані); дані недоступні._",
    );
    return lines;
  }
  const merged = s.mergedCount ?? 0;
  const closed = s.closedCount ?? 0;
  lines.push(`- Merged за тиждень: ${merged}`);
  lines.push(`- Closed (без merge): ${closed}`);
  if (s.topMerged && s.topMerged.length > 0) {
    lines.push("- Топ:");
    for (const pr of s.topMerged) {
      const author = pr.author ? ` · @${pr.author}` : "";
      lines.push(`  - [#${pr.number}](${pr.url}) ${pr.title}${author}`);
    }
  }
  if (s.note) lines.push(`- ${s.note}`);
  return lines;
}

function formatMetricsSection(s: WeeklyMetricsSection): string[] {
  const lines: string[] = ["*📊 Метрики (тиждень vs попередній)*"];
  if (s.notConfigured) {
    lines.push("- _STRIPE_SECRET_KEY не сконфігурований; дані недоступні._");
    return lines;
  }
  const succThis = s.successCountThis ?? 0;
  const succPrev = s.successCountPrev ?? 0;
  const succDelta = formatDelta(succThis, succPrev);
  lines.push(`- Платежі: ${succThis} (${succDelta} vs попередній)`);

  const grossThis = s.grossUahThis;
  const grossPrev = s.grossUahPrev;
  if (typeof grossThis === "number" && typeof grossPrev === "number") {
    lines.push(
      `- Gross revenue: ${formatUah(grossThis)} (${formatDelta(grossThis, grossPrev)})`,
    );
  } else if (typeof grossThis === "number") {
    lines.push(`- Gross revenue: ${formatUah(grossThis)}`);
  } else {
    lines.push("- Gross revenue: _не виміряно_");
  }
  if (s.note) lines.push(`- ${s.note}`);
  return lines;
}

function formatOpenCommitmentsSection(
  s: WeeklyOpenCommitmentsSection,
): string[] {
  const lines: string[] = ["*🛠 Що зависло*"];
  if (s.notConfigured) {
    lines.push(
      "- _GitHub-доступу немає (OPENCLAW_GITHUB_REPO або token не сконфігуровані); дані недоступні._",
    );
    return lines;
  }
  const open = s.openCount ?? 0;
  const stale = s.staleCount ?? 0;
  lines.push(`- Open PRs: ${open} (з них stale: ${stale})`);
  if (s.staleTop && s.staleTop.length > 0) {
    lines.push("- Найстаріші:");
    for (const pr of s.staleTop) {
      lines.push(
        `  - [#${pr.number}](${pr.url}) ${pr.title} · ${pr.ageDays} дн`,
      );
    }
  }
  if (s.note) lines.push(`- ${s.note}`);
  return lines;
}

function formatAlertsSection(s: WeeklyAlertsSection): string[] {
  const lines: string[] = ["*⚠️ Sentry alerts (unresolved)*"];
  if (s.notConfigured) {
    lines.push("- _SENTRY_AUTH_TOKEN не сконфігурований; дані недоступні._");
    return lines;
  }
  const issues = s.issueCount ?? 0;
  lines.push(`- Severity ${s.level ?? "error"}: ${issues}`);
  if (s.topIssues && s.topIssues.length > 0) {
    lines.push("- Топ:");
    for (const i of s.topIssues) {
      lines.push(`  - [${i.title}](${i.permalink}) · ${i.count}× · ${i.level}`);
    }
  }
  if (s.note) lines.push(`- ${s.note}`);
  return lines;
}

// ──── helpers ────────────────────────────────────────────────────────

function formatUah(amount: number): string {
  // Use 0 decimals для UAH в DM (округлюємо до цілих гривень) — fractional
  // копійки не релевантні для CEO-рівня перегляду.
  const rounded = Math.round(amount);
  return `${rounded.toLocaleString("uk-UA")} ₴`;
}

function formatDelta(current: number, previous: number): string {
  if (previous === 0) {
    if (current === 0) return "0";
    return `+${current}`;
  }
  const diff = current - previous;
  const pct = (diff / previous) * 100;
  const sign = diff > 0 ? "+" : "";
  if (Math.abs(pct) < 0.5) return `${sign}${diff} · ~flat`;
  return `${sign}${diff} · ${sign}${pct.toFixed(0)}%`;
}
