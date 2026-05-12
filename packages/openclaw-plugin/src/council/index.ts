/**
 * Stage 5c — `/council <питання>` round-table orchestration helpers.
 *
 * Port of the legacy reference at `src/legacy/council.ts` adapted to the
 * active plugin surface. The actual sequential multi-persona loop
 * (devops → eng → pm → growth → finance → cofounder synthesis) is
 * driven by the `council-roundtable` SKILL at
 * `ops/openclaw/skills/council-roundtable/SKILL.md`, which the
 * OpenClaw runtime loads into the agent system prompt on every turn.
 * What lives in *this* module:
 *
 *   1. `COUNCIL_DEFAULT_SEQUENCE` — canonical Locked decision #8 order
 *      (`devops → eng → pm → growth → finance → cofounder synthesis`).
 *      Single source of truth — the SKILL.md mirrors the same order in
 *      its "Default sequence" section.
 *   2. `COUNCIL_SYNTHESIS_PERSONA` + `COUNCIL_SYNTHESIS_STEP_LABEL` —
 *      the cofounder facilitator step and its audit sentinel
 *      (`metadata.councilStep = "synthesis"` distinguishes the
 *      synthesis turn from a regular cofounder reply).
 *   3. `COUNCIL_PATTERN` + `matchCouncil` — slash-prefix detection.
 *      Topic is REQUIRED; a bare `/council` is intentionally NOT
 *      claimed by the host hook so the user gets the agent's free-form
 *      reply ("дай одне речення про що радимось") rather than a
 *      silently-eaten message.
 *   4. `COUNCIL_PRIMER` — system-prompt prelude prepended to the
 *      cofounder turn when `/council <topic>` fires. Tells the agent
 *      to follow the `council-roundtable` SKILL with the captured
 *      topic; deterministic so future drift between the SKILL.md and
 *      the primer can be caught by tests.
 *   5. `createCouncilBudgetGate` — pre-flight HTTP helper that hits
 *      `/api/internal/openclaw/budget` and refuses the council session
 *      when `remainingUsd < councilUsdBudget` (default `$2.0`, Locked
 *      decision #4). Mirrors the legacy grammy bot's `/council`
 *      precondition so behaviour stays identical when the external
 *      Gateway takes over (Phase 6.5 parallel-run window).
 *
 * AI-CONTEXT: This module is a *gate* helper only. It does NOT loop
 * over personas, build prompts, or call the LLM — that responsibility
 * lives in the runtime + the SKILL. Keeping the gate pure-ish lets the
 * same helper run under either runtime (Gateway or legacy grammy
 * fallback during Phase 6.5 parity).
 */

import { OpenClawHttpError, type OpenClawHttpClient } from "../http-client.js";

// ─────────────────────────────────────────────────────────────────────────
// Sequence + audit constants (Locked decision #8)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Default sequence for `/council` without an explicit persona list.
 *
 * `cofounder` is the synthesis step — the runtime feeds specialists'
 * replies back into the cofounder turn so it produces the final
 * agreed-upon recommendation. Specialists run sequentially (not
 * parallel) for cost predictability and to share the single Anthropic
 * rate-limit budget.
 */
export const COUNCIL_DEFAULT_SEQUENCE = [
  "devops",
  "eng",
  "pm",
  "growth",
  "finance",
  "cofounder",
] as const;

export type CouncilPersona = (typeof COUNCIL_DEFAULT_SEQUENCE)[number];

/** Synthesis persona — always the last entry in the canonical sequence. */
export const COUNCIL_SYNTHESIS_PERSONA: CouncilPersona =
  COUNCIL_DEFAULT_SEQUENCE[COUNCIL_DEFAULT_SEQUENCE.length - 1]!;

/**
 * Audit-trigger label written to `openclaw_invocations.metadata.councilStep`
 * for the cofounder synthesis turn. Specialist turns use the persona
 * slug itself (e.g. `councilStep: "devops"`); only the cofounder
 * synthesis row uses this sentinel so the audit query can distinguish
 * "cofounder ran as a regular persona" vs. "cofounder ran as the
 * synthesis facilitator".
 */
export const COUNCIL_SYNTHESIS_STEP_LABEL = "synthesis";

/**
 * Audit trigger label written to `openclaw_invocations.trigger` when a
 * council session starts. Parallel to `strategic_plan` / `strategic_okr`
 * etc. from the Stage 5b catalogue.
 */
export const COUNCIL_TRIGGER = "council" as const;

// ─────────────────────────────────────────────────────────────────────────
// Slash-pattern + primer
// ─────────────────────────────────────────────────────────────────────────

