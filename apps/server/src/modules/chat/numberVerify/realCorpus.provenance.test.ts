/**
 * Походження фікстур: кожна відповідь і кожен вхід корпусу мусять дослівно
 * лежати у своєму першоджерелі на вказаному рядку (ADR-0097: «виконавець
 * збирає фікстури з живих логів, не вигадує їх»).
 *
 * Звіт стенду `model-eval-2026-08-25.md` - згенерований довідник: якщо його
 * перегенерують і рядки зсунуться, цей тест червоніє з назвою відповіді, а не
 * мовчки перестає щось доводити. Файл поза чекаутом (звужений checkout) -
 * лише його перевірка пропускається; касети й `pipelines.finance.ts` лежать у
 * `apps/server` і перевіряються завжди.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CASSETTE_ANSWERS } from "./fixtures/cassetteAnswers.js";
import { EVAL_DOC_ANSWERS, EVAL_DOC_FILE } from "./fixtures/evalDocAnswers.js";
import { EVAL_DOC_SCENARIOS } from "./fixtures/evalDocScenarios.js";

const REPO_ROOT = new URL("../../../../../../", import.meta.url);
const CASSETTE_DIR = new URL(
  "../../../__fixtures__/number-verify/cassettes-2026-10-01/",
  import.meta.url,
);
const CHAT_DIR = new URL("../", import.meta.url);

const readLines = (url: URL): string[] =>
  readFileSync(fileURLToPath(url), "utf8").split("\n");

describe("стенд моделей 2026-08-25: відповіді на вказаних рядках", () => {
  const docUrl = new URL(EVAL_DOC_FILE, REPO_ROOT);
  const present = existsSync(fileURLToPath(docUrl));

  it.skipIf(!present)("кожна відповідь збігається з блоком документа", () => {
    const lines = readLines(docUrl);
    for (const a of EVAL_DOC_ANSWERS) {
      const expected = a.answer.split("\n");
      for (const line of a.lines) {
        const slice = lines.slice(line - 1, line - 1 + expected.length);
        expect({ line, text: slice.join("\n") }).toEqual({
          line,
          text: a.answer,
        });
        // Блок закривається fence-ом одразу після відповіді.
        expect(lines[line - 1 + expected.length]).toMatch(/^```/);
        // А відкрито `text`-fence-ом безпосередньо перед нею.
        expect(lines[line - 2]).toBe("```text");
      }
    }
  });

  it("документ має рівно 72 блоки відповідей у chat/analysis", () => {
    const occurrences = EVAL_DOC_ANSWERS.reduce(
      (n, a) => n + a.lines.length,
      0,
    );
    expect(occurrences).toBe(72);
  });
});

describe("сценарії стенду: питання й вивід інструмента з pipelines.finance.ts", () => {
  const file = new URL(
    "scripts/eval/pipelines.finance.ts",
    new URL("../../../../", import.meta.url),
  );
  const lines = readLines(file);

  it("кожен сценарій дослівно стоїть у діапазоні рядків, який він називає", () => {
    for (const [key, scenario] of Object.entries(EVAL_DOC_SCENARIOS)) {
      const range = /:(\d+)-(\d+)$/.exec(scenario.source);
      expect(range, key).not.toBeNull();
      const from = Number(range![1]);
      const to = Number(range![2]);
      const block = lines.slice(from - 1, to).join("\n");
      expect({ key, has: block.includes(scenario.question) }).toEqual({
        key,
        has: true,
      });
      expect({ key, has: block.includes(scenario.output) }).toEqual({
        key,
        has: true,
      });
      expect({ key, has: block.includes(`"${scenario.tool}"`) }).toEqual({
        key,
        has: true,
      });
    }
  });
});

describe("касети вибору інструментів: відповіді, питання й fedResult", () => {
  it("кожна відповідь лежить на своєму рядку касети і в тому самому ході", () => {
    for (const a of CASSETTE_ANSWERS) {
      const url = new URL(a.file, CASSETTE_DIR);
      const raw = readFileSync(fileURLToPath(url), "utf8");
      const lines = raw.split("\n");
      expect(lines[a.textLine - 1]).toContain(
        `"text": ${JSON.stringify(a.answer)}`,
      );

      const cassette = JSON.parse(raw) as {
        cases: Array<{
          name: string;
          turns: Array<{
            blocks: Array<{ type: string; text?: string }>;
            fedResult: string | null;
          }>;
        }>;
      };
      const turn = cassette.cases.find((c) => c.name === a.caseName)?.turns[
        a.turn
      ];
      expect(turn, `${a.file} ${a.caseName}`).toBeDefined();
      expect(
        turn!.blocks.some((b) => b.type === "text" && b.text === a.answer),
      ).toBe(true);
      expect(turn!.fedResult).toBe(a.fed);
      if (a.fedLine !== null) {
        expect(lines[a.fedLine - 1]).toContain(JSON.stringify(a.fed));
      }
    }
  });

  it("питання користувача стоїть на вказаному рядку файла кейсів", () => {
    for (const a of CASSETTE_ANSWERS) {
      const match = /chat\/(.+):(\d+)$/.exec(a.userSrc);
      expect(match, a.userSrc).not.toBeNull();
      const lines = readLines(new URL(match![1]!, CHAT_DIR));
      expect(lines[Number(match![2]) - 1]).toContain(a.user);
    }
  });

  it("усі відповіді з цифрами обох касет охоплено: 14 із 20 текстових блоків", () => {
    expect(CASSETTE_ANSWERS).toHaveLength(14);
    const totalTextBlocks = [
      "google-gemini-3-7-flash.json",
      "injections-google-gemini-3-7-flash.json",
    ]
      .map((f) => readFileSync(fileURLToPath(new URL(f, CASSETTE_DIR)), "utf8"))
      .map((raw) => (raw.match(/"type": "text"/g) ?? []).length)
      .reduce((a, b) => a + b, 0);
    expect(totalTextBlocks).toBe(20);
  });
});
