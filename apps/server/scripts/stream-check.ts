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
 *   5. час до першого текстового дельта — SLO чату < 1.5 с;
 *   6. `--first-turn` (С-1 (а), спека `hubchat-first-turn-stream.md`): прод-
 *      форма першого ходу (`buildSystem` + `buildToolsPayload`, max_tokens
 *      1500) і час до першого `content_block_start` (саме тоді сервер шле
 *      людині ранній підпис кроку або перший текст) проти повного часу.
 *      Ціль для першого видимого знаку ратифікується після цього заміру.
 *
 * Побічно ловимо `cache_read_input_tokens` / `cache_creation_input_tokens`:
 * їхня поява доводить, що prompt-cache через Skin працює для цієї моделі.
 *
 * Ще три побічні поля (2026-11-19, квантизація від 8 біт): постачальник, якого
 * обрав шлюз (`message_start.message.provider`), списана сума (`usage.cost`,
 * якщо шлюз її віддав) і `ru=N` — кількість російських маркерів у тексті
 * відповіді (`countRussianMarkers`): саме так на `relace/fp4` ламався синтез.
 *
 * Usage: OPENROUTER_API_KEY=... pnpm eval:stream [--models=a,b]
 *        OPENROUTER_API_KEY=... pnpm eval:stream --first-turn \
 *          --models=google/gemini-3.7-flash --repeat=5
 *        OPENROUTER_API_KEY=... pnpm eval:stream --first-turn --reasoning=medium \
 *          --models=google/gemini-3.7-flash --repeat=5
 *
 * `--reasoning` (лише з `--first-turn`) додає глибину міркувань у тій самій
 * формі, що прод із заданою `CHAT_FIRST_TURN_REASONING_EFFORT`
 * (`chatReasoning.ts`). Без прапорця — прод-дефолт `low`; `medium` — стан до
 * 2026-11-18.
 */

import { parseArgs } from "node:util";
import process from "node:process";

import {
  CHAT_FIRST_TURN_REASONING_EFFORT_DEFAULT,
  CHAT_FIRST_TURN_REASONING_EFFORTS,
  type ChatFirstTurnReasoningEffort,
} from "../src/env/aiRoutingEnv.js";
import { withOpenRouterProviderPrefs } from "../src/lib/llm/openrouterDataPolicy.js";
import { firstTurnReasoningFields } from "../src/modules/chat/chatReasoning.js";
import { SYSTEM_PREFIX, TOOLS } from "../src/modules/chat/tools.js";
import {
  buildSystem,
  buildToolsPayload,
} from "../src/modules/chat/promptCache.js";

const SKIN_URL = "https://openrouter.ai/api/v1/messages";

/**
 * Російські літери, яких немає в українській, і кілька частих слів. Груба
 * перевірка для заміру, не детектор мови: ненуль означає «читай текст».
 */
const RUSSIAN_MARKERS =
  /[ыэёъЫЭЁЪ]|(?<![\p{L}])(?:что|это|его|если|который|только|также|сейчас|нужно|когда)(?![\p{L}])/giu;

function countRussianMarkers(text: string): number {
  return text.match(RUSSIAN_MARKERS)?.length ?? 0;
}

interface Scenario {
  name: string;
  user: string;
  /** Передавати реєстр інструментів (перший тур) чи ні (синтез). */
  withTools: boolean;
  /** Прод-форма першого ходу: system і tools тими самими функціями, що `chat.ts`. */
  prodFirstTurn?: boolean;
}

/**
 * Перший хід у прод-формі: питання, на які модель відповідає і текстом, і
 * викликом інструмента. Контекст — короткий синтетичний знімок без
 * персональних даних.
 */
const FIRST_TURN_CONTEXT =
  "[ДАНІ]\nФінік: витрати цього тижня 3 120 грн, найбільша категорія «продукти».\nРутина: 3 звички на сьогодні.";
