import type { ShortcutDefinition } from "./types.js";

/**
 * `/think <question>` — the only Stage 4b shortcut that does NOT bypass
 * the LLM. It still matches first (so the router doesn't fall through to
 * the per-tool shortcuts), but the renderer returns the `ESCALATE_LAYER2`
 * sentinel. The host hook in `src/hooks/shortcut-router.ts` reads that
 * sentinel and lets the agent continue normally (pass-through), so the
 * full Layer 2 agent picks the question up.
 *
 * Stage 4c (Haiku cheap-router) will use the same sentinel to escalate
 * routine-but-non-shortcut queries.
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
