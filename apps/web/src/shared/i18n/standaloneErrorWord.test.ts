import { describe, it, expect } from "vitest";
import {
  collectSourceFiles,
  lineOf,
  literalsIn,
  webCopySources,
} from "./__tests__/webCopySources";

/**
 * §7 гайду копірайтингу, рядок «"Помилка" як standalone → не actionable»
 * (`docs/product/copy/style-guide.uk.md`). Гейт для PR-X3 (аудит 2026-09-13),
 * розширений хвилею D аудиту копії вебу (2026-09-23, §2.6).
 *
 * **Чому тест, а не правило ESLint.** Правило дало б фідбек прямо в редакторі,
 * і для копії це цінніше. Але `eslint-plugin-sergeant-design/ukrainian-copy`,
 * єдиний законний дім для такої перевірки, закритий снапшот-гейтом
 * `pnpm lint:eslint-config-diff`: будь-яка зміна правила перевертає фікстури
 * під `scripts/__fixtures__/eslint-print-config/`. Це доречна ціна за зміну
 * правила, але не за прохід по копії — тож перевірка живе тут, поруч із
 * каталогом, а перенесення в `ukrainian-copy` лишається окремим боргом.
 *
 * **Що саме ловиться.** Три форми:
 *   - слово «Помилка» (чи «помилка») саме по собі;
 *   - префікс «Помилка: …» поверх іншого тексту;
 *   - «Помилка <що саме>» без другого речення, коли рядок стоїть у ПОЗИЦІЇ
 *     ПОВІДОМЛЕННЯ: аргумент тоста чи сетера помилки, фолбек форматера
 *     (`formatNutritionError(err, "…")`), поле `fallback*:` / `error:`,
 *     права частина `||` / `??` після серверного тексту, гілка «інакше»
 *     після `.message ? … :`. Це фолбеки на випадок, коли сервер не дав
 *     свого тексту, тобто рівно той момент, коли людині потрібна дія, а
 *     не назва того, що впало (аудит 2026-09-23 §2.6).
 *
 * Та сама форма «Помилка <що саме>» у бейджі чи пігулці («Помилка
 * синхронізації» в `SyncStatusBadge`, `headline` у `BackfillProgressPill`)
 * НЕ ловиться навмисно: там другому реченню фізично немає місця, а §7
 * забороняє повідомлення без дії, не назву стану. Другим реченням
 * вважається будь-який текст після `.`, `!`, `?` чи `…`: «Помилка пошуку.
 * Спробуй пізніше.» проходить, «Помилка пошуку.» ні.
 */

/** Голе «Помилка» як увесь текст рядка. */
const EXACT = /^[Пп]омилка$/;
/** «Помилка: …» — префікс поверх чужого повідомлення. */
const PREFIX = /^Помилка\s*:/;
/** «Помилка <що саме>»: назва того, що впало. */
const NOUN = /^Помилка\s\S/;
/** Є друге речення, тобто є куди подіти дію. */
const HAS_NEXT_STEP = /[.!?…]\s+\S/;

/**
 * Позиції повідомлення. Перевіряються на вікні джерела ПЕРЕД літералом,
 * обрізаному по останньому `;`, `{` чи `}` (межа виразу) і зі згорнутими
 * пробілами. Сінк виклику може стояти будь-де у вікні (літерал — його
 * аргумент, хай і через тернар), решта сінків мусять стояти впритул.
 */
const MESSAGE_SINKS = [
  /(?:toast\??\.\w+\??\.?\(|\bset\w*(?:Err|Error)\w*\(|\b\w*Error\w*\??\.?\()/,
  /\b(?:fallback\w*|error)\s*:\s*$/,
  /(?:\|\||\?\?)\s*$/,
  /\.(?:message|serverMessage)\s*\?[^:]*:\s*$/,
];

function inMessagePosition(clean: string, index: number): boolean {
  const window = clean
    .slice(Math.max(0, index - 240), index)
    .replace(/\s+/g, " ");
  const cut = Math.max(
    window.lastIndexOf(";"),
    window.lastIndexOf("{"),
    window.lastIndexOf("}"),
  );
  const scope = window.slice(cut + 1);
  return MESSAGE_SINKS.some((rx) => rx.test(scope));
}

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

interface Offender {
  file: string;
  line: number;
  text: string;
}

function findOffenders(): Offender[] {
  const offenders: Offender[] = [];
  for (const { rel, clean } of webCopySources()) {
    if (ALLOWED.has(rel)) continue;
    for (const { value, index } of literalsIn(clean)) {
      const standalone = EXACT.test(value) || PREFIX.test(value);
      const nounWithoutStep =
        NOUN.test(value) &&
        !HAS_NEXT_STEP.test(value) &&
        inMessagePosition(clean, index);
      if (!standalone && !nounWithoutStep) continue;
      offenders.push({ file: rel, line: lineOf(clean, index), text: value });
    }
    // Шаблонний рядок з підстановкою: `Помилка: ${msg}` — саме та форма,
    // яку `friendlyChatError` віддавав до PR-X3.
    for (const match of clean.matchAll(/`Помилка\s*:/g)) {
      offenders.push({
        file: rel,
        line: lineOf(clean, match.index ?? 0),
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
    expect(collectSourceFiles().length).toBeGreaterThan(500);
  });

  it("не вживається ні голим словом, ні префіксом «Помилка: », ні як «Помилка <що саме>» без дії в повідомленні", () => {
    expect(findOffenders().map((o) => `${o.file}:${o.line} ${o.text}`)).toEqual(
      [],
    );
  });
});
