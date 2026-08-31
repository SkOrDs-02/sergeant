#!/usr/bin/env node
/**
 * `pnpm eval:tools` — first-turn tool-selection benchmark.
 *
 * Context. `model-eval.ts` routes through `getLLMProvider()`, which models a
 * single-shot text generation and nothing else — no tools, no streaming. That
 * covers chat *synthesis* but leaves the first turn untested, and the first
 * turn is where the model picks one of 77 tools from the real registry. A
 * model that writes beautiful Ukrainian and picks `create_habit` when the user
 * asked about spending is worse than useless.
 *
 * What this does. Sends the production system prefix + the production tool
 * registry to OpenRouter's Anthropic-compatible endpoint (`/api/v1/messages`,
 * the "Anthropic Skin") and checks which `tool_use` block comes back. That
 * exercises two things at once:
 *   1. does the Skin actually carry 77 Anthropic-format tools, and
 *   2. can a non-Claude model pick correctly from them.
 *
 * Scoring is deliberately generous on the tool NAME: each case lists every tool
 * a reasonable assistant might pick, so a miss means the model went somewhere
 * unrelated, not that it disagreed on a judgement call. Arguments are scored
 * strictly instead — an id in a write-call that was never given to the model is
 * a `FAKE`, and it counts as worse than a `MISS`.
 *
 * Окремим блоком (`IMPLICIT_FACT_CASES`) міряється неявна памʼять: факт про
 * себе, сказаний мимохідь усередині звичайного прохання, без слова
 * «запамʼятай». Підсумок друкується рядком `implicit remember: N/M` — решта
 * ланцюга памʼяті (`profileMirror` → `ai_memories`) працює лише тоді, коли
 * модель узагалі викликала `remember`, тож це його вхідна точка.
 *
 * Usage:
 *   OPENROUTER_API_KEY=... pnpm eval:tools
 *   OPENROUTER_API_KEY=... pnpm eval:tools --models=anthropic/claude-haiku-4.5
 */

import { parseArgs } from "node:util";
import process from "node:process";

import { SYSTEM_PREFIX, TOOLS } from "../src/modules/chat/tools.js";
import {
  ALL_CASES as CASE_SET,
  IMPLICIT_FACT_CASES,
  type ToolCase,
} from "../src/modules/chat/toolSelectionCases/index.js";
import type { AnthropicTool } from "../src/modules/chat/toolDefs/types.js";

const SKIN_URL = "https://openrouter.ai/api/v1/messages";

/**
 * Read-only інструменти — усе інше вважаємо записом.
 *
 * AI-CONTEXT: список навмисно інвертований. Перелічити write-дієслова
 * (`create_`, `mark_`, `log_`…) виглядає природніше, але тоді новий інструмент
 * із незнайомим дієсловом мовчки випадає з перевірки — так повз неї проходять
 * `change_category`, `finish_workout`, `reorder_habits`, `forget`. При
 * інверсії незнайоме імʼя за замовчуванням перевіряється: гірше, що може
 * статися — хибне спрацювання на read-і, і воно видно у звіті.
 */
const READ_ONLY = (name: string): boolean =>
  /^(query_|aggregate_|compare_|get_|list_|find_|export_|suggest_|recall_|my_)/.test(
    name,
  ) ||
  /(_stats|_trend|_progress|_breakdown|_averages|_correlation)$/.test(name);

function idFields(tool: AnthropicTool): string[] {
  const properties = (
    tool.input_schema as { properties?: Record<string, unknown> }
  ).properties;
  return Object.keys(properties ?? {}).filter(
    (k) => k.endsWith("_id") || k.endsWith("_ids"),
  );
}

/**
 * Реєстр «write-інструмент → його поля-ідентифікатори», виведений з `TOOLS`.
 * Список навмисно не захардкоджений: реєстр росте, а забутий у списку
 * інструмент — це мовчазна дірка в перевірці, а не помилка компіляції.
 */
const WRITE_ID_FIELDS = new Map<string, string[]>(
  TOOLS.filter((t) => !READ_ONLY(t.name))
    .map((t) => [t.name, idFields(t)] as const)
    .filter(([, fields]) => fields.length > 0),
);