const FIRST_TURN_SCENARIOS: Scenario[] = [
  {
    name: "1-й хід: пошук",
    user: "Знайди мою останню покупку в Сільпо",
    withTools: true,
    prodFirstTurn: true,
  },
  {
    name: "1-й хід: запис",
    user: "Запиши витрату 250 грн на таксі",
    withTools: true,
    prodFirstTurn: true,
  },
  {
    name: "1-й хід: текст",
    user: "Як мені менше витрачати на продукти?",
    withTools: true,
    prodFirstTurn: true,
  },
];

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
  /** Глибина міркувань прогону, фактичне значення в запиті (лише `--first-turn`). */
  reasoning: string;
  ok: boolean;
  events: Set<string>;
  deltaTypes: Set<string>;
  ttftMs: number | null;
  /** Перший `content_block_start` будь-якого типу: перший видимий кадр сервера. */
  firstBlockMs: number | null;
  /** Перший `content_block_start` типу `tool_use`: ранній підпис кроку. */
  firstToolMs: number | null;
  totalMs: number;
  textLen: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  stopReason: string | null;
  /** Постачальник, якого обрав шлюз (`message_start.message.provider`). */
  provider: string | null;
  /** `usage.cost` зі стріму, якщо шлюз його віддав. */
  costUsd: number | null;
  /** Російські маркери в тексті відповіді (`countRussianMarkers`). */
  russian: number;
  error?: string;
}

type SseEvent = {
  type?: string;
  content_block?: { type?: string };
  delta?: { type?: string; text?: string; stop_reason?: string };
  message?: { usage?: Record<string, number>; provider?: string };
  usage?: Record<string, number>;
};

