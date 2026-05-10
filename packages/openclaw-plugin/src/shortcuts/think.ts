import type { ShortcutDefinition } from "../shortcut-router.js";

/**
 * `/think` shortcut — special case. Does NOT execute tools or render
 * a canned response. Instead, signals the router to escalate to Layer 2
 * (full agent) with `model_for_thinking` (Opus) and persona=cofounder.
 *
 * The shortcut router returns a special slug "think" which the
 * llm_input hook interprets as "do NOT block; let the full agent handle it
 * with thinking-tier model".
 */
export const thinkShortcut: ShortcutDefinition = {
  slug: "think",
  patterns: [/^\/think\s+(?<question>.+)$/i],
  captureGroups: ["question"],
  toolCalls: [],
  render: (_results, params) => {
    return `__ESCALATE_LAYER2__:thinking:cofounder:${params["question"] ?? ""}`;
  },
};
