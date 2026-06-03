/**
 * Canonical fixtures for `POST /api/chat` (non-streaming path).
 *
 * The route lives in `apps/server/src/routes/chat.ts`, handled by
 * `apps/server/src/modules/chat/chat.ts`. The response type is
 * `ChatResponse` in `packages/api-client/src/endpoints/chat.ts`.
 *
 * This file covers the **non-streaming** JSON path only. The streaming
 * SSE path (`stream: true`) emits `data: {"t":"…"}` chunks followed by
 * `data: [DONE]` and cannot be expressed as a static JSON fixture —
 * that path has its own integration coverage in
 * `apps/server/src/modules/chat/chat.stream.test.ts`.
 *
 * Two response shapes are possible on the non-streaming path:
 *
 * 1. **Text response** — model answered directly, no tool calls.
 *    `{ text: string }`. `tool_calls` and `tool_calls_raw` are absent.
 *
 * 2. **Tool-call response** — model requested one or more tool
 *    executions. `{ text: string | null, tool_calls: [...], tool_calls_raw: [...] }`.
 *    `text` may be non-null when the model emitted partial text before
 *    the tool-use block.
 *
 * Error cases (non-200) use a generic `{ error: string }` envelope
 * emitted by the server `errorHandler` middleware.
 *
 * Named cases:
 *
 * - `textOnly` — direct assistant text, no tool calls.
 * - `textAndToolCall` — model returned both a text preamble and a single
 *   tool-use block (the client must execute the tool then POST back).
 * - `toolCallOnly` — tool-use block with no preceding text (common for
 *   data-fetch tools like `morning_briefing`).
 * - `toolResultText` — response to the second round-trip after the
 *   client submitted tool results; shape is identical to `textOnly`
 *   because the server routes through the same JSON path.
 * - `errorQuotaExceeded` — AI quota exhausted, server returns 429-style
 *   error envelope (shape same as all other error envelopes).
 * - `errorToolIterationCap` — tool-iteration hard-cap hit (422,
 *   `code: "MAX_TOOL_ITERATIONS"`).
 *
 * Closes contract slice T-2 from
 * `docs/planning/pr-plan-testing-devx-2026-05.md`.
 */

// NOTE: `packages/shared` must not import from `packages/api-client`
// (circular dependency). The inline types below mirror `ChatResponse` from
// `packages/api-client/src/endpoints/chat.ts`. They MUST stay in sync.
// When a dedicated Zod schema is added to `@sergeant/shared` for this
// response shape, replace these inline types with `z.infer<>` re-exports.

