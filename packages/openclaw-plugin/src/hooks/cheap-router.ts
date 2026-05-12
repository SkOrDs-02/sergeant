/**
 * Stage 4c — Layer 1 cheap-router hook (`before_dispatch`).
 *
 * Runs AFTER `createShortcutRouterHook` (Layer 0). Layer 0 already claimed
 * the message if it matched a regex shortcut OR explicitly escalated
 * `/think` to Layer 2 by returning `{ handled: false }`. Layer 1 covers
 * the broad middle: a message we don't recognise that may still be cheap
 * to answer with one Haiku call (~$0.0002).
 *
 * Decision tree (after one classifier call):
 *
 *   - `class = routine_*` AND `shortcut` matches a known slug
 *     → synthesise `/${slug}` message, dispatch through `ShortcutRouter`,
 *       return `{ handled: true, text: <rendered> }`.
 *   - `class = chat` AND `chat_response` is non-empty
 *     → return `{ handled: true, text: <chat_response> }`. Haiku already
 *       has the reply, no Layer 2 call needed.
 *   - `class = thinking` OR anything else
 *     → return `{ handled: false }`. Runtime continues to the agent
 *       (Layer 2). The agent receives Haiku's optional `persona`
 *       suggestion via the existing `before_agent_start` audit hook.
 *
 * Skip optimisation — `shouldSkipClassifier(content)`:
 *   - Empty / whitespace → fall through (`{ handled: false }`).
 *   - Slash commands (`/foo`) → Layer 0 already had a chance; skip Haiku
 *     to avoid a wasted classification when the user typed an unknown
 *     slash command (rare, but the call is wasted).
 *
 * Failure modes:
 *   - Classifier throws → `HttpCheapRouterClassifier` returns
 *     `{ class: "thinking" }` (fail-closed); hook returns `handled: false`.
 *   - Shortcut execution throws → `ShortcutRouter.match` already wraps
 *     tool errors as text blocks, so render still succeeds. Any further
 *     error → log + return `{ handled: false }`.
 */

import type {
  PluginHookBeforeDispatchEvent,
  PluginHookBeforeDispatchResult,
} from "openclaw/plugin-sdk/plugin-entry";

import type { CheapRouterClassifier } from "../cheap-router/types.js";
import { ShortcutRouter } from "../shortcuts/router.js";
import type { ShortcutDefinition, ToolExecutor } from "../shortcuts/types.js";

export type CheapRouterHookLogger = (
  level: "debug" | "info" | "warn" | "error",
  message: string,
  fields?: Record<string, unknown>,
) => void;

export interface CheapRouterHookOptions {
  classifier: CheapRouterClassifier;
  /**
   * Shortcuts catalogue. Reused from Layer 0 — Haiku suggests a `shortcut`
   * slug (e.g. "metrics", "stripe") and the hook looks it up here to
   * execute the corresponding tool sequence.
   */
  shortcuts: ShortcutDefinition[];
  executeTool: ToolExecutor;
  log?: CheapRouterHookLogger;
}

/**
 * Returns `true` if the hook should skip the Haiku classifier and fall
 * through to the agent. Exported so unit tests can assert the predicate
 * directly without a full event payload.
 */
export function shouldSkipClassifier(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length === 0) return true;
  // Layer 0 had its shot at slash commands. Unknown ones still hit the
  // agent — no need to burn a Haiku call to confirm.
  if (trimmed.startsWith("/")) return true;
  return false;
}

export function createCheapRouterHook(
  opts: CheapRouterHookOptions,
): (
  event: PluginHookBeforeDispatchEvent,
) => Promise<PluginHookBeforeDispatchResult> {
  const log = opts.log ?? (() => undefined);
  const shortcutBySlug = new Map<string, ShortcutDefinition>();
  for (const s of opts.shortcuts) shortcutBySlug.set(s.slug, s);

  const shortcutRouter = new ShortcutRouter({
    shortcuts: opts.shortcuts,
    executeTool: opts.executeTool,
    log,
  });

  return async (event) => {
    const content = typeof event.content === "string" ? event.content : "";
    if (shouldSkipClassifier(content)) {
      return { handled: false };
    }

    let classification;
    try {
      classification = await opts.classifier.classify(content);
    } catch (err) {
      log("error", "openclaw.cheap_router.classifier_throw", {
        error: err instanceof Error ? err.message : String(err),
      });
      return { handled: false };
    }

    log("debug", "openclaw.cheap_router.classified", {
      class: classification.class,
      shortcut: classification.shortcut ?? undefined,
      persona: classification.persona ?? undefined,
      channel: event.channel,
      sessionKey: event.sessionKey,
    });

    // Routine → dispatch the suggested shortcut.
    if (
      classification.class.startsWith("routine_") &&
      classification.shortcut
    ) {
      const slug = classification.shortcut;
      const def = shortcutBySlug.get(slug);
      if (def) {
        try {
          const match = await shortcutRouter.match(`/${slug}`);
          if (match) {
            log("info", "openclaw.cheap_router.routed", {
              class: classification.class,
              slug: match.slug,
              channel: event.channel,
              responseChars: match.response.length,
            });
            return { handled: true, text: match.response };
          }
        } catch (err) {
          log("error", "openclaw.cheap_router.shortcut_error", {
            slug,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else {
        log("warn", "openclaw.cheap_router.unknown_shortcut", { slug });
      }
    }

    // Chat → reply with Haiku's own answer; no further LLM round-trip.
    if (classification.class === "chat" && classification.chat_response) {
      log("info", "openclaw.cheap_router.chat_reply", {
        channel: event.channel,
        responseChars: classification.chat_response.length,
      });
      return { handled: true, text: classification.chat_response };
    }

    // Thinking (or unrecognised routine without resolved shortcut) →
    // escalate to Layer 2 by falling through.
    return { handled: false };
  };
}
