import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Гейт на `AI-DANGER` із `uaWeekdayDate.ts`: НЕ можна просити `weekday: "long"`
 * одним викликом разом із рештою полів дати.
 *
 * **Чому це взагалі потребує гейта, а не коментаря.** Помилку неможливо
 * зловити звичайним тестом: `toLocaleDateString("uk-UA", { weekday: "long",
 * day, month })` віддає «середа, 2 вересня» в Node і «середу, 2 вересня» в
 * Chromium — знахідний відмінок замість називного. Тобто юніти в Node і jsdom
 * зелені завжди, а на екрані текст зіпсований. Саме так «середу» доїхало до
 * геро-блока Рутини й до ранкового брифінгу, після чого й зʼявився хелпер
 * `formatUaWeekdayDate`, який робить ДВА виклики: окремо день тижня, окремо
 * дату.
 *
 * Хелпер закрив свої call-site-и, але не заборонив форму — і вона повернулась
 * у `core/lib/hubChatContext/finance.ts`, звідки їхала не на екран, а в
 * контекст моделі (знахідка PR-C3, аудит 2026-09-13). Цей тест закриває саме
 * форму, тож наступного разу її не треба буде шукати грепом.
 *
 * **Межа навмисно вузька — тільки `weekday: "long"`.** Короткий «нд» відмінка
 * не має, тож `{ weekday: "short", day, month }` безпечний; такі виклики є в
 * `RoutineCalendarPanel` і `JournalEntryCard`, і чіпати їх немає підстав.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(HERE, "../../..");

/** Виклик `Intl.DateTimeFormat` / `toLocale*String` з об'єктом опцій. */
const FORMAT_CALL =
  /(?:toLocaleDateString|toLocaleString|DateTimeFormat)\s*\(\s*[^)]*?\{([^{}]*)\}/gs;
const LONG_WEEKDAY = /weekday\s*:\s*"long"/;
const DATE_FIELD = /\b(?:day|month|year|dateStyle)\s*:/;

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "__tests__") continue;
      collectSourceFiles(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (entry.includes(".test.") || entry.includes(".stories.")) continue;
    out.push(full);
  }
  return out;
}

/**
 * Прибирає коментарі: докстрінг самого `uaWeekdayDate.ts` цитує заборонену
 * форму, щоб її пояснити, і це не порушення.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("називний відмінок дня тижня (AI-DANGER у uaWeekdayDate.ts)", () => {
  const files = collectSourceFiles(WEB_SRC);

  it("сканер бачить достатньо файлів, щоб перевірка щось означала", () => {
    expect(files.length).toBeGreaterThan(500);
  });

  it("ніхто не просить weekday: long одним викликом разом із датою", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const clean = stripComments(readFileSync(file, "utf8"));
      for (const match of clean.matchAll(FORMAT_CALL)) {
        const options = match[1] ?? "";
        if (!LONG_WEEKDAY.test(options)) continue;
        if (!DATE_FIELD.test(options)) continue;
        offenders.push(
          `${relative(WEB_SRC, file)}:${clean.slice(0, match.index).split("\n").length} — {${options.split(/\s+/).join(" ").trim()}}`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });
});
