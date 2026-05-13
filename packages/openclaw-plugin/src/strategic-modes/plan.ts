/**
 * Stage 5b PR-1 — `/plan <topic>` strategic mode.
 *
 * Activates a 4-step planning framework (GOAL → CONTEXT → OPTIONS →
 * DECISION + FOLLOWUP) on top of whatever persona is currently active.
 * The primer paragraph is prepended to the agent system prompt via the
 * `before_agent_start` hook in `src/hooks/strategic-mode.ts`; the agent
 * itself runs normally (full Layer 2 reasoning, no bypass).
 *
 * Trigger label `strategic_plan` lines up with the legacy console
 * implementation in `tools/openclaw/src/agents/strategic-modes.ts` so a
 * future SQL roll-up can `GROUP BY trigger` across both surfaces during
 * the parallel-run window (Stage 6b).
 *
 * Primer text is duplicated from the legacy file rather than imported:
 * `@sergeant/openclaw-plugin` ships in its own Docker image and must
 * stay independent of `tools/openclaw`. The legacy primer is the source
 * of truth until the console bot is retired (Stage 7 cutover); a tiny
 * gate test in `index.test.ts` keeps them in sync byte-for-byte.
 */

import type { StrategicModeDefinition } from "./types.js";

export const PLAN_PRIMER =
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

/**
 * Anchor: `^/plan` + word-boundary so `/plant` etc. never match.
 * Topic capture is required (a bare `/plan` is a no-match and the hook
 * falls through to the agent untouched — the founder can re-type with
 * a topic). Case-insensitive so `/PLAN` works on mobile keyboards that
 * auto-capitalise sentence starts.
 */
export const PLAN_PATTERN = /^\/plan\b\s+(?<topic>\S[\s\S]*?)\s*$/i;

export const planMode: StrategicModeDefinition = {
  slug: "plan",
  trigger: "strategic_plan",
  primer: PLAN_PRIMER,
  pattern: PLAN_PATTERN,
  topicRequired: true,
};