/**
 * Блок ДАНІ — те, що прод підставляє після `ДАНІ:` наприкінці `SYSTEM_PREFIX`.
 *
 * AI-CONTEXT: без нього стенд міряв лише одну поведінку — «чи вигадає модель id,
 * коли їй не дали нічого». Це найгостріший, але не найчастіший сценарій. У проді
 * контекст здебільшого Є, і питання інше: чи візьме модель наданий id, чи все
 * одно напише свій. Друге страшніше, бо вигаданий id при порожньому контексті
 * впаде на перевірці виконавця, а підмінений — може влучити в чужу сутність.
 *
 * Формат — правдоподібний stand-in, а не копія продового білдера: мета стенду
 * перевірити поведінку моделі, а не відтворити рядок байт-у-байт. Дата фіксована
 * навмисно, щоб прогони лишались відтворюваними.
 */
const DATA_BLOCK = `Сьогодні: 2026-07-30 (четвер), Europe/Kyiv. Тиждень рахуємо з понеділка.

[Категорії]
- cat_groceries — Продукти
- cat_food_out — Їжа поза домом
- cat_transport — Транспорт
- cat_utilities — Комуналка

[Звички]
- hab_morning — Ранкова зарядка
- hab_water — Склянка води зранку
- hab_reading — Читання 20 хвилин

[Останні транзакції]
- tx_9f21 — 2026-07-29, 120 грн, Їжа поза домом, «кава»
- tx_9f18 — 2026-07-28, 640 грн, Продукти, «АТБ»
- tx_9f02 — 2026-07-27, 95 грн, Транспорт, «метро»

[Тренування]
- Жим лежачи: 2026-07-26 — 80 кг × 5 повторень`;

/**
 * Ідентифікатори, яких моделі ніхто не давав: усе, чого немає дослівно в
 * контексті (системний промпт + блок ДАНІ + репліка користувача), модель
 * вигадала.
 */
/**
 * Правильність вибору. Три режими, бо «правильно» означає різне:
 * стриманість (не викликати нічого), повнота (виклик кожного з переліку),
 * і звичайне влучання в один із прийнятних.
 */
function scoreCase(toolCase: ToolCase, picked: string[]): boolean {
  const hit = (a: string) => picked.some((p) => p.startsWith(`${a}(`));
  if (toolCase.expectNoTool) return picked.length === 0;
  if (toolCase.requireAll) return toolCase.accept.every(hit);
  if (toolCase.acceptRefusal && picked.length === 0) return true;
  return toolCase.accept.some(hit);
}

function hallucinatedIds(blocks: AnthropicBlock[], context: string): string[] {
  const haystack = context.toLowerCase();
  const found: string[] = [];
  for (const block of blocks) {
    if (block.type !== "tool_use" || !block.name) continue;
    const fields = WRITE_ID_FIELDS.get(block.name);
    if (!fields) continue;
    const input = (block.input ?? {}) as Record<string, unknown>;
    for (const field of fields) {
      const raw = input[field];
      if (raw == null) continue;
      for (const value of Array.isArray(raw) ? raw : [raw]) {
        const asText = String(value).trim();
        if (asText && !haystack.includes(asText.toLowerCase())) {
          found.push(`${block.name}.${field}=${asText}`);
        }
      }
    }
  }
  return found;
}

const ALL_CASES: ToolCase[] = [...CASE_SET, ...IMPLICIT_FACT_CASES];

interface AnthropicBlock {
  type: string;
  name?: string;
  text?: string;
  input?: unknown;
}

interface SkinResponse {
  content?: AnthropicBlock[];
  error?: { message?: string };
  stop_reason?: string;
}

interface CaseResult {
  model: string;
  caseName: string;
  ok: boolean;
  picked: string[];
  correct: boolean;
  /** Ідентифікатори у write-викликах, яких не було в контексті. */
  hallucinated: string[];
  latencyMs: number;
  /** What the model said instead, when it skipped the tool entirely. */
  text: string;
  error?: string;
}

