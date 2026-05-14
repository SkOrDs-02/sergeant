/**
 * Stage 6a — golden-conversation fixtures для parity-харнесу під real
 * `openclaw@2026.5.7` SDK.
 *
 * Сесійний recap (`docs/notes/spikes/openclaw-session-2026-05-12-recap.md`
 * § 5) сформулював задачу так: «Перетягнути legacy `parity-harness`
 * у активний test suite з grammy-vs-Gateway diff на 17 shortcuts + 3
 * strategic-modes + `/council`». Цей модуль — фікстурний catalog того
 * diff-у. Кожен запис описує:
 *
 *   - `input` — повідомлення founder-а як прийде через Telegram у
 *     `before_dispatch` / `before_agent_start` (whitespace-tolerant).
 *   - `expectedLayer` — який runtime layer плагіна МАЄ заклеймити
 *     цей input. Drift-gate: жоден фікстурний input не може silently
 *     впасти на LLM (`fallthrough`).
 *   - `expectedSlug` / `expectedTopic` / `expectedTrigger` — деталі
 *     deterministically-обчислюваного match-result-а. Те, що ми
 *     порівнюємо у parity-runner-і.
 *   - `expectedToolCalls` — для Layer 0 shortcut: впорядкований список
 *     `toolName`, які повинні запуститися (canned-Markdown payload).
 *     Пустий масив = renderer-only shortcut (e.g. `/think`).
 *   - `legacyAgent` — куди б цей самий input пішов через
 *     `tools/openclaw/src/agents/router.ts:parseCommand` (legacy grammy
 *     bot). Documents the parallel-run divergence: для більшості
 *     shortcut-ів legacy → `dispatcher` (LLM agent), Gateway → Layer 0
 *     canned (`$0` LLM cost). Це не diff-у-помилку, а очікувана дрифт-
 *     поведінка, яку Phase 6.5 manual parallel-run має validate-нути
 *     на side-by-side smoke-тестах.
 *
 * Total coverage:
 *   - 17 Layer 0 shortcuts (один canonical input на slug),
 *   -  3 strategic modes (`/plan`, `/analyze`, `/okr`),
 *   -  1 `/council` invocation,
 *   = **21 fixtures**. Plan §520 «мінімум 3» виконано з запасом.
 *
 * AI-CONTEXT: Якщо додається новий shortcut / mode / council variant —
 * додай fixture сюди ж і додай golden-coverage assertion у
 * `parity.test.ts`. Drift-gate тест ловить нестикування реального
 * `ALL_SHORTCUTS` / `ALL_STRATEGIC_MODES` каталогу з фікстурним.
 */

import { ALL_SHORTCUTS } from "../shortcuts/index.js";
import type {
  StrategicModeSlug,
  StrategicModeTrigger,
} from "../strategic-modes/types.js";

/**
 * Layer that the plugin runtime пускає input через. Прив'язано до
 * source-of-truth у `src/index.ts`:
 *
 *   - `shortcut` — Layer 0 (`before_dispatch` hook викликає
 *     `ShortcutRouter.match`); канонічна canned-Markdown відповідь.
 *   - `strategic-mode` — Layer 2 system-prompt mutation (`before_agent_start`
 *     prepends a structured primer). Agent loop ще біжить — це НЕ
 *     bypass.
 *   - `council` — `/council <topic>` спеціальний випадок: budget gate
 *     (`before_dispatch`) + COUNCIL_PRIMER (`before_agent_start`).
 *   - `fallthrough` — input не claimed жодним deterministic layer,
 *     йде у Layer 1 cheap classifier / Layer 2 agent. Parity-harness
 *     не використовує цей layer у фікстурах (drift-gate-у нема чого
 *     перевіряти на free-form), але runner-функція повертає його як
 *     legitimate result для будь-яких НЕ-фікстурних inputs.
 */
export type ParityLayer =
  | "shortcut"
  | "strategic-mode"
  | "council"
  | "fallthrough";

/**
 * Куди б цей input пішов через legacy grammy console bot. Bottom row
 * (`unknown`) означає що `parseCommand` повертає `{ agent: "unknown" }`
 * і LLM-based keyword-classifier у грамі-side би його вже маршрутизувала
 * далі. Для parity-харнесу цього достатньо — Gateway все одно перекриє
 * це Layer 0 / strategic-mode / council deterministic-ом.
 */
