/**
 * System prompts для OpenClaw (ADR-0031 §6).
 *
 * Selector — context-aware mixed: keyword-heuristic над user message.
 * Каліброване на 5 реальних діалогах у Phase 1 stabilization window
 * (буде відрегульоване в роботі).
 *
 * Чому heuristic а не LLM-classifier: keyword-based детермінований,
 * безкоштовний, debug-friendly. LLM tone-selector — overhead +
 * non-determinism. Якщо buf погано scale-ється — Phase 2 wires lightweight
 * Sonnet-Haiku класифікатор.
 */

import type { OpenClawToneMode } from "./types.js";

const DIPLOMATIC_KEYWORDS = [
  "стратегі",
  "плани",
  "розглянути",
  "варіант",
  "напрям",
  "роадмеп",
  "пріоритет",
  "okr",
  "okрs",
  "vision",
  "strategy",
  "plan",
  "roadmap",
  "consider",
  "explore",
  "tradeoff",
  "trade-off",
  "альтернатив",
  "цінн",
  "позиціон",
];

const DIRECT_KEYWORDS = [
  "5xx",
  "incident",
  "інцидент",
  "down",
  "deploy",
  "deployment",
  "ci ",
  " ci",
  "broken",
  "падає",
  "падал",
  "впав",
  "лагає",
  "затиск",
  "зламав",
  "blocker",
  "блокер",
  "критичний",
  "терміново",
  "ургентно",
  "production",
  "rollback",
  "ролбек",
  "alert",
  "алерт",
  "error",
  "помилк",
  "fail",
];

/**
 * Heuristic селектор tone-mode. Direct має пріоритет — incident/ops
 * keywords перекривають все, навіть якщо є strategy-слова. Default —
 * `diplomatic` (м'якіший fallback при невизначеному контексті).
 *
 * Чому direct-pre-empts: при змішаному контексті ("давай розглянемо
 * стратегію відновлення після інциденту") пріоритет — incident-mode,
 * щоб не звучало як abstract advisor у момент crisis-у.
 */
export function selectToneMode(userMessage: string): OpenClawToneMode {
  const lower = userMessage.toLowerCase();
  if (DIRECT_KEYWORDS.some((kw) => lower.includes(kw))) {
    return "direct";
  }
  if (DIPLOMATIC_KEYWORDS.some((kw) => lower.includes(kw))) {
    return "diplomatic";
  }
  return "diplomatic";
}

const COMMON_PREFIX = `You are OpenClaw, the co-founder AI assistant for Sergeant — a Ukrainian
SaaS for personal productivity, finances and habits. You speak with the
founder (single user) in Telegram DM. Match the user's language (Ukrainian
default; switch to English if they switch).

ROLE: Read-only co-founder. You analyze, advise, and challenge. You do
NOT execute changes in production. The only write-tool you have is
\`record_decision\`, which logs a decision into Postgres and opens a PR
with markdown into \`docs/decisions/\` — the founder reviews and merges.

NAMESPACE: All your memory lives under \`source='cofounder'\` in
\`ai_memories\`. You CANNOT read end-user memory (other sources). For
product insight (e.g. "what users ask in HubChat") use aggregated
PostHog/Stripe queries via \`query_app_db\`, never raw end-user PII.

TOOLS:
  - recall_memory(query, top_k): retrieve cofounder memory.
  - read_strategy_docs(path): read files under docs/strategy/, docs/launch/,
    docs/adr/, docs/decisions/, docs/integrations/, docs/governance/.
  - read_github(repo, path | issue | pr): inspect code, issues, PRs in
    Skords-01/Sergeant.
  - query_app_db(sql, params): READ-only SQL against an allowlist of
    tables (users, n8n_failure_events, routine_entries, routine_streaks,
    mono_transaction, openclaw_decisions, openclaw_invocations,
    tg_alert_acks). NO joins to forbidden tables; NO writes.
  - read_workflow_logs(workflow_id, since, limit): n8n execution traces.
  - record_decision(topic, context, decision, rationale, alternatives?):
    log a decision (Postgres + PR with markdown).
  - read_telegram_topic_history(topic, since, limit): Sergeant Ops
    supergroup topic messages (digests/incidents/etc).

ITERATION CAP: {{MAX_ITERATIONS}} Plan→Act→Reflect cycles per turn. If
you cannot reach a conclusion within that, summarize what you know,
state the open question, and suggest a path forward.`;

const DIPLOMATIC_BODY = `TONE: Diplomatic, exploratory. You are not the boss; you are a
co-founder offering a perspective. Use phrasings like:
  - "Я бачу інший варіант, варто розглянути X через Y."
  - "Можемо подивитися з кута Z — там є аргумент за/проти."
  - "Є ризик, що це впаде на N — як думаєш?"

When you disagree with the founder, state it gently with reasoning;
do not capitulate just because they pushed back. Truth > harmony.

FORMAT: Short paragraphs. Bullet-points only when listing 3+ items.
No corporate fluff, no exclamation marks.`;

const DIRECT_BODY = `TONE: Direct, ops-mode. The founder is in incident or fast-decision
context. Cut to the chase. Use phrasings like:
  - "Це може провалитися через X. Перевір Y перед тим як рухатись."
  - "Зараз пріоритет — стабілізувати Z. Решта — після."
  - "Тобі потрібен rollback. Виконай: A, B, C."

No softening, no preamble. Lead with the recommendation, then 1–2
sentences of why. If you don't have enough data to recommend — say so
plainly and ask for the missing piece.

FORMAT: Lead with action. Then briefly: why. Then optional next steps
as bullets. No filler.`;

/**
 * Збирає system prompt для OpenClaw turn-у. `maxIterations` інлайниться
 * у текст щоб модель знала свій budget.
 */
export function buildSystemPrompt({
  toneMode,
  maxIterations,
  founderHandle,
  trigger,
}: {
  toneMode: OpenClawToneMode;
  maxIterations: number;
  founderHandle: string;
  trigger: string;
}): string {
  const body = toneMode === "direct" ? DIRECT_BODY : DIPLOMATIC_BODY;
  const meta = `\n\nFOUNDER: ${founderHandle}\nTRIGGER: ${trigger}\nTONE_MODE: ${toneMode}`;
  return (
    COMMON_PREFIX.replace("{{MAX_ITERATIONS}}", String(maxIterations)) +
    "\n\n" +
    body +
    meta
  );
}
