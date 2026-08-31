#!/usr/bin/env node
/**
 * `pnpm eval:tools` - стенд вибору інструментів, тепер багатоходовий.
 *
 * Контекст. `model-eval.ts` ходить через `getLLMProvider()`, який моделює
 * одноразову генерацію тексту й нічого більше: ані інструментів, ані стріму.
 * Це покриває СИНТЕЗ відповіді, але лишає неперевіреним перший хід, а саме там
 * модель обирає один із 78 інструментів реєстру. Модель, що пише красивою
 * українською і кличе `create_habit` на питання про витрати, гірша за марну.
 *
 * Що робить. Шле продовий системний префікс плюс продовий реєстр інструментів
 * на Anthropic-сумісний ендпойнт OpenRouter (`/api/v1/messages`, «Anthropic
 * Skin») і дивиться, який `tool_use` повернувся. Перевіряє дві речі заразом:
 *   1. чи справді Skin несе 78 інструментів у форматі Anthropic, і
 *   2. чи вміє не-Claude модель обрати з них правильний.
 *
 * БАГАТОХОДОВІСТЬ. Кейс може нести сценарій `turns`: що повернути моделі як
 * `tool_result` і що вона має викликати після цього. До трьох ходів разом із
 * першим. Це закриває цілий клас хибних промахів - розвідку перед дією
 * (`find_transaction` перед `delete_transaction`), яку одноходовий стенд
 * рахував як помах у молоко, - і водночас перевіряє дорожче: чи переносить
 * модель id, здобутий із результату, в аргумент наступного виклику.
 *
 * КАСЕТИ. `--record` пише прогін у фікстуру, і далі `cassette.test.ts`
 * відтворює його безкоштовно й без мережі на кожному PR. Оцінювання в живому
 * прогоні й у відтворенні - той самий `replayCase()`, навмисно: розійдись вони,
 * зелений тест перестав би щось означати.
 *
 * Оцінювання імені інструмента навмисно поблажливе: кейс перелічує всі
 * інструменти, які розумний асистент міг би обрати, тож промах означає, що
 * модель пішла кудись не туди, а не що вона не погодилась у тонкому місці.
 * Аргументи навпаки оцінюються строго - id у write-виклику, якого моделі ніхто
 * не давав, це `FAKE`, і він гірший за `MISS`.
 *
 * Окремим блоком (`IMPLICIT_FACT_CASES`) міряється неявна памʼять: факт про
 * себе, сказаний мимохідь усередині звичайного прохання, без слова
 * «запамʼятай». Підсумок друкується рядком `implicit remember: N/M` - решта
 * ланцюга памʼяті (`profileMirror` → `ai_memories`) працює лише тоді, коли
 * модель узагалі викликала `remember`, тож це його вхідна точка.
 *
 * Usage:
 *   OPENROUTER_API_KEY=... pnpm eval:tools
 *   OPENROUTER_API_KEY=... pnpm eval:tools --record
 *   OPENROUTER_API_KEY=... pnpm eval:tools --models=anthropic/claude-haiku-4.5
 */

import { parseArgs } from "node:util";
import process from "node:process";

import { CHAT_MODEL_DEFAULTS } from "../src/env/chatModels.js";
import { SYSTEM_PREFIX, TOOLS } from "../src/modules/chat/tools.js";
import {
  ALL_CASES as CASE_SET,
  IMPLICIT_FACT_CASES,
  type ToolCase,
} from "../src/modules/chat/toolSelectionCases/index.js";
import { DATA_BLOCK } from "../src/modules/chat/toolEval/dataBlock.js";
import {
  buildManifest,
  saveCassette,
  type RecordedCase,
  type RecordedTurn,
} from "../src/modules/chat/toolEval/cassette.js";
import {
  pickedFrom,
  reachedFinalTurn,
  WRITE_ID_FIELDS,
  type EvalBlock,
} from "../src/modules/chat/toolEval/scoring.js";
import {
  replayCase,
  summarize,
  type ReplayedCase,
} from "../src/modules/chat/toolEval/replay.js";

const SKIN_URL = "https://openrouter.ai/api/v1/messages";

