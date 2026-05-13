/**
 * PR-26 — pure markdown-формат morning briefing-у. Без I/O і без `process.env`
 * читань: усі дані приходять через `MorningBriefingData`, який збирає
 * `builder.ts`. Цей файл одиничний source-of-truth для того, як briefing
 * виглядає у founder-DM-і.
 *
 * Дизайн:
 *   - 5 секцій у фіксованому порядку (MRR / signups / PR-queue /
 *     workflow-health / alerts) — порядок mirrors-ить
 *     `docs/launch/tech/openclaw-roadmap.md § Phase 2` Scope-block.
 *   - Кожна секція має 3 modes: `not_configured` (показуємо hint про
 *     env), `partial` (показуємо що є + `note`), `full` (показуємо
 *     повний metric-роядок).
 *   - Markdown відповідає Telegram MarkdownV2 light-subset (без
 *     escape-ів спецсимволів — на caller-і — Phase 2 використовує
 *     `parse_mode: Markdown` через gateway-bot, який тільки `*bold*`,
 *     `_italic_`, [link](url) розпізнає).
 *   - Жодних emoji в самому markdown — header-секція виводить емоджі через
 *     `formatHeader`, де вони фіксовані стрічково (без user-input-у).
 *
 * Тестується unit-ами у `template.test.ts`:
 *   - happy (full data) рендер;
 *   - `not_configured` для кожної з 5 секцій;
 *   - partial (тільки кілька полів) рендер;
 *   - sanity на пустий `topPrs` / `topIssues`.
 */

import type {
  AlertsBriefingSection,
  MorningBriefingData,
  PrQueueBriefingSection,
  ProposalsBriefingSection,
  SignupsBriefingSection,
  StripeBriefingSection,
  WorkflowsBriefingSection,
} from "./types.js";

/**
 * Головний entrypoint — `data` → markdown briefing. Якщо секція
 * `proposals` присутня (O1 / Phase 2.A) — вона виводиться першою
 * після заголовка, щоб founder бачив next-action-и відразу.
 */
export function buildMorningBriefing(data: MorningBriefingData): string {
  const lines: string[] = [];
  lines.push(formatHeader(data));
  if (data.proposals) {
    lines.push("");
    lines.push(...formatProposalsSection(data.proposals));
  }
  lines.push("");
  lines.push(...formatStripeSection(data.stripe));
  lines.push("");
  lines.push(...formatSignupsSection(data.signups));
  lines.push("");
  lines.push(...formatPrQueueSection(data.prQueue));
  lines.push("");
  lines.push(...formatWorkflowsSection(data.workflows));
  lines.push("");
  lines.push(...formatAlertsSection(data.alerts));
  return lines.join("\n").trimEnd() + "\n";
}

function formatProposalsSection(s: ProposalsBriefingSection): string[] {
  const lines: string[] = ["*🎯 Пропозиції на сьогодні*"];
  if (s.notConfigured) {
    lines.push(
      "- _LLM-провайдер не сконфігурований (`ANTHROPIC_API_KEY` / `LLM_PROVIDER`); next-action-и пропущено._",
    );
    if (s.note) lines.push(`- ${s.note}`);
    return lines;
  }
  const proposals = Array.isArray(s.proposals) ? s.proposals : [];
  if (proposals.length === 0) {
    lines.push(
      "- _LLM не повернув жодної пропозиції; фокус — roadmap-задача дня._",
    );
    if (s.note) lines.push(`- ${s.note}`);
    return lines;
  }
  proposals.forEach((proposal, idx) => {
    lines.push(`${idx + 1}. ${proposal}`);
  });
  if (s.reasoning) lines.push(`- _${s.reasoning}_`);
  if (s.note) lines.push(`- ${s.note}`);
  return lines;
}

function formatHeader(data: MorningBriefingData): string {
  return `🌅 *Морній брифінг — ${data.reportingDate}*`;
}

function formatStripeSection(s: StripeBriefingSection): string[] {
  const lines: string[] = ["*💵 MRR / Stripe*"];
  if (s.notConfigured) {
    lines.push("- _STRIPE_SECRET_KEY не сконфігурований; дані недоступні._");
    return lines;
  }
  const window = s.windowDays ?? 1;
  const succ = s.successfulCount ?? 0;
  const failed = s.failedCount ?? 0;
  const gross = s.grossAmountUah;
  lines.push(
    `- Платежі за ${window === 1 ? "вчора" : `${window} дн`}: ${succ} успішних, ${failed} failed`,
  );
  if (typeof gross === "number" && Number.isFinite(gross)) {
    lines.push(`- Gross revenue: ${formatUah(gross)}`);
  } else {
    lines.push("- Gross revenue: _не виміряно_");
  }
  if (s.note) lines.push(`- ${s.note}`);
  return lines;
}