/**
 * Anchor: `^/council` + word-boundary so `/councils`, `/councilbot`,
 * etc. never match. Topic capture is REQUIRED — a bare `/council` is
 * intentionally rejected by `matchCouncil` and falls through to the
 * agent so the user gets a "give me a one-line question" reply
 * instead of an empty primer-driven turn.
 *
 * Case-insensitive so `/COUNCIL` works on mobile keyboards that
 * auto-capitalise.
 */
export const COUNCIL_PATTERN = /^\/council\b\s+(?<topic>\S[\s\S]*?)\s*$/i;

/**
 * Primer prepended to the cofounder turn when `/council <topic>`
 * fires. Tells the agent to follow the `council-roundtable` SKILL and
 * names the topic verbatim so the synthesis turn at the end can echo
 * it back. The SKILL is the source of truth for the actual flow
 * (announce → 5 specialist turns → synthesis) — this primer is the
 * activation signal.
 *
 * Drift posture: this primer is *new* (no legacy console counterpart
 * — the grammy bot used a different orchestration path). When the
 * SKILL.md changes its `Default sequence` block, the
 * `council-config.test.ts` parity test (Stage 7 follow-up) will catch
 * any drift between SKILL and the constants here.
 */
export const COUNCIL_PRIMER =
  "COUNCIL_MODE: roundtable. Founder викликав `/council <питання>` — " +
  "ти cofounder-фасилітатор round-table з шести персон у фіксованому " +
  "порядку (Locked decision #8):\n" +
  "  devops → eng → pm → growth → finance → cofounder (synthesis).\n" +
  "Виконай round-table за SKILL `council-roundtable` " +
  "(`ops/openclaw/skills/council-roundtable/SKILL.md`):\n" +
  "  1) ANNOUNCE — короткий рядок `«Рада розпочата. Присутні: devops " +
  "→ eng → pm → growth → finance → cofounder synthesis.»`.\n" +
  "  2) SPECIALIST TURNS (5×, sequential) — для кожної persona з " +
  "послідовності (окрім cofounder synthesis): announce `*<display>* " +
  "думає…`, виконай agent-turn під цією persona з " +
  "`metadataExtras: { council: true, councilStep: <persona> }`, " +
  "збережи відповідь. Якщо persona-turn `ok=false` — abort з " +
  "повідомленням `«Council aborted on persona=<X>. Дивись logs / " +
  "спробуй окрему /<X>.»`.\n" +
  "  3) SYNTHESIS TURN (1×) — після всіх specialist replies: " +
  "announce `*Cofounder synthesis…*`, виконай agent-turn під " +
  "cofounder з `metadataExtras: { council: true, councilStep: " +
  '"synthesis" }`. Synthesis-prompt — оригінальне питання + специаліст-' +
  "replies + завдання сформулювати 1–3 наступні кроки.\n" +
  "Анти-патерн: не пропускай synthesis (council без неї = 5 окремих " +
  "відповідей, не agreed-upon рекомендація). Не паралель-callай " +
  "personas (rate-limit shared). Audit row для кожної turn-и " +
  "автоматично записується через `before_agent_start` hook plugin-а.";

// ─────────────────────────────────────────────────────────────────────────
// Match result
// ─────────────────────────────────────────────────────────────────────────

/**
 * Result of matching a user message against `COUNCIL_PATTERN`. Mirrors
 * the shape of `StrategicModeMatch` (Stage 5b) so future refactors
 * that fold council into a unified slash-mode catalogue have a single
 * type to switch on.
 */
export interface CouncilMatch {
  /** Audit trigger label for the invocation row. */
  trigger: typeof COUNCIL_TRIGGER;
  /** Primer prepended to the cofounder system prompt. */
  primer: string;
  /** Question payload extracted from `/council <topic>`. Non-empty. */
  topic: string;
}

/**
 * Attempt to match a user message against the council slash pattern.
 * Returns `null` when:
 *   - the input is not a string,
 *   - the trimmed message does not start with `/council<word-boundary>`,
 *   - the topic group is empty (bare `/council` — fall through to the
 *     agent, which will ask for a one-liner).
 */