const ALL_CASES: ToolCase[] = [...CASE_SET, ...IMPLICIT_FACT_CASES];

/**
 * Імена кейсів неявної памʼяті - підсумок по них друкується окремим рядком.
 *
 * AI-CONTEXT: `scripts/` не входить у `include` серверного tsconfig, тож
 * typecheck цей файл не бачить. Коли кейси переїхали в `src/`, константа
 * лишилась неоголошеною, і прогін падав `ReferenceError` у фінальному блоці -
 * тобто вже ПІСЛЯ всіх оплачених викликів.
 */
const IMPLICIT_NAMES = new Set(IMPLICIT_FACT_CASES.map((c) => c.name));

interface SkinResponse {
  content?: EvalBlock[];
  error?: { message?: string };
  stop_reason?: string;
}

interface ChainResult {
  model: string;
  recorded: RecordedCase;
  latencyMs: number;
}

async function callSkin(
  apiKey: string,
  model: string,
  system: string,
  messages: unknown[],
): Promise<SkinResponse & { httpError?: string }> {
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
      messages,
    }),
  });
  const data = (await response.json()) as SkinResponse;
  if (!response.ok) {
    return {
      ...data,
      httpError: `HTTP ${response.status}: ${data?.error?.message ?? "unknown"}`,
    };
  }
  return data;
}

/**
 * Прогнати кейс до кінця його сценарію.
 *
 * Ланцюжок обривається трьома способами, і всі три означають різне:
 * сценарій вичерпано (норма), модель перестала кликати інструменти (провал
 * ненаписаних ходів - його зарахує `replayCase`), або модель одразу зробила
 * цільовий виклик (коротке замикання - не помилка, годувати її після цього
 * результатом розвідки означало б міряти діалог, якого не буває).
 */
async function runChain(
  apiKey: string,
  model: string,
  toolCase: ToolCase,
  withData: boolean,
): Promise<ChainResult> {
  const system = withData ? `${SYSTEM_PREFIX}${DATA_BLOCK}` : SYSTEM_PREFIX;
  const scenario = toolCase.turns ?? [];
  const messages: unknown[] = [{ role: "user", content: toolCase.user }];
  const turns: RecordedTurn[] = [];
  let fedResult: string | null = null;
  const t0 = Date.now();

  for (let i = 0; i <= scenario.length; i += 1) {
    let data: SkinResponse & { httpError?: string };
    try {
      data = await callSkin(apiKey, model, system, messages);
    } catch (e: unknown) {
      return {
        model,
        recorded: {
          name: toolCase.name,
          turns,
          error: e instanceof Error ? e.message : String(e),
        },
        latencyMs: Date.now() - t0,
      };
    }
    if (data.httpError) {
      return {
        model,
        recorded: { name: toolCase.name, turns, error: data.httpError },
        latencyMs: Date.now() - t0,
      };
    }

    const blocks = data.content ?? [];
    turns.push({ blocks, fedResult });

    const next = scenario[i];
    if (!next) break;
    const toolUses = blocks.filter((b) => b.type === "tool_use" && b.id);
    if (toolUses.length === 0) break;
    if (reachedFinalTurn(toolCase, pickedFrom(blocks))) break;

    messages.push({ role: "assistant", content: blocks });
    messages.push({
      role: "user",
      content: toolUses.map((b) => ({
        type: "tool_result",
        tool_use_id: b.id,
        content: next.result,
      })),
    });
    fedResult = next.result;
  }

  return {
    model,
    recorded: { name: toolCase.name, turns },
    latencyMs: Date.now() - t0,
  };
}

function mark(r: ReplayedCase): string {
  if (r.error) return "ERR";
  if (r.hallucinated.length) return "FAKE";
  return r.correct ? "  ok" : "MISS";
}