async function runCase(
  apiKey: string,
  model: string,
  toolCase: ToolCase,
  withData: boolean,
): Promise<CaseResult> {
  const system = withData ? `${SYSTEM_PREFIX}${DATA_BLOCK}` : SYSTEM_PREFIX;
  const t0 = Date.now();
  try {
    const response = await fetch(SKIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://sergeant.app",
        "X-Title": "Sergeant tool-selection eval",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system,
        tools: TOOLS,
        messages: [{ role: "user", content: toolCase.user }],
      }),
    });
    const data = (await response.json()) as SkinResponse;
    const latencyMs = Date.now() - t0;

    if (!response.ok) {
      return {
        model,
        caseName: toolCase.name,
        ok: false,
        picked: [],
        correct: false,
        hallucinated: [],
        latencyMs,
        text: "",
        error: `HTTP ${response.status}: ${data?.error?.message ?? "unknown"}`,
      };
    }

    // Args matter as much as the name. This harness sends no ДАНІ block, so a
    // model that confidently fills in category/habit ids it was never given is
    // hallucinating, not succeeding — the name alone would score that as a win.
    const picked = (data.content ?? [])
      .filter((b) => b.type === "tool_use" && b.name)
      .map((b) => `${b.name}(${JSON.stringify(b.input ?? {})})`);

    return {
      model,
      caseName: toolCase.name,
      ok: true,
      picked,
      correct: scoreCase(toolCase, picked),
      hallucinated: hallucinatedIds(
        data.content ?? [],
        `${system}\n${toolCase.user}`,
      ),
      latencyMs,
      text: (data.content ?? [])
        .filter((b) => b.type === "text" && b.text)
        .map((b) => b.text as string)
        .join(" ")
        .replace(/\s+/g, " ")
        .slice(0, 220),
    };
  } catch (e: unknown) {
    return {
      model,
      caseName: toolCase.name,
      ok: false,
      picked: [],
      correct: false,
      hallucinated: [],
      latencyMs: Date.now() - t0,
      text: "",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      models: { type: "string" },
      "no-data": { type: "boolean", default: false },
      repeat: { type: "string" },
    },
  });

  const apiKey = process.env["OPENROUTER_API_KEY"] ?? "";
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY is not set — nothing to test.");
    process.exitCode = 1;
    return;
  }

  const models = (
    values.models ?? "anthropic/claude-haiku-4.5,google/gemini-3.1-flash-lite"
  )
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  console.log(
    `Registry: ${TOOLS.length} tools (${WRITE_ID_FIELDS.size} write-tools with id args), system prefix ${SYSTEM_PREFIX.length} chars, ДАНІ: ${values["no-data"] ? "немає" : `${DATA_BLOCK.length} chars`}, кейсів: ${ALL_CASES.length} (неявних фактів: ${IMPLICIT_FACT_CASES.length})\n`,
  );

  const repeats = Math.max(1, Number(values.repeat ?? 1) || 1);
  const results: CaseResult[] = [];
  for (const model of models) {
    for (const toolCase of ALL_CASES) {
      for (let i = 0; i < repeats; i += 1) {
        const r = await runCase(apiKey, model, toolCase, !values["no-data"]);
        results.push(r);
        // FAKE бʼє MISS: вигаданий id у правильно вибраному інструменті — гірша
        // з двох поразок, бо доходить до виконавця й пише фантомний запис.
        const mark = r.error
          ? "ERR"
          : r.hallucinated.length
            ? "FAKE"
            : r.correct
              ? "  ok"
              : "MISS";
        const picked = r.picked.length ? r.picked.join(",") : "(no tool_use)";
        console.log(
          `[${mark}] ${model.padEnd(30)} ${toolCase.name.padEnd(28)} ${String(r.latencyMs).padStart(6)}ms  ${r.error ?? picked}`,
        );
        if (r.hallucinated.length)
          console.log(`        ↳ вигадані id: ${r.hallucinated.join(", ")}`);
        if (!r.correct && !r.error && r.text)
          console.log(`        ↳ ${r.text}`);
      }
    }
  }

  console.log(
    "\n| Model | Correct | Invented ids | Errors | Median latency (ms) |",
  );
  console.log("| --- | --- | --- | --- | --- |");
  for (const model of models) {
    const rows = results.filter((r) => r.model === model);
    const correct = rows.filter((r) => r.correct).length;
    const invented = rows.filter((r) => r.hallucinated.length > 0).length;
    const errors = rows.filter((r) => r.error).length;
    const sorted = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length / 2)] ?? 0;
    console.log(
      `| \`${model}\` | ${correct}/${rows.length} | ${invented}/${rows.length} | ${errors} | ${mid} |`,
    );
  }

  // Окремо від зведеної таблиці: у ній неявні кейси розчиняються серед решти,
  // а лікуємо ми саме їх — тож число має бути видно без арифметики в голові.
  console.log(
    "\nНеявні факти (сказані мимохідь, без «запамʼятай») — чи викликано `remember`:",
  );
  for (const model of models) {
    const rows = results.filter(
      (r) => r.model === model && IMPLICIT_NAMES.has(r.caseName),
    );
    const hit = rows.filter((r) => r.correct).length;
    console.log(`implicit remember: ${hit}/${rows.length}  \`${model}\``);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
