/**
 * Stage 5a — canonical per-persona tool allowlist.
 *
 * Single source of truth для того, які з 30 registered tools (25 read
 * + 5 write) бачить кожна з 10 persona-агентів. Mapping береться
 * дослівно з `ops/openclaw/skills/sergeant-<id>/SKILL.md § Доступні
 * tools` і з `WRITE_TOOLS` (`src/hooks/write-approval.ts`).
 *
 * Цей модуль НЕ використовується runtime-плагіном — openclaw host робить
 * filter на etapі tool dispatch згідно з `agents.<id>.tools.{alsoAllow,
 * deny}` у `ops/openclaw/openclaw.example.json`. Канонічна табличка
 * нижче існує, щоб:
 *
 * 1. `config-gate.test.ts` міг звіряти JSON з SKILL.md без drift-у.
 * 2. Документація мала machine-readable джерело правди.
 *
 * Якщо persona отримує / втрачає tool — змінюй ОДНОЧАСНО:
 *   - SKILL.md секцію «Доступні tools»
 *   - PERSONA_TOOL_ALLOWLIST нижче
 *   - `ops/openclaw/openclaw.example.json` `agents.<id>.tools` block
 *
 * Gate-test ламається, якщо ці три розходяться.
 *
 * AI-NOTE: спайк-доку § 6 (`docs/notes/spikes/openclaw-sdk-5.7-real-api.md`)
 * описує семантику `AgentToolsConfig.alsoAllow` / `deny` у openclaw 5.7.
 */

import { WRITE_TOOLS } from "../hooks/write-approval.js";

/** Усі 25 read-tools у тому ж порядку, що `index.ts` їх реєструє. */
export const READ_TOOLS: readonly string[] = Object.freeze([
  "recall_memory",
  "read_strategy_docs",
  "record_decision",
  "query_app_db",
  "get_server_stats",
  "get_stripe_metrics",
  "get_posthog_stats",
  "get_sentry_issues",
  "read_github",
  "github_search",
  "github_tree",
  "github_diff",
  "github_prs",
  "get_github_releases",
  "n8n_list",
  "n8n_describe",
  "n8n_trigger",
  "n8n_activate",
  "refresh_business_snapshot",
  "read_workflow_logs",
  "read_telegram_topic",
  "seo_gsc_query",
  "seo_psi_audit",
  "seo_serp_lookup",
  "set_reminder",
]);

/** Усі 30 registered tools (25 read + 5 write). */
export const ALL_TOOL_NAMES: readonly string[] = Object.freeze([
  ...READ_TOOLS,
  ...Array.from(WRITE_TOOLS),
]);

export type PersonaId =
  | "cofounder"
  | "eng"
  | "devops"
  | "pm"
  | "growth"
  | "finance"
  | "data"
  | "cs"
  | "content"
  | "seo";

export const PERSONA_IDS: readonly PersonaId[] = Object.freeze([
  "cofounder",
  "eng",
  "devops",
  "pm",
  "growth",
  "finance",
  "data",
  "cs",
  "content",
  "seo",
]);

export interface PersonaAllowlist {
  /** Tools the persona is granted via `agents.<id>.tools.alsoAllow`. */
  readonly alsoAllow: readonly string[];
  /**
   * Write-tools explicitly denied via `agents.<id>.tools.deny`. We only
   * deny write-tools (read-tools are denied implicitly by omission from
   * `alsoAllow`). `deny` is enforced AFTER merge of `alsoAllow` and the
   * profile-default allowlist (spike § 6).
   */
  readonly deny: readonly string[];
}

const ALL_WRITE_TOOLS: readonly string[] = Array.from(WRITE_TOOLS).sort();

/**
 * Helper: build a deny-list for write-tools that this persona is NOT
 * allowed to use. Keeps the policy explicit even though omission from
 * `alsoAllow` already prevents access — defence-in-depth.
 */
function denyWriteToolsExcept(allowedWrites: readonly string[]): string[] {
  const allow = new Set(allowedWrites);
  return ALL_WRITE_TOOLS.filter((t) => !allow.has(t));
}

/**
 * PERSONA → { alsoAllow, deny }.
 *
 * `cofounder` отримує повний tool-set (всі 30). Інші persona-агенти —
 * вузький subset згідно з їхнім SKILL.md.
 */
export const PERSONA_TOOL_ALLOWLIST: Readonly<
  Record<PersonaId, PersonaAllowlist>