export function matchCouncil(userMessage: string): CouncilMatch | null {
  if (typeof userMessage !== "string") return null;
  const trimmed = userMessage.trim();
  if (trimmed.length === 0) return null;

  const m = COUNCIL_PATTERN.exec(trimmed);
  if (!m) return null;

  const topic = (m.groups?.["topic"] ?? "").trim();
  if (topic.length === 0) return null;

  return {
    trigger: COUNCIL_TRIGGER,
    primer: COUNCIL_PRIMER,
    topic,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Pre-flight budget gate
// ─────────────────────────────────────────────────────────────────────────

/**
 * Response shape from `/api/internal/openclaw/budget`. The server's
 * `BudgetBody` validator only requires `founderUserId` (+ optional
 * `tzName`); the response carries the daily-spend rollup. We do the
 * `remainingUsd < councilUsdBudget` comparison client-side.
 */
export interface CouncilBudgetResponse {
  allowed: boolean;
  /** Total spent so far today (USD). */
  spentUsd?: number;
  /** Daily budget cap (USD) — same value for every persona. */
  budgetUsd?: number;
  /** Headroom left today = `budgetUsd - spentUsd`. */
  remainingUsd?: number;
  /** Human-readable reason when `allowed === false`. */
  reason?: string;
}

export type CouncilGateOutcome =
  | { allowed: true; remainingUsd: number; spentUsd: number; budgetUsd: number }
  | {
      allowed: false;
      /** UI-ready message — pass straight to messaging service. */
      reason: string;
      /** Distinguishes "no daily budget left at all" from "headroom < council cap". */
      kind:
        | "daily_cap_exceeded"
        | "headroom_below_council_cap"
        | "service_error";
      /** Echoed when available; useful for log / audit. */
      remainingUsd?: number;
    };

export interface CouncilBudgetGateOptions {
  http: OpenClawHttpClient;
  founderUserId: string;
  /** Required headroom (USD) before a council session is allowed to start. */
  councilUsdBudget: number;
  /** Optional IANA tz override (defaults to server-side Europe/Kyiv). */
  tzName?: string;
  /** Logger hook — injected from SDK; default no-op. */
  log?: (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    fields?: Record<string, unknown>,
  ) => void;
}

/**
 * Returns a function that, when invoked, calls `/budget` and decides
 * whether a `/council` session can proceed. Pure-ish — all side effects
 * (HTTP, log) live in injected dependencies, so tests run hermetically
 * without mocking `fetch`.
 *
 * Failure modes (all fail-closed):
 *   - server says `allowed: false` → `daily_cap_exceeded`.
 *   - `remainingUsd < councilUsdBudget` → `headroom_below_council_cap`.
 *   - HTTP error / transport error → `service_error` (do NOT start a
 *     council session with unknown budget state).
 */
export function createCouncilBudgetGate(
  opts: CouncilBudgetGateOptions,
): () => Promise<CouncilGateOutcome> {
  const log = opts.log ?? (() => undefined);

  return async () => {
    try {
      const body: Record<string, unknown> = {
        founderUserId: opts.founderUserId,
      };
      if (opts.tzName) body["tzName"] = opts.tzName;

      const response = await opts.http.post<CouncilBudgetResponse>(
        "/budget",
        body,
      );

      const spent = response.spentUsd ?? 0;
      const cap = response.budgetUsd ?? 0;
      const remaining = response.remainingUsd ?? Math.max(0, cap - spent);

      if (!response.allowed) {
        log("warn", "openclaw.council.daily_cap_exceeded", {
          spentUsd: spent,
          budgetUsd: cap,
          remainingUsd: remaining,
        });
        return {
          allowed: false,
          kind: "daily_cap_exceeded",
          reason:
            response.reason ??
            `Не вистачає бюджету: $${spent.toFixed(2)} / $${cap.toFixed(2)}. ` +
              `/council потребує мінімум $${opts.councilUsdBudget.toFixed(2)} залишку.`,
          remainingUsd: remaining,
        };
      }

      if (remaining < opts.councilUsdBudget) {
        log("warn", "openclaw.council.headroom_below_cap", {
          remainingUsd: remaining,
          councilUsdBudget: opts.councilUsdBudget,
        });
        return {
          allowed: false,
          kind: "headroom_below_council_cap",
          reason:
            `Council вимагає ≥ $${opts.councilUsdBudget.toFixed(2)} budget headroom; ` +
            `зараз залишок $${remaining.toFixed(4)}. Спробуй окрему /persona або завтра.`,
          remainingUsd: remaining,
        };
      }

      log("info", "openclaw.council.allowed", {
        remainingUsd: remaining,
        councilUsdBudget: opts.councilUsdBudget,
      });
      return {
        allowed: true,
        remainingUsd: remaining,
        spentUsd: spent,
        budgetUsd: cap,
      };
    } catch (err) {
      const detail =
        err instanceof OpenClawHttpError
          ? `Budget service unreachable (${err.status}).`
          : `Budget service error: ${
              err instanceof Error ? err.message : "unknown"
            }`;
      log("error", "openclaw.council.service_error", {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        allowed: false,
        kind: "service_error",
        reason: `${detail} Council відкладено — fail-closed.`,
      };
    }
  };
}