function formatSignupsSection(s: SignupsBriefingSection): string[] {
  const lines: string[] = ["*👥 Signups / PostHog*"];
  if (s.notConfigured) {
    lines.push(
      "- _POSTHOG_API_KEY / POSTHOG_PROJECT_ID не сконфігуровані; дані недоступні._",
    );
    return lines;
  }
  const window = s.windowDays ?? 1;
  const pv = s.pageviewCount;
  const sub = s.subscriptionStartedCount;
  if (typeof pv === "number") {
    lines.push(
      `- Pageviews за ${window === 1 ? "вчора" : `${window} дн`}: ${pv}`,
    );
  } else {
    lines.push("- Pageviews: _не виміряно_");
  }
  if (typeof sub === "number") {
    lines.push(`- \`subscription_started\` events: ${sub}`);
  } else {
    lines.push("- `subscription_started` events: _не виміряно_");
  }
  if (s.note) lines.push(`- ${s.note}`);
  return lines;
}

function formatPrQueueSection(s: PrQueueBriefingSection): string[] {
  const lines: string[] = ["*🔀 PR-черга / GitHub*"];
  if (s.notConfigured) {
    lines.push(
      "- _GitHub-доступу немає (OPENCLAW_GITHUB_REPO або token не сконфігуровані); дані недоступні._",
    );
    return lines;
  }
  const open = s.openCount ?? 0;
  const needs = s.needsReviewCount ?? 0;
  lines.push(`- Open PRs: ${open} (з них needs-review: ${needs})`);
  if (s.topPrs && s.topPrs.length > 0) {
    lines.push("- Топ:");
    for (const pr of s.topPrs) {
      const flag = pr.needsReview ? " · needs-review" : "";
      lines.push(`  - [#${pr.number}](${pr.url}) ${pr.title}${flag}`);
    }
  }
  if (s.note) lines.push(`- ${s.note}`);
  return lines;
}

function formatWorkflowsSection(s: WorkflowsBriefingSection): string[] {
  const lines: string[] = ["*⚙️ n8n workflow-и*"];
  if (s.notConfigured) {
    lines.push(
      "- _N8N_API_URL / N8N_API_KEY не сконфігуровані; дані недоступні._",
    );
    return lines;
  }
  const total = s.totalCount ?? 0;
  const active = s.activeCount ?? 0;
  const inactive = s.inactiveCount ?? Math.max(0, total - active);
  const failing = s.failingCount ?? 0;
  lines.push(`- Total: ${total} (active ${active}, inactive ${inactive})`);
  if (failing > 0) {
    lines.push(`- Failing (last run): ${failing} ⚠️`);
  } else {
    lines.push("- Failing: 0");
  }
  if (s.note) lines.push(`- ${s.note}`);
  return lines;
}

function formatAlertsSection(s: AlertsBriefingSection): string[] {
  const lines: string[] = ["*🚨 User-facing alerts / Sentry*"];
  if (s.notConfigured) {
    lines.push("- _SENTRY_AUTH_TOKEN не сконфігурований; дані недоступні._");
    return lines;
  }
  const level = s.level ?? "error";
  const cnt = s.issueCount ?? 0;
  lines.push(`- Unresolved \`${level}\` issues: ${cnt}`);
  if (s.topIssues && s.topIssues.length > 0) {
    lines.push("- Топ:");
    for (const issue of s.topIssues) {
      lines.push(
        `  - [${issue.title}](${issue.permalink}) · ${issue.level} · ${issue.count}×`,
      );
    }
  }
  if (s.note) lines.push(`- ${s.note}`);
  return lines;
}

/**
 * Форматує число UAH у людино-читабельний рядок з тисячами-роздільниками
 * (NBSP — Telegram МКВ не ламає, а пробіл-роздільник звичайний).
 */
function formatUah(amount: number): string {
  if (!Number.isFinite(amount)) return "_не виміряно_";
  const rounded = Math.round(amount * 100) / 100;
  const formatted = new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: rounded % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(rounded);
  return `${formatted} UAH`;
}
