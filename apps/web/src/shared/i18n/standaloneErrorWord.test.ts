import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * §7 гайду копірайтингу, рядок «"Помилка" як standalone → не actionable»
 * (`docs/product/copy/style-guide.uk.md`). Гейт для PR-X3 (аудит 2026-09-13).
 *
 * **Чому тест, а не правило ESLint.** Правило дало б фідбек прямо в редакторі,
 * і для копії це цінніше. Але `eslint-plugin-sergeant-design/ukrainian-copy`,
 * єдиний законний дім для такої перевірки, закритий снапшот-гейтом
 * `pnpm lint:eslint-config-diff`: будь-яка зміна правила перевертає фікстури
 * під `scripts/__fixtures__/eslint-print-config/`. Це доречна ціна за зміну
 * правила, але не за прохід по копії — тож перевірка живе тут, поруч із
 * каталогом, а перенесення в `ukrainian-copy` лишається окремим боргом.
 *
 * **Що саме ловиться.** Рівно дві форми, які §7 називає standalone:
 *   - слово «Помилка» саме по собі;
 *   - префікс «Помилка: …» поверх іншого тексту.
 *
 * Форма «Помилка <що саме>» («Помилка синхронізації») НЕ ловиться навмисно:
 * §7 забороняє голе слово, а не назву того, що впало. Такі рядки часто
 * живуть у бейджах і пігулках, де другому реченню фізично немає місця; їхня
 * §3-проблема реальна, але окрема, і одним регексом не лікується.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(HERE, "../..");

/** Голе «Помилка» як увесь текст рядка. */
const EXACT = /^Помилка$/;
/** «Помилка: …» — префікс поверх чужого повідомлення. */
const PREFIX = /^Помилка\s*:/;

/**
 * Єдиний дозволений випадок, і він не є повідомленням.
 *
 * `messages.errors.generic.title` іде в `DataState.tsx` як **eyebrow** —
 * дрібний ярлик НАД справжнім текстом. Композиція там actionable цілком:
 * заголовок «Щось пішло не так», опис із причиною і кнопка «Спробувати ще».
 * §7 забороняє «Помилка» як самостійне ПОВІДОМЛЕННЯ, а не як категорійний
 * ярлик над ним. Прибирати його варто з іншої причини — він дослівно
 * повторює заголовок під собою, — але це вже питання композиції
 * `EmptyState`, не заборонена конструкція.
 */
const ALLOWED = new Set(["shared/i18n/uk.core.ts"]);

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
 * Прибирає коментарі перед пошуком. Без цього гейт ловив би власні пояснення
 * — саме цей файл і сусідні коментарі цитують заборонену форму, щоб її
 * пояснити, і це не порушення.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

interface Offender {
  file: string;
  line: number;
  text: string;
}

function findOffenders(): Offender[] {
  const offenders: Offender[] = [];
  for (const file of collectSourceFiles(WEB_SRC)) {
    const rel = relative(WEB_SRC, file);
    if (ALLOWED.has(rel)) continue;
    const src = readFileSync(file, "utf8");
    const clean = stripComments(src);
    for (const match of clean.matchAll(
      /"([^"\\]*)"|'([^'\\]*)'|`([^`\\]*)`/g,
    )) {
      const value = match[1] ?? match[2] ?? match[3];
      if (value == null) continue;
      if (!EXACT.test(value) && !PREFIX.test(value)) continue;
      offenders.push({
        file: rel,
        line: clean.slice(0, match.index).split("\n").length,
        text: value,
      });
    }
    // Шаблонний рядок з підстановкою: `Помилка: ${msg}` — саме та форма,
    // яку `friendlyChatError` віддавав до PR-X3.
    for (const match of clean.matchAll(/`Помилка\s*:/g)) {
      offenders.push({
        file: rel,
        line: clean.slice(0, match.index).split("\n").length,
        text: "`Помилка: ${…}`",
      });
    }
  }
  return offenders;
}

describe("«Помилка» як standalone (§7 гайду копірайтингу)", () => {
  it("сканер бачить достатньо файлів, щоб перевірка щось означала", () => {
    // Захист від тихого нуля: якщо обхід дерева зламається, наступний тест
    // стане зеленим на порожньому списку.
    expect(collectSourceFiles(WEB_SRC).length).toBeGreaterThan(500);
  });

  it("не вживається ні голим словом, ні префіксом «Помилка: »", () => {
    expect(
      findOffenders().map((o) => `${o.file}:${o.line} — ${o.text}`),
    ).toEqual([]);
  });
});
