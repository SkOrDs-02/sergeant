/**
 * Golden conversation fixtures для parity-харнесу.
 *
 * Plan §520: «мінімум 3 golden conversations, прогнані на старому grammy
 * bot і новому plugin: tool-calls, cost, response shape мають збігатися
 * (з толерантністю на формулювання)».
 *
 * Ці conversations покривають canonical-flow, який має працювати ідентично:
 *   1. recall_only — прості Q&A з recall_memory call.
 *   2. recall_then_decision — recall_memory → record_decision (write-tool).
 *   3. budget_blocked — викликаний коли cap уже вичерпано (negative path).
 *
 * Кожна conversation описана structured фікстурою. Parity-runner прокручує
 * грамі-side і plugin-side через однакові stub-API і порівнює:
 *   - tool-calls sequence (name + ordered)
 *   - cost rollup (sum costUsd from each tool + LLM)
 *   - final response shape (.content[].type)
 */

export interface ExpectedToolCall {
  /** Tool name, як його реєструє plugin (recall_memory, create_github_issue). */
  toolName: string;
  /** Очікувана структура аргументів (key set). Не значення — гнучко на формулювання. */
  paramKeys: string[];
  /** Server-side stubbed response (parity-runner injectить). */
  stubbedResult: {
    body: unknown;
    /** Optional cost (USD) for this tool call (used in cost rollup). */
    costUsd?: number;
  };
}

export interface GoldenConversation {
  id: string;
  description: string;
  /** Початкове повідомлення від founder-а. */
  userMessage: string;
  /** Очікувана послідовність tool-call-ів (порядок важливий). */
  expectedToolCalls: ExpectedToolCall[];
  /**
   * Додаткова cost LLM-side (Claude tokens). Грамі-side і plugin-side
   * мають рапортувати приблизно однакову — у parity test толерантно на
   * ±5% (різниця у tokenizer-ах).
   */
  expectedLlmCostUsd: number;
  /**
   * Очікувана форма final assistant response. Не текст — лише `type`
   * послідовність (text only / text + structured), щоб тест не залежав
   * від формулювання.
   */
  expectedResponseShape: Array<"text" | "structured">;
  /**
   * Очікуваний final status (success / budget_exceeded / approval_rejected
   * / iteration_cap). Більшість conversations success; budget_blocked —
   * budget_exceeded.
   */
  expectedStatus:
    | "success"
    | "error"
    | "budget_exceeded"
    | "iteration_cap"
    | "approval_rejected";
}

const RECALL_STUB_RESPONSE = {
  body: {
    memories: [
      {
        id: 1,
        content: "decided Q3 OKR target = 100 paid users",
        source: "cofounder",
        persona: "cofounder",
        topic: "okr",
        similarity: 0.91,
        createdAt: "2026-04-01T12:00:00Z",
      },
    ],
  },
  costUsd: 0.0,
};

const RECORD_DECISION_STUB_RESPONSE = {
  body: {
    decisionId: 17,
    prUrl: "https://github.com/Skords-01/sergeant/pull/9999",
    topic: "okr-q3-paid",
  },
  costUsd: 0.0,
};

export const GOLDEN_CONVERSATIONS: GoldenConversation[] = [
  {
    id: "recall_only",
    description:
      "Founder asks for past decisions; agent recalls memories and answers without write.",
    userMessage: "Який ми ставили target по Q3 paid users?",
    expectedToolCalls: [
      {
        toolName: "recall_memory",
        paramKeys: ["query"],
        stubbedResult: RECALL_STUB_RESPONSE,
      },
    ],
    expectedLlmCostUsd: 0.04,
    // Plugin tool returns {type:text, type:structured}; grammy-side bot must
    // match (it builds an equivalent ToolMessage for Anthropic). Parity тест
    // використовує lastResult.content shape — обидві сторони мають видавати
    // однакову форму.
    expectedResponseShape: ["text", "structured"],
    expectedStatus: "success",
  },
  {
    id: "recall_then_decision",
    description:
      "Founder asks for re-decision; agent recalls + emits record_decision (audit-only, не write to external).",
    userMessage:
      "Розглянемо: чи ми все ще тримаємось 100 users як target? Запиши decision якщо так.",
    expectedToolCalls: [
      {
        toolName: "recall_memory",
        paramKeys: ["query"],
        stubbedResult: RECALL_STUB_RESPONSE,
      },
      {
        toolName: "record_decision",
        paramKeys: ["topic", "context", "decision", "rationale"],
        stubbedResult: RECORD_DECISION_STUB_RESPONSE,
      },
    ],
    expectedLlmCostUsd: 0.09,
    expectedResponseShape: ["text", "structured"],
    expectedStatus: "success",
  },
  {
    id: "budget_blocked",
    description:
      "Founder asks something heavy; per-call budget gate (Hard-coded cap $0.01) blocks LLM call.",
    userMessage: "Дай повний аналіз нашої growth funnel за квартал",
    expectedToolCalls: [],
    expectedLlmCostUsd: 0,
    expectedResponseShape: ["text"],
    expectedStatus: "budget_exceeded",
  },
];

/**
 * Convenience getter для тестів — exporter, що гарантує type-safe lookup
 * по id-у. Кидає, якщо conversation не знайдено (test-time error).
 */
export function getGoldenConversation(id: string): GoldenConversation {
  const found = GOLDEN_CONVERSATIONS.find((c) => c.id === id);
  if (!found) {
    throw new Error(`Golden conversation not found: ${id}`);
  }
  return found;
}