function textOf(turn: RecordedTurn | undefined): string {
  return (turn?.blocks ?? [])
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text as string)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 220);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      models: { type: "string" },
      "no-data": { type: "boolean", default: false },
      record: { type: "boolean", default: false },
      repeat: { type: "string" },
    },
  });

  const apiKey = process.env["OPENROUTER_API_KEY"] ?? "";
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY is not set — nothing to test.");
    process.exitCode = 1;
    return;
  }

  // Касета пінить sha блоку ДАНІ, тож запис без нього дав би фікстуру, яку
  // власний маніфест оголосив би протухлою тієї ж секунди.
  if (values.record && values["no-data"]) {
    console.error(
      "--record несумісний з --no-data: касета пінить sha DATA_BLOCK.",
    );
    process.exitCode = 1;
    return;
  }

  const models = (values.models ?? CHAT_MODEL_DEFAULTS.firstTurn.openrouter)
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  const multiTurn = ALL_CASES.filter((c) => (c.turns?.length ?? 0) > 0).length;
  console.log(
    `Registry: ${TOOLS.length} tools (${WRITE_ID_FIELDS.size} write-tools with id args), system prefix ${SYSTEM_PREFIX.length} chars, ДАНІ: ${values["no-data"] ? "немає" : `${DATA_BLOCK.length} chars`}, кейсів: ${ALL_CASES.length} (неявних фактів: ${IMPLICIT_FACT_CASES.length}, багатоходових: ${multiTurn})${values.record ? ", режим: ЗАПИС КАСЕТИ" : ""}\n`,
  );

  // Повтори множать той самий кейс у звіті; для касети потрібен рівно один
  // запис на кейс, інакше «яку з трьох відповідей вважати записаною» стає
  // питанням без відповіді.
  const repeats = values.record
    ? 1
    : Math.max(1, Number(values.repeat ?? 1) || 1);

  for (const model of models) {
    const replayed: ReplayedCase[] = [];
    const recorded: RecordedCase[] = [];
    const latencies: number[] = [];

    for (const toolCase of ALL_CASES) {
      for (let i = 0; i < repeats; i += 1) {
        const chain = await runChain(
          apiKey,
          model,
          toolCase,
          !values["no-data"],
        );
        const r = replayCase(toolCase, chain.recorded);
        replayed.push(r);
        latencies.push(chain.latencyMs);
        if (i === 0) recorded.push(chain.recorded);

        const picked = r.pickedByTurn
          .map(
            (p, idx) =>
              `[${idx + 1}] ${p.length ? p.join(",") : "(no tool_use)"}`,
          )
          .join("  ");
        console.log(
          `[${mark(r)}] ${model.padEnd(30)} ${toolCase.name.padEnd(28)} ${String(chain.latencyMs).padStart(6)}ms  ${r.error ?? picked}${r.shortCircuited ? "  ↦ коротке замикання" : ""}`,
        );
        if (r.hallucinated.length)
          console.log(`        ↳ вигадані id: ${r.hallucinated.join(", ")}`);
        const tail = textOf(
          chain.recorded.turns[chain.recorded.turns.length - 1],
        );
        if (!r.correct && !r.error && tail) console.log(`        ↳ ${tail}`);
      }
    }

    const summary = summarize(ALL_CASES, replayed);
    const sorted = [...latencies].sort((a, b) => a - b);
    console.log(
      "\n| Model | Correct | Invented ids | Errors | Median latency (ms) |",
    );
    console.log("| --- | --- | --- | --- | --- |");
    console.log(
      `| \`${model}\` | ${summary.correct}/${summary.total} | ${summary.invented}/${summary.total} | ${summary.errors} | ${sorted[Math.floor(sorted.length / 2)] ?? 0} |`,
    );
    console.log(
      `Багатоходові кейси: ${summary.multiTurnCorrect}/${summary.multiTurnCases}`,
    );

    // Окремо від зведеної таблиці: у ній неявні кейси розчиняються серед
    // решти, а лікуємо ми саме їх - тож число має бути видно без арифметики
    // в голові.
    const implicit = replayed.filter((r) => IMPLICIT_NAMES.has(r.name));
    console.log(
      `implicit remember: ${implicit.filter((r) => r.correct).length}/${implicit.length}  \`${model}\``,
    );

    if (values.record) {
      saveCassette({
        manifest: buildManifest(
          model,
          recorded.length,
          new Date().toISOString(),
        ),
        cases: recorded,
      });
      console.log(
        `\nКасету записано: ${recorded.length} кейсів, модель ${model}.`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
