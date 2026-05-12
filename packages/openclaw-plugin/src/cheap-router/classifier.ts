/**
 * HTTP-backed cheap-router classifier — POSTs to
 * `/api/internal/openclaw/classify` on the Sergeant server. Server uses
 * `lib/anthropic.ts` to call Claude Haiku and returns the parsed JSON
 * classification. `ANTHROPIC_API_KEY` never leaves the server (Hard Rule
 * #20: third-party credentials are server-side only).
 *
 * Fail-closed: any HTTP/transport failure → `{ class: "thinking" }` so
 * the hook escalates to Layer 2 instead of silently swallowing the
 * message. Logged at `error` level so observability catches regressions.
 */

import type { OpenClawHttpClient } from "../http-client.js";
import type {
  CheapRouterClassification,
  CheapRouterClassifier,
} from "./types.js";

export type CheapRouterLogger = (
  level: "debug" | "info" | "warn" | "error",
  message: string,
  fields?: Record<string, unknown>,
) => void;

export interface HttpCheapRouterClassifierOptions {
  http: OpenClawHttpClient;
  /**
   * Optional system prompt override. When supplied, plugin forwards it
   * alongside `userMessage`; server uses it instead of its embedded
   * default. Loaded once at plugin start from `cheapRouterSystemPromptPath`
   * (`ops/openclaw/cheap-router.system.md` on volume).
   */
  systemPrompt?: string | undefined;
  log?: CheapRouterLogger;
}

interface ClassifyResponse {
  class: string;
  shortcut?: string | null;
  persona?: string | null;
  params?: Record<string, unknown> | null;
  chat_response?: string | null;
}

export class HttpCheapRouterClassifier implements CheapRouterClassifier {
  private readonly http: OpenClawHttpClient;
  private readonly systemPrompt: string | undefined;
  private readonly log: CheapRouterLogger;

  constructor(opts: HttpCheapRouterClassifierOptions) {
    this.http = opts.http;
    this.systemPrompt = opts.systemPrompt;
    this.log = opts.log ?? (() => undefined);
  }

  async classify(userMessage: string): Promise<CheapRouterClassification> {
    const body: { userMessage: string; systemPrompt?: string } = {
      userMessage,
    };
    if (this.systemPrompt) body.systemPrompt = this.systemPrompt;

    try {
      const response = await this.http.post<ClassifyResponse>(
        "/classify",
        body,
      );
      return normalizeClassification(response);
    } catch (err) {
      this.log("error", "openclaw.cheap_router.classify_error", {
        error: err instanceof Error ? err.message : String(err),
      });
      // Fail-closed: escalate to Layer 2 (full agent) — better to spend
      // a Sonnet call than to silently lose the user's message.
      return { class: "thinking" };
    }
  }
}

/**
 * Normalises an arbitrary JSON response into a valid
 * `CheapRouterClassification`. Server already validates, but we defensively
 * coerce unknown `class` → `"thinking"` so a future server-side schema
 * change cannot crash the hook.
 */
function normalizeClassification(
  raw: ClassifyResponse,
): CheapRouterClassification {
  const known = new Set<string>([
    "routine_metrics",
    "routine_recall",
    "routine_remind",
    "thinking",
    "chat",
  ]);
  const cls = known.has(raw.class)
    ? (raw.class as CheapRouterClassification["class"])
    : "thinking";

  const result: CheapRouterClassification = { class: cls };
  if (typeof raw.shortcut === "string" || raw.shortcut === null) {
    result.shortcut = raw.shortcut;
  }
  if (typeof raw.persona === "string" || raw.persona === null) {
    result.persona = raw.persona;
  }
  if (
    raw.params === null ||
    (typeof raw.params === "object" && !Array.isArray(raw.params))
  ) {
    result.params = raw.params ?? null;
  }
  if (typeof raw.chat_response === "string" || raw.chat_response === null) {
    result.chat_response = raw.chat_response;
  }
  return result;
}
