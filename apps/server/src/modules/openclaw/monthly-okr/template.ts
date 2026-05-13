/**
 * O3 (Phase 2.B) — pure markdown шаблон monthly OKR review.
 * `data` → markdown; без I/O.
 *
 * 4 секції у порядку: narrative → OKR progress → wins → risks.
 */

import type {
  MonthlyNarrativeSection,
  MonthlyOkrData,
  MonthlyOkrProgressSection,
  MonthlyRisksSection,
  MonthlyWinsSection,
} from "./types.js";

export function buildMonthlyOkrReview(data: MonthlyOkrData): string {
  const lines: string[] = [];
  lines.push(`🎯 *Місячний OKR-ритуал — ${data.reportingMonth}*`);
  lines.push("");
  lines.push(...formatNarrative(data.narrative));
  lines.push("");
  lines.push(...formatProgress(data.progress));
  lines.push("");
  lines.push(...formatWins(data.wins));
  lines.push("");
  lines.push(...formatRisks(data.risks));
  return lines.join("\n").trimEnd() + "\n";
}

function formatNarrative(s: MonthlyNarrativeSection): string[] {
  const lines: string[] = ["*🔄 Recalibration*"];
  lines.push(s.text.trim());
  if (s.source === "template") {
    lines.push("_(шаблонний summary; LLM-pass недоступний)_");
  }
  return lines;
}

function formatProgress(s: MonthlyOkrProgressSection): string[] {
  const lines: string[] = ["*📈 OKR progress*"];
  if (s.note) lines.push(`_${s.note}_`);
  if (s.okrs.length === 0) {
    lines.push("- _OKR-список порожній._");
    return lines;
  }
  for (const okr of s.okrs) {
    lines.push(
      `- *${okr.quarter} · ${okr.objective}* — ${okr.progressPct.toFixed(0)}%`,
    );
    for (const kr of okr.krs) {
      lines.push(
        `  - ${kr.label}: ${formatCurrent(kr.current, kr.unit)} / ${formatCurrent(kr.target, kr.unit)} (${kr.progressPct.toFixed(0)}%)`,
      );
    }
  }
  return lines;
}

function formatWins(s: MonthlyWinsSection): string[] {
  const lines: string[] = ["*🏆 Wins (merged за місяць)*"];
  if (s.notConfigured) {
    lines.push(
      "- _GitHub-доступу немає (OPENCLAW_GITHUB_REPO або token не сконфігуровані); дані недоступні._",
    );
    return lines;
  }
  const merged = s.mergedCount ?? 0;
  lines.push(`- Merged за місяць: ${merged}`);
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

function formatRisks(s: MonthlyRisksSection): string[] {
  const lines: string[] = ["*⚠️ Risks & blockers*"];
  if (s.notConfigured) {
    lines.push("- _Sentry або GitHub-доступу немає; дані часткові._");
    return lines;
  }
  const sentry = s.sentryUnresolvedCount ?? 0;
  const stale = s.staleCommitmentsCount ?? 0;
  lines.push(`- Sentry unresolved error issues: ${sentry}`);
  lines.push(`- Stale-PR (>30 дн): ${stale}`);
  if (s.topBlockers && s.topBlockers.length > 0) {
    lines.push("- Топ блокери:");
    for (const b of s.topBlockers) {
      const kind = b.kind === "sentry" ? "🐛" : "🧊";
      lines.push(`  - ${kind} [${b.title}](${b.url})`);
    }
  }
  if (s.note) lines.push(`- ${s.note}`);
  return lines;
}

function formatCurrent(value: number, unit: string): string {
  return `${value.toLocaleString("uk-UA")} ${unit}`.trim();
}
