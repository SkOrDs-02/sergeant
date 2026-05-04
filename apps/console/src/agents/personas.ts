/**
 * OpenClaw multi-persona definitions (ADR-0033, Phase 2.5).
 *
 * Кожна persona — це pair з:
 *   1. `primer` — короткий попередній absatz, який prepend-иться до
 *      звичайного OpenClaw system-prompt-у (`buildSystemPromptInline`).
 *      Persona задає роль і фокус-набір питань. Сам OpenClaw common
 *      prefix + tone-mode body лишаються незмінними — primer тільки
 *      "повертає капелюх".
 *   2. `allowedTools` — set імен tool-ів з `openClawTools`, які persona
 *      бачить. Все інше фільтрується перед `runAgentLoop` так, що LLM
 *      навіть не знає про їхнє існування. Це зменшує cost (менше
 *      schema у context-і) і guard-ить від cross-persona leak (наприклад,
 *      `eng` не бачить Stripe refunds).
 *
 * Default persona — `cofounder`: повний tool-set, синтез/опонент-режим.
 * Це поточна single-voice OpenClaw поведінка з Phase 1, просто з явним
 * persona-tag-ом.
 *
 * Що НЕ робимо у Phase 2.5 (ADR-0033):
 *   - Persona-specific memory namespaces — лишаємо source='cofounder'
 *     для всіх; персона-фільтрація на rendering-time у primer-і.
 *   - Concurrent council — паралельні Anthropic-call-и розглянемо у
 *     Phase 4 разом з cost-tracking-ом.
 */

import type Anthropic from "@anthropic-ai/sdk";

type Tool = Anthropic.Tool;

export type OpenClawPersona =
  | "cofounder"
  | "ops"
  | "growth"
  | "eng"
  | "finance";

export const ALL_PERSONAS: readonly OpenClawPersona[] = [
  "cofounder",
  "ops",
  "growth",
  "eng",
  "finance",
] as const;

/** Personas which take part in `/council` round-table (deterministic order). */
export const COUNCIL_PERSONAS: readonly OpenClawPersona[] = [
  "ops",
  "growth",
  "eng",
  "finance",
] as const;

export const DEFAULT_PERSONA: OpenClawPersona = "cofounder";

// Primer mappings to governance skills are catalogued in
// docs/agents/specialists-mapping.md. Each persona below names the
// skill(s) that should be loaded when the persona drives a repo task.

const COFOUNDER_PRIMER =
  "PERSONA: cofounder. Default mode — синтез думок усіх спеціалістів, " +
  "опонент-роль, утримання priorities. Усі tools доступні; " +
  "вибирай мінімально-достатній набір під поточне питання. Якщо виходимо на repo-рівень — " +
  "ввіряйся на .agents/skills/sergeant-monorepo-boundaries (для boundary рішень) " +
  "+ docs/agents/specialists-mapping.md для вибору вужчого спеціаліста.";

const OPS_PRIMER =
  "PERSONA: ops-engineer. Reliability, incidents, n8n health, deployment " +
  "stability. Ти аналізуєш Sentry, Stripe failures, server /healthz і n8n " +
  "execution traces. Reply у тоні reliability eng (короткі recommendations, " +
  "приоритезація severity, action items). При роботі в репо ввіряйся на " +
  ".agents/skills/sergeant-deploy-and-observability (deploy + Sentry + n8n) " +
  "+ .agents/skills/sergeant-bugfix-and-regression (incident reproduction). " +
  "Якщо питання — про strategy або growth — м'яко скажи, що це поза твоєю смугою, і " +
  "запропонуй переключитись на /growth або /cofounder.";

const GROWTH_PRIMER =
  "PERSONA: growth-marketer. Activation, retention, funnels, content " +
  "strategy, GitHub releases. Ти читаєш PostHog (pageviews, events), " +
  "GitHub releases, strategy docs. Reply у тоні growth lead (метрики → " +
  "інсайти → next-experiment). Ця роль не має виділеного repo skill — " +
  "виходить на docs/agents/specialists-mapping.md (`growth-marketing` — extra) " +
  "і docs/launch/. Якщо питання — про incident debug — м'яко скажи, що це /ops territory.";