export type LegacyAgent =
  | "dispatcher"
  | "ops"
  | "marketing"
  | "help"
  | "unknown";

export interface ShortcutFixture {
  kind: "shortcut";
  id: string;
  description: string;
  input: string;
  expectedLayer: "shortcut";
  expectedSlug: string;
  /** Ordered list of `toolName` що мають викликатися при render-і. */
  expectedToolCalls: string[];
  /** Куди б legacy console bot маршрутизував цей input. */
  legacyAgent: LegacyAgent;
}

export interface StrategicModeFixture {
  kind: "strategic-mode";
  id: string;
  description: string;
  input: string;
  expectedLayer: "strategic-mode";
  expectedSlug: StrategicModeSlug;
  expectedTrigger: StrategicModeTrigger;
  expectedTopic: string;
  legacyAgent: LegacyAgent;
}

export interface CouncilFixture {
  kind: "council";
  id: string;
  description: string;
  input: string;
  expectedLayer: "council";
  expectedTopic: string;
  /**
   * Очікувана послідовність personas, які runtime прокручує через
   * sequential council loop (driven by `council-roundtable` SKILL.md).
   * Має точно matche-ти `COUNCIL_DEFAULT_SEQUENCE`.
   */
  expectedSequence: readonly string[];
  legacyAgent: LegacyAgent;
}

export type GoldenConversation =
  | ShortcutFixture
  | StrategicModeFixture
  | CouncilFixture;

/**
 * Helper — витягає `toolName[]` для shortcut-а з реального
 * `ShortcutDefinition.toolCalls`. Це робить фікстурні toolCalls
 * автоматично у sync з catalog-ом: якщо хтось додає / видалить
 * tool-call у `src/shortcuts/<slug>.ts`, fixture перераховується
 * без ручного редагування golden-conversations.ts.
 *
 * AI-NOTE: Ми НЕ хардкодимо tool-name-и у фікстурі, бо це задвоїло б
 * source of truth (drift hazard). Drift-gate в `parity.test.ts` додатково
 * валідує що кожен fixture має непустий `expectedSlug`, який резолвиться
 * у реальний catalog (немає orphaned fixture).
 */
function shortcutToolNames(slug: string): string[] {
  const def = ALL_SHORTCUTS.find((s) => s.slug === slug);
  if (!def) {
    throw new Error(
      `parity fixture references unknown shortcut slug "${slug}". ` +
        `Update parity/golden-conversations.ts or src/shortcuts/index.ts.`,
    );
  }
  return def.toolCalls.map((tc) => tc.toolName);
}

// ─────────────────────────────────────────────────────────────────────────
// 17 Layer 0 shortcut fixtures
// ─────────────────────────────────────────────────────────────────────────

