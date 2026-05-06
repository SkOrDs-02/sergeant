/**
 * OpenClaw strategic mode skeleton (ADR-0031, Phase 3 prep).
 *
 * Strategic modes are an orthogonal dimension to personas — а persona
 * визначає "хто думає" (ops-engineer / growth-marketer / cofounder…),
 * mode визначає "як думати": ad-hoc dialog (default — no mode) vs.
 * structured plan-mode / analyze-mode / OKR-mode.
 *
 * Phase 3 skeleton (this PR):
 *   - Тип `StrategicMode` ∈ { plan, analyze, okr }, плюс `null` для
 *     default (звичайний DM-діалог без structured framework).
 *   - Primer-параграф для кожного режиму, що prepend-иться до tone-mode
 *     body у `buildSystemPromptInline`. Primer задає 4-step (plan),
 *     hypothesis-driven (analyze) або OKR-review framework — без
 *     write-tools, без auto-PR-suggest, без cron follow-up.
 *   - Slash-команди `/plan <topic>`, `/analyze <anomaly>`, `/okr` у
 *     `handler-commands.ts` запускають agent-turn з відповідним mode.
 *
 * Що НЕ робимо у Phase 3 skeleton:
 *   - `commit_to_strategy_doc` follow-up — це Phase 4 territory (ADR-0036),
 *     тут plan-mode тільки veбалізує "ось option chosen" і пропонує
 *     founder-у записати рішення через `/decision` або `record_decision`
 *     якщо persona має write-tool.
 *   - `docs/strategy/<okr>.md` scaffolding — окремий PR-37/38 створить
 *     каталог з YAML-frontmatter (`objective`, `kr[]`, `current_state`,
 *     `last_review_at`).
 *   - Multi-turn state machine з explicit `current_step` — Phase 1 LLM
 *     drives the structure через prompt; persistence — Phase 4.
 *
 * Чому окремий primer (не нова persona): persona фільтрує tools та
 * "повертає капелюх" (eng / ops / finance). Mode задає framework — він
 * сумісний з будь-якою persona. Наприклад `/plan` з cofounder primer-ом
 * (default) дає plan-mode у synthesis-tone. У майбутньому `/eng /plan
 * <feature>` буде plan-mode + senior-engineer воркфлоу — без зміни
 * `personas.ts`.
 *
 * Acceptance contract (з roadmap §Phase 3):
 *   - `/plan churn-reduction-q3` → 4-step session (Goal → Context →
 *     Options → Decision/Followup).
 *   - `/analyze падіння signups вчора` → hypothesis tree → ranked висновок.
 *   - `/okr` → дашборд активних OKR з прогресом.
 */

export type StrategicMode = "plan" | "analyze" | "okr";

export const ALL_STRATEGIC_MODES: readonly StrategicMode[] = [
  "plan",
  "analyze",
  "okr",
] as const;

const PLAN_PRIMER =
  "STRATEGIC_MODE: plan. Founder викликав `/plan <topic>` для structured " +
  "planning сесії. Веди розмову у чотирьох кроках, явно проіменовуючи " +
  "поточний крок:\n" +
  "  1) GOAL — уточни ціль (clarifying questions). Що success looks like? " +
  "Який metric / proof-point показує що ми досягли?\n" +
  "  2) CONTEXT — підтягни релевантні дані через tools (`recall_memory`, " +
  "`read_strategy_docs`, `query_app_db`, `get_*_stats`). Не перевантажуй — " +
  "достатньо 2–3 ключові факти.\n" +
  "  3) OPTIONS — згенеруй 2–3 варіанти з trade-offs (cost / time / risk). " +
  "Уникай single-option-narrative — навіть якщо один варіант явно сильніший, " +
  "опиши інший з чесними мінусами.\n" +
  "  4) DECISION + FOLLOWUP — рекоменд один з options з обґрунтуванням. " +
  "Запропонуй founder-у зафіксувати рішення (через `record_decision` якщо " +
  "доступно) і визнач weekly-review checkpoint.\n" +
  "Якщо founder вже на step ≥ 2 (передав context або option), не починай " +
  "з 1 знову — продовж з його кроку.";

const ANALYZE_PRIMER =
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

const OKR_PRIMER =
  "STRATEGIC_MODE: okr. Founder викликав `/okr` для огляду активних OKR. " +
  "Phase 3 skeleton — поки `docs/strategy/<okr>.md` каталог не " +
  "scaffolded, працюй з тим що є:\n" +
  "  1) ACTIVE OKRs — спробуй прочитати з `docs/strategy/` через " +
  "`read_strategy_docs`. Якщо порожньо — recall_memory(`okr quarterly " +
  "objectives`) для cofounder-memory snapshot-у.\n" +
  "  2) PROGRESS PER KR — для кожного KR з виявленого списку оціни " +
  "поточний стан проти target. Числа — з `query_app_db` (revenue, signups, " +
  "active users, retention) або з Stripe/PostHog metric-tools.\n" +
  "  3) BOTTLENECKS — назви 1–2 KR, що відстають, і конкретно чому. " +
  'Уникай мяких формулювань ("можливо повільніше ніж очікувалось") — ' +
  "числа і delta vs target.\n" +
  "  4) NEXT ACTIONS — 1 action per bottleneck KR, з owner-ом і " +
  "deadline-ом. Якщо потрібен новий OKR draft — запропонуй структуру і " +
  "founder сам зафіксує.\n" +
  "Якщо `docs/strategy/` повністю порожній і memory не повертає OKR-data — " +
  'явно скажи "OKR ще не scaffolded" і запропонуй framework на kick-off.';

export const STRATEGIC_MODE_PRIMERS: Record<StrategicMode, string> = {
  plan: PLAN_PRIMER,
  analyze: ANALYZE_PRIMER,
  okr: OKR_PRIMER,
};

/** Type-guard for casting a string into a `StrategicMode`. */
export function isStrategicMode(value: string): value is StrategicMode {
  return (ALL_STRATEGIC_MODES as readonly string[]).includes(value);
}

/**
 * Returns the system-prompt primer paragraph for a strategic mode.
 * Caller composes it after the persona primer and before the tone-mode
 * body (see `buildSystemPromptInline`).
 */
export function strategicModePrimer(mode: StrategicMode): string {
  return STRATEGIC_MODE_PRIMERS[mode];
}

/**
 * Trigger labels for the audit-log `openclaw_invocations.trigger`
 * column. Mode-launched turns get a distinct trigger so per-mode
 * usage / cost can be aggregated later (Phase 3.5 telemetry).
 */
export const STRATEGIC_MODE_TRIGGERS: Record<StrategicMode, string> = {
  plan: "strategic_plan",
  analyze: "strategic_analyze",
  okr: "strategic_okr",
};
