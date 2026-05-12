/**
 * Stage 5b PR-2 — `/analyze <anomaly>` strategic mode definition.
 *
 * The matching regex and `topicRequired: true` ensure that a bare
 * `/analyze` (or `/analyzed`, `/analyzes`, …) does NOT match — the
 * founder must supply an anomaly. The primer is byte-for-byte equal
 * to the legacy console primer at
 * `tools/console/src/agents/strategic-modes.ts` (the `analyze` arm
 * of `STRATEGIC_MODE_PRIMERS`). A drift-gate test in
 * `index.test.ts` reconstructs the legacy literal and compares.
 */

import type { StrategicModeDefinition } from "./types.js";

export const ANALYZE_PRIMER =
  "STRATEGIC_MODE: analyze. Founder викликав `/analyze <anomaly>` для " +
  "root-cause аналізу. Веди розмову як hypothesis-driven debug:\n" +
  "  1) ANOMALY — переформулюй що саме anomalous (значення / період / " +
  "відхилення від baseline). Якщо метрика ambiguous — задай clarifying.\n" +
  "  2) HYPOTHESES — згенеруй 3–5 потенційних причин (от найбільш-ймовірних " +
  "до edge-cases). Для кожної — який tool/query підтвердить чи спростує " +
  "(`query_app_db`, `get_sentry_issues`, `read_workflow_logs`, " +
  "`read_telegram_topic_history`, `get_posthog_stats`).\n" +
  "  3) EVIDENCE — для топ-2 гіпотез фактично зроби tool-call. Не " +
  "перевіряй усі п'ять — зосередься на тих, що можна швидко spike-нути.\n" +
  "  4) RANKED CONCLUSION — упорядкуй гіпотези за weight-of-evidence. " +
  "Якщо одна явно домінує — назви її primary cause; решту — у contributing " +
  "/ rejected з коротким обґрунтуванням.\n" +
  "Тон — direct (incident-mode default). Якщо дані недостатні — say so " +
  "plainly і вкажи яких саме fact-ів бракує.";

export const ANALYZE_PATTERN = /^\/analyze\b\s+(?<topic>\S[\s\S]*?)\s*$/i;

export const analyzeMode: StrategicModeDefinition = {
  slug: "analyze",
  trigger: "strategic_analyze",
  primer: ANALYZE_PRIMER,
  pattern: ANALYZE_PATTERN,
  topicRequired: true,
};