const SHORTCUT_FIXTURES: ShortcutFixture[] = [
  {
    kind: "shortcut",
    id: "shortcut.think.slash",
    description: "/think <question> — escalation sentinel, no tools.",
    input: "/think чи переходимо на B2B у Q3?",
    expectedLayer: "shortcut",
    expectedSlug: "think",
    expectedToolCalls: shortcutToolNames("think"),
    legacyAgent: "unknown",
  },
  {
    kind: "shortcut",
    id: "shortcut.metrics.slash",
    description: "/metrics — canonical Layer 0 metrics snapshot.",
    input: "/metrics",
    expectedLayer: "shortcut",
    expectedSlug: "metrics",
    expectedToolCalls: shortcutToolNames("metrics"),
    legacyAgent: "unknown",
  },
  {
    kind: "shortcut",
    id: "shortcut.runway.uk",
    description: "Ukrainian phrase «скільки runway» — runway shortcut.",
    input: "скільки runway",
    expectedLayer: "shortcut",
    expectedSlug: "runway",
    expectedToolCalls: shortcutToolNames("runway"),
    legacyAgent: "unknown",
  },
  {
    kind: "shortcut",
    id: "shortcut.status.slash",
    description: "/status — collides with legacy dispatcher /status command.",
    input: "/status",
    expectedLayer: "shortcut",
    expectedSlug: "status",
    expectedToolCalls: shortcutToolNames("status"),
    // legacy dispatcher commands list ⊇ "status" → grammy bot би пішов
    // у LLM dispatcher; Gateway перекриває це Layer 0.
    legacyAgent: "dispatcher",
  },
  {
    kind: "shortcut",
    id: "shortcut.sentry.slash",
    description: "/sentry — Layer 0 error-monitor snapshot.",
    input: "/sentry",
    expectedLayer: "shortcut",
    expectedSlug: "sentry",
    expectedToolCalls: shortcutToolNames("sentry"),
    legacyAgent: "unknown",
  },
  {
    kind: "shortcut",
    id: "shortcut.stripe.slash",
    description: "/stripe — Layer 0 billing snapshot.",
    input: "/stripe",
    expectedLayer: "shortcut",
    expectedSlug: "stripe",
    expectedToolCalls: shortcutToolNames("stripe"),
    legacyAgent: "unknown",
  },
  {
    kind: "shortcut",
    id: "shortcut.posthog.slash",
    description: "/posthog — Layer 0 product-analytics snapshot.",
    input: "/posthog",
    expectedLayer: "shortcut",
    expectedSlug: "posthog",
    expectedToolCalls: shortcutToolNames("posthog"),
    legacyAgent: "unknown",
  },
  {
    kind: "shortcut",
    id: "shortcut.prs.slash",
    description: "/prs — Layer 0 open-PRs digest.",
    input: "/prs",
    expectedLayer: "shortcut",
    expectedSlug: "prs",
    expectedToolCalls: shortcutToolNames("prs"),
    legacyAgent: "unknown",
  },
  {
    kind: "shortcut",
    id: "shortcut.releases.slash",
    description: "/releases — Layer 0 recent-releases digest.",
    input: "/releases",
    expectedLayer: "shortcut",
    expectedSlug: "releases",
    expectedToolCalls: shortcutToolNames("releases"),
    legacyAgent: "unknown",
  },
  {
    kind: "shortcut",
    id: "shortcut.builds.slash",
    description: "/builds — Layer 0 build/deploy status.",
    input: "/builds",
    expectedLayer: "shortcut",
    expectedSlug: "builds",
    expectedToolCalls: shortcutToolNames("builds"),
    legacyAgent: "unknown",
  },
  {
    kind: "shortcut",
    id: "shortcut.workflows.slash",
    description: "/workflows — Layer 0 n8n workflow logs.",
    input: "/workflows",
    expectedLayer: "shortcut",
    expectedSlug: "workflows",
    expectedToolCalls: shortcutToolNames("workflows"),
    legacyAgent: "unknown",
  },
  {
    kind: "shortcut",
    id: "shortcut.refresh_metrics.slash",
    description: "/refresh_metrics — Layer 0 KPI refresh trigger.",
    input: "/refresh_metrics",
    expectedLayer: "shortcut",
    expectedSlug: "refresh_metrics",
    expectedToolCalls: shortcutToolNames("refresh_metrics"),
    legacyAgent: "unknown",
  },
  {
    kind: "shortcut",
    id: "shortcut.heartbeat.slash",
    description: "/heartbeat — Layer 0 health-ping.",
    input: "/heartbeat",
    expectedLayer: "shortcut",
    expectedSlug: "heartbeat",
    expectedToolCalls: shortcutToolNames("heartbeat"),
    legacyAgent: "unknown",
  },
  {
    kind: "shortcut",
    id: "shortcut.recall.slash",
    description: "/recall <query> — Layer 0 memory recall.",
    input: "/recall Q3 OKR target",
    expectedLayer: "shortcut",
    expectedSlug: "recall",
    expectedToolCalls: shortcutToolNames("recall"),
    legacyAgent: "unknown",
  },
  {
    kind: "shortcut",
    id: "shortcut.forget.slash",
    description:
      "/forget id|topic|since|query — Layer 0 founder-control AI-memory soft-delete (PR-23).",
    input: "/forget id 123",
    expectedLayer: "shortcut",
    expectedSlug: "forget",
    expectedToolCalls: shortcutToolNames("forget"),
    legacyAgent: "unknown",
  },
  {
    kind: "shortcut",
    id: "shortcut.decisions.slash",
    description: "/decisions — Layer 0 recent-decisions log.",
    input: "/decisions",
    expectedLayer: "shortcut",
    expectedSlug: "decisions",
    expectedToolCalls: shortcutToolNames("decisions"),
    legacyAgent: "unknown",
  },
  {
    kind: "shortcut",
    id: "shortcut.digest.day",
    description: "/digest day — Layer 0 daily digest (Stage 5d cron payload).",
    input: "/digest day",
    expectedLayer: "shortcut",
    expectedSlug: "digest",
    expectedToolCalls: shortcutToolNames("digest"),
    legacyAgent: "unknown",
  },
  {
    kind: "shortcut",
    id: "shortcut.remind.slash",
    description: "/remind <when> <text> — Layer 0 reminder.",
    input: "/remind tomorrow 9am follow up on Stripe payout",
    expectedLayer: "shortcut",
    expectedSlug: "remind",
    expectedToolCalls: shortcutToolNames("remind"),
    legacyAgent: "unknown",
  },
];

