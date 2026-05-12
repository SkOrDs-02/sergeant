/**
 * Stage 6a — parity-runner під real `openclaw@2026.5.7` SDK.
 *
 * `routeMessage(input)` віддзеркалює канонічний 3-layer routing-pipeline,
 * який runtime прокручує для founder-message-а:
 *
 *   1. **Layer 0 (`shortcut`)** — `ShortcutRouter.match()` через
 *      `src/shortcuts/router.ts`. Перший pattern-match виграє;
 *      повертається `{ slug, response, toolResults }` і agent loop НЕ
 *      запускається. Tool-executor у runtime — HTTP-проксі до server-у;
 *      тут ми injectимо deterministic stub (`createStubToolExecutor`),
 *      бо parity-харнес валідує **routing-decision** (slug + tool-call
 *      sequence), а не server-side payload.
 *   2. **Layer 1.5 (`strategic-mode`)** — `matchStrategicMode()` через
 *      `src/strategic-modes/index.ts`. Розпізнає `/plan` / `/analyze` /
 *      `/okr`; runtime mutate-ить system prompt і агент таки біжить.
 *      Parity тут перевіряє, що slug + topic + trigger співпадають з
 *      fixture-expectation-ом.
 *   3. **Layer 1.5 (`council`)** — `matchCouncil()` через
 *      `src/council/index.ts`. Розпізнає `/council <topic>`; runtime
 *      запускає 6-persona-loop driven SKILL-ом.
 *
 * Якщо жоден layer не claim-ить input — повертається `fallthrough`
 * (input йде у Layer 1 cheap classifier / Layer 2 agent). Drift-gate
 * у `parity.test.ts` забороняє щоб golden-fixture продукував
 * `fallthrough`, але runner повертає його legitimately для будь-яких
 * НЕ-фікстурних inputs (наприклад free-form chat).
 *
 * AI-CONTEXT: Це pure-deterministic-функція. Жодного HTTP / LLM /
 * stateful side-effect-а — все runtime-side state (server snapshot,
 * persona allowlist, audit row) перевіряється окремими unit-тестами у
 * `src/shortcuts/`, `src/strategic-modes/`, `src/hooks/`. Тут — лише
 * routing-decision parity.
 */

import { matchCouncil } from "../council/index.js";
import { ALL_SHORTCUTS } from "../shortcuts/index.js";
import { ShortcutRouter } from "../shortcuts/router.js";
import type {
  ShortcutDefinition,
  ToolExecutor,
  ToolResult,
} from "../shortcuts/types.js";
import {
  ALL_STRATEGIC_MODES,
  matchStrategicMode,
} from "../strategic-modes/index.js";
import type { StrategicModeDefinition } from "../strategic-modes/types.js";

/**
 * Routing-decision повернений parity-runner-ом. Discriminated union по
 * `layer` — `parity.test.ts` switch-ає на нього і робить layer-specific
 * assertions.
 */
export type ParityRouteResult =
  | {
      layer: "shortcut";
      slug: string;
      /** Tool-call order, у якому router запустив stub-executor. */
      toolCalls: string[];
      /** Final canned Markdown rendered by the shortcut. */
      response: string;
    }
  | {
      layer: "strategic-mode";
      slug: "plan" | "analyze" | "okr";
      trigger: "strategic_plan" | "strategic_analyze" | "strategic_okr";
      topic: string;
      primer: string;
    }
  | {
      layer: "council";
      topic: string;
      primer: string;
    }
  | { layer: "fallthrough" };

export interface RouteMessageOptions {
  /**
   * Кастомний catalog shortcut-ів. Default — `ALL_SHORTCUTS`. Тест-only
   * override для negative paths (e.g. pruned catalog).
   */
  shortcuts?: readonly ShortcutDefinition[];
  /**
   * Кастомний catalog strategic-mode-ів. Default — `ALL_STRATEGIC_MODES`.
   */
  strategicModes?: readonly StrategicModeDefinition[];
  /**
   * Tool-executor для Layer 0 router-а. Default — stub, що повертає
   * пустий text-block для кожного tool-name-а. Tests, які перевіряють
   * шаблонний рендеринг shortcut-а, можуть injectити full-fixture
   * executor.
   */
  toolExecutor?: ToolExecutor;
}

/**
 * Default stub-executor: для кожного `toolName` повертає мінімальний
 * `ToolResult` з пустим text-block-ом. Достатньо щоб renderer не
 * викидав exception при agg-аціях; реальний payload не перевіряється
 * у parity-харнесі.
 */
export function createStubToolExecutor(): ToolExecutor {
  return async (toolName: string): Promise<ToolResult> => ({
    content: [{ type: "text", text: `[parity-stub:${toolName}]` }],
  });
}

/**
 * Run the 3-layer routing decision на input-і founder-а.
 *
 * Контракт:
 *   - Перший layer що claim-ить — той і повертається. Решта layer-ів
 *     НЕ запускаються (mirrors runtime hook-call-order).
 *   - `fallthrough` повертається тільки якщо жоден layer не claim-ив.
 *   - Жодного throw — invalid input повертається як `fallthrough`
 *     (так само як runtime behave-ить для empty/non-string messages).
 */
export async function routeMessage(
  input: string,
  options: RouteMessageOptions = {},
): Promise<ParityRouteResult> {
  const shortcuts = options.shortcuts ?? ALL_SHORTCUTS;
  const strategicModes = options.strategicModes ?? ALL_STRATEGIC_MODES;
  const toolExecutor = options.toolExecutor ?? createStubToolExecutor();

  // ── Layer 0 — Shortcut router ─────────────────────────────────────
  const calledTools: string[] = [];
  const trackingExecutor: ToolExecutor = async (name, params) => {
    calledTools.push(name);
    return toolExecutor(name, params);
  };
  const router = new ShortcutRouter({
    shortcuts: [...shortcuts],
    executeTool: trackingExecutor,
  });
  const shortcutMatch = await router.match(input);
  if (shortcutMatch !== null) {
    return {
      layer: "shortcut",
      slug: shortcutMatch.slug,
      toolCalls: calledTools,
      response: shortcutMatch.response,
    };
  }

  // ── Layer 1.5 — Strategic mode ────────────────────────────────────
  const modeMatch = matchStrategicMode(input, strategicModes);
  if (modeMatch !== null) {
    return {
      layer: "strategic-mode",
      slug: modeMatch.slug,
      trigger: modeMatch.trigger,
      topic: modeMatch.topic,
      primer: modeMatch.primer,
    };
  }

  // ── Layer 1.5 — Council ───────────────────────────────────────────
  const councilMatch = matchCouncil(input);
  if (councilMatch !== null) {
    return {
      layer: "council",
      topic: councilMatch.topic,
      primer: councilMatch.primer,
    };
  }

  return { layer: "fallthrough" };
}
