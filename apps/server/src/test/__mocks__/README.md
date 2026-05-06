# `apps/server/src/test/__mocks__`

> **Last validated:** 2026-05-06 by Devin. **Next review:** 2026-08-04.
> **Status:** Active

Reusable mock-фабрики для server-тестів. Покривають AI-tool handler-и
(`apps/server/src/modules/{chat,coach,nutrition,openclaw,digest}`) і нормалізують
повторюваний boilerplate.

## `anthropic.ts` — Anthropic mock harness (PR-T08)

Замість того щоб у кожному файлі копіювати:

```ts
vi.mock("../../lib/anthropic.js", () => ({
  anthropicMessages: vi.fn(),
  anthropicMessagesStream: vi.fn(),
  extractAnthropicText: vi.fn((d) => /* копія реальної реалізації */),
}));
```

— імпортуй харнес:

```ts
import { Mock } from "vitest";
import {
  createAnthropicMockHandle,
  anthropicResponses,
  anthropicError,
} from "../../test/__mocks__/anthropic.js";

vi.mock("../../lib/anthropic.js", () => createAnthropicMockHandle());

import { anthropicMessages as _anthropicMessages } from "../../lib/anthropic.js";
const anthropicMessages = _anthropicMessages as unknown as Mock;

beforeEach(() => anthropicMessages.mockReset());

it("happy path", async () => {
  anthropicMessages.mockResolvedValueOnce(anthropicResponses.text("Привіт"));
  // ...
});

it("tool_use turn", async () => {
  anthropicMessages.mockResolvedValueOnce(
    anthropicResponses.toolUse(
      [
        {
          id: "toolu_1",
          name: "delete_transaction",
          input: { tx_id: "m_abc" },
        },
      ],
      { text: "Виконую…" },
    ),
  );
  // ...
});

it("Anthropic 5xx", async () => {
  anthropicMessages.mockRejectedValueOnce(
    anthropicError("upstream 502", { status: 502 }),
  );
  // ...
});
```

### Що дає харнес

| Експорт                       | Призначення                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `createAnthropicMockHandle()` | повертає `{ anthropicMessages, anthropicMessagesStream, extractAnthropicText, recordAnthropicUsage }` — готовий до `vi.mock`-factory. |
| `anthropicResponses.text`     | `{ response, data: { content: [text], stop_reason: end_turn } }`                                                                      |
| `anthropicResponses.toolUse`  | tool_use turn із optional leading text та custom `stop_reason`                                                                        |
| `anthropicResponses.empty`    | пустий content + `stop_reason: max_tokens` (edge case 2026-04-12 інциденту)                                                           |
| `anthropicError`              | shape сумісний із `ExternalServiceError` (`name`, `message`, `cause.status`)                                                          |
| `streamingBody`               | `ReadableStream` з SSE-frames для тестів `anthropicMessagesStream`                                                                    |

### `extractAnthropicText` дзеркалить реальну реалізацію

Дефолтна `vi.fn`-імплементація `extractAnthropicText` робить **те саме**, що
`apps/server/src/lib/anthropic.ts:548` — фільтрує `text`-блоки, join-ить через
`\n` і робить `.trim()`. Без `.trim()` тести з trailing newline-ами проходили б
у моку, але не у проді.

### Fixtures: `anthropicFixtures/`

Для тестів зі складнішими ланцюжками tool_use → tool_result → final text
зберігай fixtures у `apps/server/src/test/anthropicFixtures/<scenario>.json` і
імпортуй у тест як plain JSON. Приклади з'являться разом із PR-T09–T12
(nutrition tools).

### Покриті PR

- **PR-T08** (цей PR) — створення харнесу.
- **PR-T09–T12** — nutrition tools та openclaw tools тести (consume цей харнес).

Див. [`docs/testing/2026-05-05-tests-pr-plan.md`](../../../../../docs/testing/2026-05-05-tests-pr-plan.md).