// ─────────────────────────────────────────────────────────────────────────
// 3 strategic-mode fixtures
// ─────────────────────────────────────────────────────────────────────────

const STRATEGIC_MODE_FIXTURES: StrategicModeFixture[] = [
  {
    kind: "strategic-mode",
    id: "strategic.plan.churn",
    description: "/plan <topic> — structured 4-step framework primer.",
    input: "/plan churn-reduction-q3",
    expectedLayer: "strategic-mode",
    expectedSlug: "plan",
    expectedTrigger: "strategic_plan",
    expectedTopic: "churn-reduction-q3",
    // legacy dispatcher list ⊇ "plan" → grammy bot би пішов у LLM
    // dispatcher; Gateway перекриває це Layer 2 primer-mutation.
    legacyAgent: "dispatcher",
  },
  {
    kind: "strategic-mode",
    id: "strategic.analyze.signups",
    description: "/analyze <anomaly> — hypothesis-tree primer.",
    input: "/analyze падіння signups вчора",
    expectedLayer: "strategic-mode",
    expectedSlug: "analyze",
    expectedTrigger: "strategic_analyze",
    expectedTopic: "падіння signups вчора",
    legacyAgent: "unknown",
  },
  {
    kind: "strategic-mode",
    id: "strategic.okr.bare",
    description: "/okr — bare slash → OKR review (topic empty is OK).",
    input: "/okr",
    expectedLayer: "strategic-mode",
    expectedSlug: "okr",
    expectedTrigger: "strategic_okr",
    expectedTopic: "",
    legacyAgent: "unknown",
  },
];

// ─────────────────────────────────────────────────────────────────────────
// 1 council fixture
// ─────────────────────────────────────────────────────────────────────────

const COUNCIL_FIXTURES: CouncilFixture[] = [
  {
    kind: "council",
    id: "council.b2b-q3",
    description:
      "/council <питання> — round-table з 6 persona-loop-ом (Locked #8).",
    input: "/council чи вводимо B2B-канал у Q3?",
    expectedLayer: "council",
    expectedTopic: "чи вводимо B2B-канал у Q3?",
    expectedSequence: ["devops", "eng", "pm", "growth", "finance", "cofounder"],
    legacyAgent: "unknown",
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Public catalogue
// ─────────────────────────────────────────────────────────────────────────

/**
 * Full parity catalogue. 22 fixtures total: 18 shortcuts + 3 modes + 1
 * council. Order is shortcut → strategic-mode → council so the test
 * names group naturally у vitest output.
 */
export const GOLDEN_CONVERSATIONS: readonly GoldenConversation[] = [
  ...SHORTCUT_FIXTURES,
  ...STRATEGIC_MODE_FIXTURES,
  ...COUNCIL_FIXTURES,
];

/** Convenience filters — used by `parity.test.ts` for grouped suites. */
export const SHORTCUT_GOLDEN_CONVERSATIONS: readonly ShortcutFixture[] =
  SHORTCUT_FIXTURES;
export const STRATEGIC_MODE_GOLDEN_CONVERSATIONS: readonly StrategicModeFixture[] =
  STRATEGIC_MODE_FIXTURES;
export const COUNCIL_GOLDEN_CONVERSATIONS: readonly CouncilFixture[] =
  COUNCIL_FIXTURES;

/**
 * Type-safe lookup. Throws if `id` не знайдено — test-time error,
 * не runtime branch.
 */
export function getGoldenConversation(id: string): GoldenConversation {
  const found = GOLDEN_CONVERSATIONS.find((c) => c.id === id);
  if (!found) {
    throw new Error(
      `parity fixture not found: "${id}". Add it to ` +
        `parity/golden-conversations.ts or remove the test reference.`,
    );
  }
  return found;
}
