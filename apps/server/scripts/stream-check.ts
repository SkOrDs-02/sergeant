#!/usr/bin/env node
/**
 * `pnpm eval:stream` — чи розуміє наш SSE-парсер потік з OpenRouter.
 *
 * Навіщо. `model-eval.ts` і `tool-selection-eval.ts` ходять НЕ-стрімінговими
 * викликами, бо `LLMProvider` стрімінг не моделює. Але прод чат стрімить, і
 * `chatStream.ts` розбирає конкретну граматику подій Anthropic. Модель може
 * ідеально відповідати одним шматком і при цьому давати потік, з якого наш
 * парсер не дістане ні тексту, ні токенів — і це видно тільки тут.
 *
 * Що саме перевіряємо (те, на чому тримається `streamOneIteration`):
 *   1. `message_start` з `usage.input_tokens` — без нього кост не рахується;
 *   2. `content_block_delta` / `text_delta` — власне текст;
 *   3. `message_delta` зі `stop_reason` і `usage.output_tokens` — Anthropic
 *      віддає вихідні токени саме тут, не в `message_start`;
 *   4. `input_json_delta` — стрімінг аргументів tool-виклику (перший тур);
 *   5. час до першого текстового дельта — SLO чату < 1.5 с.
 *
 * Побічно ловимо `cache_read_input_tokens` / `cache_creation_input_tokens`:
 * їхня поява доводить, що prompt-cache через Skin працює для цієї моделі.
 *
 * Usage: OPENROUTER_API_KEY=... pnpm eval:stream [--models=a,b]
 */

import { parseArgs } from "node:util";
import process from "node:process";

import { SYSTEM_PREFIX, TOOLS } from "../src/modules/chat/tools.js";

const SKIN_URL = "https://openrouter.ai/api/v1/messages";

interface Scenario {
  name: string;
  user: string;
  /** Передавати реєстр інструментів (перший тур) чи ні (синтез). */
  withTools: boolean;
}

const SCENARIOS: Scenario[] = [
  {
    name: "синтез (текст)",
    user: `Скільки я цього тижня витратив на каву?\n\n<tool_output tool="query_transactions">8 транзакцій, разом 960 грн, категорія «їжа поза домом»</tool_output>`,
    withTools: false,
  },
  {
    name: "перший тур (tool)",
    user: "Запиши витрату 250 грн на таксі",
    withTools: true,
  },
];

interface StreamReport {
  model: string;
  scenario: string;
  ok: boolean;
  events: Set<string>;
  deltaTypes: Set<string>;
  ttftMs: number | null;
  totalMs: number;
  textLen: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  stopReason: string | null;
  error?: string;
}

type SseEvent = {
  type?: string;
  delta?: { type?: string; text?: string; stop_reason?: string };
  message?: { usage?: Record<string, number> };
  usage?: Record<string, number>;
};

async function checkStream(
  apiKey: string,
  model: string,
  scenario: Scenario,
): Promise<StreamReport> {
  const t0 = Date.now();
  const report: StreamReport = {
    model,
    scenario: scenario.name,
    ok: false,
    events: new Set(),
    deltaTypes: new Set(),
    ttftMs: null,
    totalMs: 0,
    textLen: 0,
    inputTokens: null,
    outputTokens: null,
    cacheRead: null,
    cacheWrite: null,
    stopReason: null,
  };

  try {
    const response = await fetch(SKIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://sergeant.app",
        "X-Title": "Sergeant stream check",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        stream: true,
        system: SYSTEM_PREFIX,
        messages: [{ role: "user", content: scenario.user }],
        ...(scenario.withTools ? { tools: TOOLS } : {}),
      }),
    });

    if (!response.ok || !response.body) {
      report.error = `HTTP ${response.status}`;
      report.totalMs = Date.now() - t0;
      return report;
    }

    // Ручний розбір SSE: рамки можуть різатися посеред рядка, тому тримаємо
    // хвіст у буфері до наступного шматка — саме так робить і `chatStream.ts`.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let event: SseEvent;
        try {
          event = JSON.parse(payload) as SseEvent;
        } catch {
          continue;
        }
        if (event.type) report.events.add(event.type);
        if (event.delta?.type) report.deltaTypes.add(event.delta.type);

        if (event.type === "content_block_delta" && event.delta?.text) {
          if (report.ttftMs === null) report.ttftMs = Date.now() - t0;
          report.textLen += event.delta.text.length;
        }
        if (event.type === "message_start" && event.message?.usage) {
          const usage = event.message.usage;
          report.inputTokens = usage["input_tokens"] ?? null;
          report.cacheRead = usage["cache_read_input_tokens"] ?? null;
          report.cacheWrite = usage["cache_creation_input_tokens"] ?? null;
        }
        if (event.type === "message_delta") {
          report.stopReason = event.delta?.stop_reason ?? report.stopReason;
          report.outputTokens = event.usage?.["output_tokens"] ?? null;
        }
      }
    }

    report.totalMs = Date.now() - t0;
    // «ok» = парсер `chatStream.ts` дістав би все, на що спирається.
    report.ok =
      report.events.has("message_start") &&
      report.events.has("message_delta") &&
      report.inputTokens !== null &&
      report.outputTokens !== null &&
      (report.textLen > 0 || report.deltaTypes.has("input_json_delta"));
    return report;
  } catch (e: unknown) {
    report.totalMs = Date.now() - t0;
    report.error = e instanceof Error ? e.message : String(e);
    return report;
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { models: { type: "string" } } });
  const apiKey = process.env["OPENROUTER_API_KEY"] ?? "";
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY is not set — nothing to test.");
    process.exitCode = 1;
    return;
  }

  const models = (
    values.models ??
    "anthropic/claude-sonnet-5,anthropic/claude-haiku-4.5,google/gemini-2.5-flash-lite"
  )
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  const reports: StreamReport[] = [];
  for (const model of models) {
    for (const scenario of SCENARIOS) {
      const r = await checkStream(apiKey, model, scenario);
      reports.push(r);
      const mark = r.error ? "ERR " : r.ok ? " ok " : "FAIL";
      console.log(
        `[${mark}] ${model.padEnd(30)} ${r.scenario.padEnd(18)} ttft=${String(r.ttftMs ?? "—").padStart(5)}ms total=${String(r.totalMs).padStart(6)}ms text=${String(r.textLen).padStart(4)} in=${r.inputTokens ?? "—"} out=${r.outputTokens ?? "—"} cacheR=${r.cacheRead ?? "—"} stop=${r.stopReason ?? "—"}${r.error ? ` ${r.error}` : ""}`,
      );
      console.log(
        `        події: ${[...r.events].join(", ") || "—"} | delta: ${[...r.deltaTypes].join(", ") || "—"}`,
      );
    }
  }

  console.log("\n| Модель | Сценарій | Парсер | TTFT | Кеш |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const r of reports) {
    console.log(
      `| \`${r.model}\` | ${r.scenario} | ${r.ok ? "✅" : "❌"} | ${r.ttftMs ?? "—"} мс | ${r.cacheRead === null ? "поля немає" : `read=${r.cacheRead}`} |`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