async function checkStream(
  apiKey: string,
  model: string,
  scenario: Scenario,
  reasoning: ChatFirstTurnReasoningEffort,
): Promise<StreamReport> {
  const t0 = Date.now();
  const report: StreamReport = {
    model,
    scenario: scenario.name,
    // Глибина йде лише в прод-форму першого ходу; інші сценарії без поля.
    reasoning: scenario.prodFirstTurn ? reasoning : "—",
    ok: false,
    events: new Set(),
    deltaTypes: new Set(),
    ttftMs: null,
    firstBlockMs: null,
    firstToolMs: null,
    totalMs: 0,
    textLen: 0,
    inputTokens: null,
    outputTokens: null,
    cacheRead: null,
    cacheWrite: null,
    stopReason: null,
    provider: null,
    costUsd: null,
    russian: 0,
  };
  let text = "";

  try {
    const response = await fetch(SKIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://sergeant.app",
        "X-Title": "Sergeant stream check",
      },
      // `withOpenRouterProviderPrefs` — той самий `provider`, що додає продовий
      // транспорт `lib/anthropic.ts`: замір іде тим самим маршрутом шлюзу.
      body: JSON.stringify(
        withOpenRouterProviderPrefs(
          scenario.prodFirstTurn
            ? {
                model,
                max_tokens: 1500,
                stream: true,
                system: buildSystem(FIRST_TURN_CONTEXT, undefined, true),
                tools: buildToolsPayload(model, null, true),
                messages: [{ role: "user", content: scenario.user }],
                ...firstTurnReasoningFields(reasoning),
              }
            : {
                model,
                max_tokens: 1000,
                stream: true,
                system: SYSTEM_PREFIX,
                messages: [{ role: "user", content: scenario.user }],
                ...(scenario.withTools ? { tools: TOOLS } : {}),
              },
        ),
      ),
    });

    if (!response.ok || !response.body) {
      // Тіло помилки коротке; перших 200 знаків досить, щоб бачити причину 404.
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      report.error = `HTTP ${response.status} ${detail}`;
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

        if (event.type === "content_block_start") {
          const at = Date.now() - t0;
          if (report.firstBlockMs === null) report.firstBlockMs = at;
          if (
            event.content_block?.type === "tool_use" &&
            report.firstToolMs === null
          ) {
            report.firstToolMs = at;
          }
        }
        if (event.type === "content_block_delta" && event.delta?.text) {
          if (report.ttftMs === null) report.ttftMs = Date.now() - t0;
          report.textLen += event.delta.text.length;
          text += event.delta.text;
        }
        if (event.type === "message_start" && event.message?.usage) {
          const usage = event.message.usage;
          report.inputTokens = usage["input_tokens"] ?? null;
          report.cacheRead = usage["cache_read_input_tokens"] ?? null;
          report.cacheWrite = usage["cache_creation_input_tokens"] ?? null;
        }
        if (event.type === "message_start" && event.message?.provider) {
          report.provider = event.message.provider;
        }
        if (event.type === "message_delta") {
          report.stopReason = event.delta?.stop_reason ?? report.stopReason;
          report.outputTokens = event.usage?.["output_tokens"] ?? null;
          const cost = event.usage?.["cost"];
          if (typeof cost === "number") report.costUsd = cost;
        }
      }
    }

    report.totalMs = Date.now() - t0;
    report.russian = countRussianMarkers(text);
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
  const { values } = parseArgs({
    options: {
      models: { type: "string" },
      "first-turn": { type: "boolean" },
      repeat: { type: "string" },
      reasoning: { type: "string" },
    },
  });
  const firstTurn = values["first-turn"] === true;
  let reasoning: ChatFirstTurnReasoningEffort =
    CHAT_FIRST_TURN_REASONING_EFFORT_DEFAULT;
  if (values.reasoning !== undefined) {
    const effort = values.reasoning.trim().toLowerCase();
    if (!firstTurn) {
      console.error("--reasoning діє лише з --first-turn.");
      process.exitCode = 1;
      return;
    }
    if (
      !(CHAT_FIRST_TURN_REASONING_EFFORTS as readonly string[]).includes(effort)
    ) {
      console.error(
        `--reasoning=${values.reasoning}: допустимо ${CHAT_FIRST_TURN_REASONING_EFFORTS.join(", ")}.`,
      );
      process.exitCode = 1;
      return;
    }
    reasoning = effort as ChatFirstTurnReasoningEffort;
  }
  const repeat = Math.max(1, Number.parseInt(values.repeat ?? "1", 10) || 1);
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
    for (const scenario of firstTurn ? FIRST_TURN_SCENARIOS : SCENARIOS) {
      for (let run = 0; run < repeat; run++) {
        const r = await checkStream(apiKey, model, scenario, reasoning);
        reports.push(r);
        const mark = r.error ? "ERR " : r.ok ? " ok " : "FAIL";
        console.log(
          `[${mark}] ${model.padEnd(30)} ${r.scenario.padEnd(18)} ttft=${String(r.ttftMs ?? "—").padStart(5)}ms total=${String(r.totalMs).padStart(6)}ms text=${String(r.textLen).padStart(4)} in=${r.inputTokens ?? "—"} out=${r.outputTokens ?? "—"} cacheR=${r.cacheRead ?? "—"} stop=${r.stopReason ?? "—"} provider=${r.provider ?? "—"} ru=${r.russian} cost=${r.costUsd ?? "—"}${r.error ? ` ${r.error}` : ""}`,
        );
        console.log(
          `        події: ${[...r.events].join(", ") || "—"} | delta: ${[...r.deltaTypes].join(", ") || "—"} | block=${r.firstBlockMs ?? "—"}ms tool=${r.firstToolMs ?? "—"}ms`,
        );
      }
    }
  }

  if (firstTurn) printFirstTurnSummary(reports);

  const spent = reports.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
  const ru = reports.filter((r) => r.russian > 0).length;
  console.log(
    `\nВідповідей з російськими маркерами: ${ru} з ${reports.length}; usage.cost разом: $${spent.toFixed(6)}`,
  );

  console.log("\n| Модель | Сценарій | Парсер | TTFT | Кеш |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const r of reports) {
    console.log(
      `| \`${r.model}\` | ${r.scenario} | ${r.ok ? "✅" : "❌"} | ${r.ttftMs ?? "—"} мс | ${r.cacheRead === null ? "поля немає" : `read=${r.cacheRead}`} |`,
    );
  }
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]!
    : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/**
 * Зведення для спеки `hubchat-first-turn-stream.md`: перший видимий кадр
 * (перший `content_block_start`) проти повної відповіді, медіана й максимум.
 */
function printFirstTurnSummary(reports: StreamReport[]): void {
  console.log(
    "\n| Модель | Глибина | Сценарій | n | помилок | перший кадр, медіана / макс | ранній підпис (tool), медіана | повна відповідь, медіана / макс |",
  );
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
  const groups = new Map<string, StreamReport[]>();
  for (const r of reports) {
    const key = `${r.model}\u0000${r.scenario}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const rs of groups.values()) {
    const ok = rs.filter((r) => !r.error && r.ok);
    const block = ok.map((r) => r.firstBlockMs).filter((v) => v !== null);
    const tool = ok.map((r) => r.firstToolMs).filter((v) => v !== null);
    const total = ok.map((r) => r.totalMs);
    const fmt = (v: number | null): string => (v === null ? "—" : `${v} мс`);
    console.log(
      `| \`${rs[0]!.model}\` | ${rs[0]!.reasoning} | ${rs[0]!.scenario} | ${rs.length} | ${rs.length - ok.length} | ${fmt(median(block))} / ${fmt(block.length ? Math.max(...block) : null)} | ${fmt(median(tool))} | ${fmt(median(total))} / ${fmt(total.length ? Math.max(...total) : null)} |`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