> = Object.freeze({
  // CTO Ярослав-Cofounder — повний доступ.
  cofounder: {
    alsoAllow: Object.freeze([...ALL_TOOL_NAMES]),
    deny: Object.freeze([] as string[]),
  },

  // Артем — Engineering / CTO persona. SKILL.md "Read-only: read_github,
  // github_search, github_tree, github_diff, github_prs, query_app_db,
  // recall_memory. Write (gated): record_decision, create_github_issue.
  // Заборонено: n8n, SEO/finance".
  eng: {
    alsoAllow: Object.freeze([
      "read_github",
      "github_search",
      "github_tree",
      "github_diff",
      "github_prs",
      "query_app_db",
      "recall_memory",
      "record_decision",
      "create_github_issue",
    ]),
    deny: Object.freeze(denyWriteToolsExcept(["create_github_issue"])),
  },

  // Максим — DevOps / SRE. SKILL.md "Read: read_workflow_logs, n8n_list,
  // n8n_describe, get_sentry_issues, get_server_stats, recall_memory.
  // Write: n8n_trigger, n8n_activate. Future: mute_alert, pause_workflow
  // (доступні з Stage 3, додаємо)".
  devops: {
    alsoAllow: Object.freeze([
      "read_workflow_logs",
      "n8n_list",
      "n8n_describe",
      "n8n_trigger",
      "n8n_activate",
      "get_sentry_issues",
      "get_server_stats",
      "recall_memory",
      "mute_alert",
      "pause_workflow",
    ]),
    deny: Object.freeze(denyWriteToolsExcept(["mute_alert", "pause_workflow"])),
  },

  // Лука — Product Manager. SKILL.md "Read: read_strategy_docs,
  // get_posthog_stats, query_app_db, recall_memory. Write: record_decision,
  // create_github_issue. Future: commit_to_strategy_doc".
  pm: {
    alsoAllow: Object.freeze([
      "read_strategy_docs",
      "get_posthog_stats",
      "query_app_db",
      "recall_memory",
      "record_decision",
      "create_github_issue",
      "commit_to_strategy_doc",
    ]),
    deny: Object.freeze(
      denyWriteToolsExcept(["create_github_issue", "commit_to_strategy_doc"]),
    ),
  },

  // Марта — Growth. SKILL.md "Read: get_posthog_stats, get_stripe_metrics,
  // query_app_db, read_github, get_github_releases, recall_memory.
  // Future write: post_to_topic. Заборонено: n8n, create_github_issue".
  growth: {
    alsoAllow: Object.freeze([
      "get_posthog_stats",
      "get_stripe_metrics",
      "query_app_db",
      "read_github",
      "get_github_releases",
      "recall_memory",
      "post_to_topic",
    ]),
    deny: Object.freeze(denyWriteToolsExcept(["post_to_topic"])),
  },

  // Ірина — Finance. SKILL.md "Read: get_stripe_metrics, query_app_db
  // (finance views), recall_memory. Write: record_decision. Заборонено:
  // n8n, create_github_issue".
  finance: {
    alsoAllow: Object.freeze([
      "get_stripe_metrics",
      "query_app_db",
      "recall_memory",
      "record_decision",
    ]),
    deny: Object.freeze(denyWriteToolsExcept([])),
  },

  // Соломія — Data Analyst (pure read). SKILL.md "Read: query_app_db,
  // get_posthog_stats, get_stripe_metrics, get_server_stats, recall_memory.
  // Заборонено: write tools".
  data: {
    alsoAllow: Object.freeze([
      "query_app_db",
      "get_posthog_stats",
      "get_stripe_metrics",
      "get_server_stats",
      "recall_memory",
    ]),
    deny: Object.freeze(denyWriteToolsExcept([])),
  },

  // Назар — Customer Success. SKILL.md "Read: read_telegram_topic,
  // query_app_db, get_posthog_stats, recall_memory. Future write:
  // post_to_topic. Заборонено: create_github_issue, n8n".
  cs: {
    alsoAllow: Object.freeze([
      "read_telegram_topic",
      "query_app_db",
      "get_posthog_stats",
      "recall_memory",
      "post_to_topic",
    ]),
    deny: Object.freeze(denyWriteToolsExcept(["post_to_topic"])),
  },

  // Софія — Content. SKILL.md "Read: read_strategy_docs, recall_memory,
  // read_github. Future write: commit_to_strategy_doc, post_to_topic.
  // Заборонено: create_github_issue, n8n".
  content: {
    alsoAllow: Object.freeze([
      "read_strategy_docs",
      "recall_memory",
      "read_github",
      "commit_to_strategy_doc",
      "post_to_topic",
    ]),
    deny: Object.freeze(
      denyWriteToolsExcept(["commit_to_strategy_doc", "post_to_topic"]),
    ),
  },

  // SEO специаліст. SKILL.md "Read: seo_gsc_query, seo_psi_audit,
  // seo_serp_lookup, read_strategy_docs, read_github, get_posthog_stats,
  // recall_memory. Заборонено: усі write-tools".
  seo: {
    alsoAllow: Object.freeze([
      "seo_gsc_query",
      "seo_psi_audit",
      "seo_serp_lookup",
      "read_strategy_docs",
      "read_github",
      "get_posthog_stats",
      "recall_memory",
    ]),
    deny: Object.freeze(denyWriteToolsExcept([])),
  },
} as const);

/**
 * Returns the canonical sorted alsoAllow list for `personaId` — matches
 * the order we write into `openclaw.example.json` so JSON diffs stay
 * deterministic.
 */
export function sortedAllow(personaId: PersonaId): string[] {
  return [...PERSONA_TOOL_ALLOWLIST[personaId].alsoAllow].sort();
}

/** Same for the deny list. */
export function sortedDeny(personaId: PersonaId): string[] {
  return [...PERSONA_TOOL_ALLOWLIST[personaId].deny].sort();
}