const ENG_PRIMER =
  "PERSONA: senior-engineer. Code review, PR queue, tech-debt, schema " +
  "migrations. Ти читаєш GitHub (PRs, issues, files), query_app_db " +
  "(schema, counts), Telegram engineering topic. Reply у тоні tech lead " +
  "(специфічні file paths, line refs, risks, оцінка scope). При роботі в репо — " +
  ".agents/skills/sergeant-feature-delivery (нова feature) + " +
  ".agents/skills/sergeant-review-and-merge (review/PR queue); для migration-ок " +
  "— .agents/skills/sergeant-data-and-migrations. Якщо питання — про MRR / " +
  "runway — це /finance territory.";

const FINANCE_PRIMER =
  "PERSONA: finance-cofounder. MRR, runway, cofounder-budget memory, " +
  "Stripe revenue/refund breakdown. Ти читаєш Stripe metrics, recall " +
  "cofounder memory (як тримаємо cash-flow assumptions), і за потреби " +
  "записуєш decision у docs/decisions/. Reply у тоні CFO (числа з " +
  "контекстом, runway implications, conservative interpretation). Репо-левел " +
  "task-и (Stripe code, billing) ведуться через .agents/skills/sergeant-server-api " +
  "+ docs/agents/specialists-mapping.md.";

export const PERSONA_PRIMERS: Record<OpenClawPersona, string> = {
  cofounder: COFOUNDER_PRIMER,
  ops: OPS_PRIMER,
  growth: GROWTH_PRIMER,
  eng: ENG_PRIMER,
  finance: FINANCE_PRIMER,
};

/**
 * Filter table: persona → allowed tool names. Tools not in the set are
 * stripped from the Anthropic call. `cofounder` має full set (sentinel
 * `null` означає no-filter — кожен новий tool у `openClawTools` буде
 * автоматично доступний default-персоні без оновлень тут).
 */
export const PERSONA_TOOL_FILTER: Record<
  OpenClawPersona,
  ReadonlySet<string> | null
> = {
  cofounder: null,
  ops: new Set([
    "read_workflow_logs",
    "get_sentry_issues",
    "get_server_stats",
    "get_stripe_metrics",
    "recall_memory",
    // ADR-0036 (Phase 4): write-tools relevant for ops persona — pause
    // a misbehaving n8n workflow, mute a Sentry false-positive, broadcast
    // an incident note. All gated by founder approval.
    "pause_workflow",
    "mute_alert",
    "post_to_topic",
  ]),
  growth: new Set([
    "get_posthog_stats",
    "get_github_releases",
    "read_strategy_docs",
    "recall_memory",
    // ADR-0036: growth can propose strategy-doc updates, file follow-up
    // issues, and post growth-experiment outcomes to the team topic.
    "commit_to_strategy_doc",
    "create_github_issue",
    "post_to_topic",
  ]),
  eng: new Set([
    "read_github",
    "query_app_db",
    "read_telegram_topic_history",
    "get_github_releases",
    "recall_memory",
    // ADR-0036: eng can file tech-debt issues and post engineering
    // updates to the team topic.
    "create_github_issue",
    "post_to_topic",
  ]),
  finance: new Set([
    "get_stripe_metrics",
    "recall_memory",
    "record_decision",
    "query_app_db",
    // ADR-0036: finance can commit budget / runway updates to a
    // strategy doc (founder reviews PR before merge).
    "commit_to_strategy_doc",
  ]),
};

/**
 * Type-guard для casting рядка у persona. Використовується там, де
 * persona походить з user-input (slash-команди) або з env-config-у.
 */
export function isOpenClawPersona(value: string): value is OpenClawPersona {
  return (ALL_PERSONAS as readonly string[]).includes(value);
}

/**
 * Returns the system-prompt primer for a persona. `cofounder` повертає
 * default primer; будь-яка інша — її focus-paragraph.
 */
export function personaPrimer(persona: OpenClawPersona): string {
  return PERSONA_PRIMERS[persona];
}

/**
 * Filters the tool list for a persona. `cofounder` (filter = null) —
 * passthrough; інші — повертають тільки tools з allowlist-у. Якщо
 * allowlist порожній або жодного tool не співпало — повертаємо порожній
 * масив (LLM не отримає tools, але це detect-аб у тестах).
 */
export function filterToolsForPersona(
  tools: readonly Tool[],
  persona: OpenClawPersona,
): Tool[] {
  // Defensive lookup — an unknown persona (callers casting through `as`
  // or future runtime-config drift) yields `undefined` here. Treat it as
  // an empty allowlist (fail-closed: no tools), not as the permissive
  // `null` cofounder default.
  const allowlist = PERSONA_TOOL_FILTER[persona];
  if (allowlist === null) return [...tools];
  if (!allowlist) return [];
  return tools.filter((t) => allowlist.has(t.name));
}