/** A single tool-call block as the server emits it in `tool_calls`. */
export interface ChatToolCallFixture {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Non-streaming success response shape for `POST /api/chat`. */
export interface ChatResponseFixture {
  text?: string | null;
  tool_calls?: ChatToolCallFixture[];
  /** Raw Anthropic content array — present when tool_calls is present. */
  tool_calls_raw?: unknown[];
  error?: string;
}

// ── Text-only fixtures ────────────────────────────────────────────────────────

export const chatTextFixtures = {
  textOnly: {
    text: "Привіт! Чим можу допомогти?",
  },
  toolResultText: {
    text: "Ось твій ранковий брифінг: витрати за тиждень — 2 340 грн, заплановані тренування — 2, звички — 6/7.",
  },
} as const satisfies Record<string, ChatResponseFixture>;

export type ChatTextFixtureCase = keyof typeof chatTextFixtures;

// ── Tool-call fixtures ────────────────────────────────────────────────────────

export const chatToolCallFixtures = {
  toolCallOnly: {
    text: null,
    tool_calls: [
      {
        id: "toolu_pact_001",
        name: "morning_briefing",
        input: {},
      },
    ],
    tool_calls_raw: [
      {
        type: "tool_use",
        id: "toolu_pact_001",
        name: "morning_briefing",
        input: {},
      },
    ],
  },
  textAndToolCall: {
    text: "Зараз подивлюсь на твої фінанси…",
    tool_calls: [
      {
        id: "toolu_pact_002",
        name: "spending_trend",
        input: { period_days: 30 },
      },
    ],
    tool_calls_raw: [
      {
        type: "text",
        text: "Зараз подивлюсь на твої фінанси…",
      },
      {
        type: "tool_use",
        id: "toolu_pact_002",
        name: "spending_trend",
        input: { period_days: 30 },
      },
    ],
  },
} as const satisfies Record<string, ChatResponseFixture>;

export type ChatToolCallFixtureCase = keyof typeof chatToolCallFixtures;

// ── Error fixtures ─────────────────────────────────────────────────────────

export const chatErrorFixtures = {
  errorQuotaExceeded: {
    error: "AI quota exceeded",
  },
  errorNoMessages: {
    error: "Немає повідомлень",
  },
} as const satisfies Record<string, ChatResponseFixture>;

export type ChatErrorFixtureCase = keyof typeof chatErrorFixtures;

// ── Tool-iteration-cap error (422) — separate shape ───────────────────────────
// The 422 response from the tool-iteration hard-cap carries `error`, `code`,
// and `detail`. This is the only chat endpoint shape that carries a structured
// `code` field alongside `error`.

export interface ChatToolCapErrorFixture {
  error: string;
  code: "MAX_TOOL_ITERATIONS";
  detail: {
    boundary: "anthropic_response" | "client_request";
    observed: number;
    max: number;
  };
}

export const chatToolCapErrorFixtures = {
  errorToolIterationCap: {
    error: "Перевищено ліміт tool-ітерацій у запиті",
    code: "MAX_TOOL_ITERATIONS",
    detail: { boundary: "anthropic_response", observed: 9, max: 8 },
  },
} as const satisfies Record<string, ChatToolCapErrorFixture>;

export type ChatToolCapErrorFixtureCase = keyof typeof chatToolCapErrorFixtures;

// ── Raw unknown views — feed to runtime parsers ──────────────────────────────

export const chatTextRawFixtures: Record<ChatTextFixtureCase, unknown> =
  chatTextFixtures;
export const chatToolCallRawFixtures: Record<ChatToolCallFixtureCase, unknown> =
  chatToolCallFixtures;
export const chatErrorRawFixtures: Record<ChatErrorFixtureCase, unknown> =
  chatErrorFixtures;
export const chatToolCapErrorRawFixtures: Record<
  ChatToolCapErrorFixtureCase,
  unknown
> = chatToolCapErrorFixtures;

// ── Self-check ────────────────────────────────────────────────────────────────

/**
 * Cheap self-check: validate the invariants documented in the api-client type
 * definitions. When a dedicated Zod schema is added for the chat response
 * shape in `@sergeant/shared`, replace the manual checks with schema parse
 * loops.
 */
export function assertChatFixturesValid(): void {
  for (const [name, fixture] of Object.entries(chatTextFixtures)) {
    if (typeof fixture.text !== "string" || fixture.text.length === 0) {
      throw new Error(
        `Contract fixture "chat.text.${name}": "text" must be a non-empty string`,
      );
    }
    if ("tool_calls" in fixture) {
      throw new Error(
        `Contract fixture "chat.text.${name}": text-only fixture must not have "tool_calls"`,
      );
    }
  }
  for (const [name, fixture] of Object.entries(
    chatToolCallRawFixtures as Record<string, ChatResponseFixture>,
  )) {
    if (!Array.isArray(fixture.tool_calls) || fixture.tool_calls.length === 0) {
      throw new Error(
        `Contract fixture "chat.toolCall.${name}": "tool_calls" must be a non-empty array`,
      );
    }
    for (const tc of fixture.tool_calls) {
      if (typeof tc.id !== "string" || tc.id.length === 0) {
        throw new Error(
          `Contract fixture "chat.toolCall.${name}": tool_call.id must be a non-empty string`,
        );
      }
      if (typeof tc.name !== "string" || tc.name.length === 0) {
        throw new Error(
          `Contract fixture "chat.toolCall.${name}": tool_call.name must be a non-empty string`,
        );
      }
    }
    if (!Array.isArray(fixture.tool_calls_raw)) {
      throw new Error(
        `Contract fixture "chat.toolCall.${name}": "tool_calls_raw" must be an array`,
      );
    }
  }
  for (const [name, fixture] of Object.entries(chatErrorFixtures)) {
    if (typeof fixture.error !== "string" || fixture.error.length === 0) {
      throw new Error(
        `Contract fixture "chat.error.${name}": "error" must be a non-empty string`,
      );
    }
  }
  for (const [name, fixture] of Object.entries(chatToolCapErrorFixtures)) {
    if (fixture.code !== "MAX_TOOL_ITERATIONS") {
      throw new Error(
        `Contract fixture "chat.toolCapError.${name}": "code" must be "MAX_TOOL_ITERATIONS"`,
      );
    }
    if (typeof fixture.detail.observed !== "number") {
      throw new Error(
        `Contract fixture "chat.toolCapError.${name}": "detail.observed" must be a number`,
      );
    }
  }
}
