/**
 * `pnpm eval:tools:judge` - суддя-модель поверх ЗАПИСАНОЇ касети.
 *
 * Судить запис, а не свіжий прогін, і це навмисно: підсудна модель уже
 * оплачена один раз, тож повторний виклик нічого не додав би, крім рахунку й
 * нової недетермінованості. Судити можна скільки завгодно разів той самий
 * прогін - і саме тому розбіжності судді зі структурним суддею стосуються
 * оцінювання, а не випадкової варіації відповіді.
 *
 * Нічого не гейтить. Вихід - таблиця й список розбіжностей.
 *
 * Usage:
 *   OPENROUTER_API_KEY=... pnpm --filter @sergeant/server eval:tools:judge
 *   OPENROUTER_API_KEY=... pnpm --filter @sergeant/server eval:tools:judge -- --model=openai/gpt-5.1
 */

import { parseArgs } from "node:util";
import process from "node:process";

import { env } from "../env/env.js";
import type { ToolCase } from "../modules/chat/toolSelectionCases/index.js";
import type { JudgeVerdict } from "../modules/chat/toolEval/judge.js";

// Прод-клієнт пише лічильник витрат у БД, якої в цього CLI немає, і сипле
// `anthropic_usage_ledger_failed` на КОЖЕН виклик. Попередження правдиве й
// нешкідливе, але воно топить звіт: 81 рядок шуму на 81 рядок сенсу.
//
// Рівень логів виставляється ДО будь-якого рантаймного імпорту, тому решта
// модулів вантажиться динамічно всередині `main()`. Перша версія ставила
// змінну звичайним рядком угорі файлу і не давала нічого: ESM виконує ВСІ
// статичні імпорти до першого рядка тіла, тож логер уже був створений зі
// старим рівнем. Типи лишаються статичними - вони стираються й нічого не
// виконують.
process.env["LOG_LEVEL"] ??= "error";

async function main(): Promise<void> {
  const [
    { getLLMProvider, invokeLLM },
    cases,
    cassetteMod,
    judgeMod,
    replayMod,
  ] = await Promise.all([
    import("../lib/llm/provider.js"),
    import("../modules/chat/toolSelectionCases/index.js"),
    import("../modules/chat/toolEval/cassette.js"),
    import("../modules/chat/toolEval/judge.js"),
    import("../modules/chat/toolEval/replay.js"),
  ]);
  const { loadCassette } = cassetteMod;
  const { buildJudgePrompt, DEFAULT_JUDGE_MODEL, JUDGE_SYSTEM, parseVerdict } =
    judgeMod;
  const CASES: ToolCase[] = [...cases.ALL_CASES, ...cases.IMPLICIT_FACT_CASES];

  const { values } = parseArgs({
    options: {
      model: { type: "string" },
      subject: { type: "string" },
    },
  });

  // env-single-source (scripts/check-env-single-source.mjs): ключ читаємо
  // через Zod-валідований `env`, а не сирий `process.env`.
  if (!env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY не заданий — судити нічим.");
    process.exitCode = 1;
    return;
  }

  const subject = values.subject ?? "google/gemini-3.7-flash";
  const cassette = loadCassette(subject);
  if (!cassette) {
    console.error(
      `Немає касети для ${subject}. Запиши: pnpm --filter @sergeant/server eval:tools --record`,
    );
    process.exitCode = 1;
    return;
  }

  const judgeModel = values.model ?? DEFAULT_JUDGE_MODEL;
  // Fallback вимкнено свідомо: мовчазна підміна судді іншим провайдером
  // зробила б колонку розбіжностей брехнею (той самий урок, що B44 у
  // `scripts/eval/run.ts`).
  const provider = getLLMProvider({
    provider: "openrouter",
    disableFallback: true,
  });
  if (provider.name !== "openrouter") {
    console.error(
      `getLLMProvider() резолвнув "${provider.name}" замість openrouter — виклик пішов би в заглушку.`,
    );
    process.exitCode = 1;
    return;
  }

  const structural = new Map(
    replayMod.replayAll(CASES, cassette).map((r) => [r.name, r]),
  );
  const recorded = new Map(cassette.cases.map((c) => [c.name, c]));

  console.log(
    `Суддя: ${judgeModel}. Підсудний: ${subject} (запис ${cassette.manifest.recordedAt}). Кейсів: ${CASES.length}.\n`,
  );

  const disagreements: string[] = [];
  const silent: string[] = [];
  let ok = 0;
  let bad = 0;
  let unparsed = 0;

  for (const toolCase of CASES) {
    const rec = recorded.get(toolCase.name);
    const struct = structural.get(toolCase.name);
    if (!rec || !struct) continue;

    const result = await invokeLLM(provider, {
      model: judgeModel,
      system: JUDGE_SYSTEM,
      messages: [{ role: "user", content: buildJudgePrompt(toolCase, rec) }],
      // 120 токенів не вистачало: glm витрачає ліміт на міркування й повертає
      // ПОРОЖНІЙ текст, а звіт читав це як «суддя не дав вердикту» - 37 кейсів
      // із 81 у першому прогоні. Порожня відповідь через обрізаний ліміт і
      // мовчання судді виглядають однаково, тож запас тут дешевший за здогадки.
      maxTokens: 500,
      endpoint: "internal/tool-eval-judge",
      timeoutMs: 60_000,
    });

    const verdict: JudgeVerdict = result.ok
      ? parseVerdict(result.text)
      : { ok: null, reason: `транспорт: ${result.error ?? "невідомо"}` };

    if (verdict.ok === null) {
      unparsed += 1;
      // Кейси без вердикту друкуються поіменно з тієї ж причини, що й
      // розбіжності: число «4 з 81» у підсумку не дає з ним нічого зробити,
      // і саме так перша версія розбору ховала 37 випадків за одним рядком.
      silent.push(`${toolCase.name} — ${verdict.reason || "(порожньо)"}`);
    } else if (verdict.ok) ok += 1;
    else bad += 1;

    const agrees = verdict.ok === null || verdict.ok === struct.correct;
    const mark = verdict.ok === null ? " ??" : verdict.ok ? " ок" : "пог";
    console.log(
      `[${mark}] ${toolCase.name.padEnd(30)} структурно: ${struct.correct ? "ок " : "MISS"}  ${agrees ? "" : "◆ РОЗБІЖНІСТЬ  "}${verdict.reason}`,
    );
    if (!agrees) {
      disagreements.push(
        `${toolCase.name}: структурно ${struct.correct ? "ок" : "MISS"}, суддя ${verdict.ok ? "ок" : "погано"} — ${verdict.reason}`,
      );
    }
  }

  console.log(
    `\nСуддя: ок ${ok}, погано ${bad}, без вердикту ${unparsed}. Розбіжностей зі структурним: ${disagreements.length}.`,
  );
  if (silent.length) {
    console.log(`\nБез вердикту:`);
    for (const line of silent) console.log(`  · ${line}`);
  }
  if (disagreements.length) {
    // Розбіжність - це не помилка судді й не помилка стенду, поки її не
    // прочитали. Кожна з них або бреха евристики, або спірний кейс.
    console.log("\nРозбіжності:");
    for (const line of disagreements) console.log(`  · ${line}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
