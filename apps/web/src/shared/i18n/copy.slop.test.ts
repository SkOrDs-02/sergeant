// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Гейт тону застосунку: кириличний рядковий літерал, що закінчується окликом.
 *
 * Шукає по всьому `src`, а не лише в `uk.*.ts`: святкова копія
 * `CelebrationModal` («Ти справжня легенда!») пережила два копі-аудити саме
 * тому, що жила в компоненті, а греп дивився в локалі (аудит анти-слопу
 * 2026-09-23, P1-3 і §6). Поріг нуль: оклик у продуктовій копії є
 * регістром згенерованого тексту, а факт із числом каже те саме тихіше.
 */
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const CYRILLIC = /[А-Яа-яІіЇїЄєҐґ]/;
const LITERAL = /"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(entry.name)) return [];
    if (/\.(test|stories)\.tsx?$/.test(entry.name)) return [];
    return [full];
  });
}

function exclamations(file: string): string[] {
  const hits: string[] = [];
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (!line.includes("!") || !CYRILLIC.test(line)) return;
      if (/^(\/\/|\*|\/\*)/.test(line.trim())) return;
      for (const m of line.matchAll(LITERAL)) {
        const body = m[1] ?? m[2] ?? m[3] ?? "";
        if (CYRILLIC.test(body) && body.trimEnd().endsWith("!")) {
          hits.push(`${path.relative(SRC, file)}:${i + 1}: ${m[0]}`);
        }
      }
    });
  return hits;
}

describe("копія застосунку без окликів", () => {
  it("жоден кириличний рядок у src не закінчується «!»", () => {
    const hits = sourceFiles(SRC).flatMap(exclamations);
    expect(hits).toEqual([]);
    // Окремо тест іде ~3 с, але синхронно читає ~1 400 файлів, і поруч із
    // паралельними воркерами на слабкій машині 60 с уже бракувало.
  }, 180_000);
});

/**
 * Густинний гейт (анти-слоп раунд 4, A1/A4, рішення власника Q3). Зовнішній
 * консенсус жовтня 2026 (Pew, Wikipedia AICATCH, Graphite): ознака слопу це
 * щільність маркерів на сотню слів, а не окремий символ. Міряємо те саме,
 * що лендінг у `apps/landing/src/copy.slop.test.ts`, на трьох user-facing
 * поверхнях, які жили поза всіма гейтами, бо копія в них не в `uk.*.ts`:
 * «Що нового», порожні стани модулів і перший крок хаба.
 *
 * Що саме ловиться й чому:
 *  - антитеза «не X, а Y» вище 0,3 на 100 слів (стеля лендінгу): «Що
 *    нового» мало 1,38;
 *  - заява про правду замість її показу («насправді», «покаже правду»,
 *    «реальну/чесну картину»): style-guide §7, чотири порожні стани;
 *  - префікс-підказка «Порада:» / «Увага:» / «Важливо:» з лампочкою: «Tip:»
 *    генераторів.
 */
const L = "[а-яіїєґА-ЯІЇЄҐʼ]";
// Лише негативний паралелізм («X, а не Y», «не X, а Y»), той самий, що
// Pew рахує як «not just X, but Y». Нейтральне «, а …» лендінг рахує теж,
// але там копія коротка; у «Що нового» звичайні сполучники («…зі Strong, а
// вправи отримали…») давали 10 хибних на 759 слів.
const ANTITHESIS = new RegExp(
  `(?:,| )а не |(?<!${L})не [^,.;]{2,70}, а `,
  "giu",
);
const TRUTH_CLAIM =
  /(?<![а-яіїєґ])(насправді|покаже правду|реальн(?:у|а|ий) картин|чесн(?:у|а|ий) картин)/giu;
const HINT_PREFIX = /(^|["'`])(Порада|Увага|Важливо|Підказка):/gmu;

const DENSITY_SURFACES = [
  "core/whatsNew/releases.ts",
  "shared/i18n/uk.core.ts",
  "core/onboarding/FirstActionSheet.tsx",
  "shared/components/ui/EmptyState.tsx",
];

function cyrillicLiterals(file: string): string {
  const src = readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const out: string[] = [];
  for (const m of src.matchAll(LITERAL)) {
    const body = m[1] ?? m[2] ?? m[3] ?? "";
    if (CYRILLIC.test(body)) out.push(body);
  }
  return out.join("\n");
}

function count(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

describe("густина маркерів слопу на поверхнях поза uk.*.ts", () => {
  for (const rel of DENSITY_SURFACES) {
    it(rel, () => {
      const text = cyrillicLiterals(path.join(SRC, rel));
      const words = (text.match(/[а-яіїєґА-ЯІЇЄҐa-zA-Z0-9ʼ-]+/gu) ?? []).length;
      const problems: string[] = [];
      const antitheses = count(text, ANTITHESIS);
      const ceiling = Math.max(1, Math.floor(words * 0.003));
      if (antitheses > ceiling)
        problems.push(`антитез «X, а не Y»: ${antitheses} > ${ceiling}`);
      const truth = text.match(TRUTH_CLAIM) ?? [];
      if (truth.length > 0)
        problems.push(`заяв про правду: ${truth.join(", ")}`);
      const prefixes = text.match(HINT_PREFIX) ?? [];
      if (prefixes.length > 0)
        problems.push(`префіксів-підказок: ${prefixes.length}`);
      expect(problems, `${rel} (${words} слів)`).toEqual([]);
    });
  }
});

/**
 * Редизайн v3, PR0 (каталог `2026-10-08-redesign-v3-gap-memo.md` п. 18, 19,
 * 21, 23, 35). Заголовок-питання («Без банку?», «З чого почати?») це
 * риторичне питання замість змісту: заголовок у локалях називає факт або дію.
 * Виняток один: підтвердження дії («Видалити звичку?»), де питання справжнє і
 * під ним дві кнопки відповіді.
 */
const HEADING_KEY =
  /(\w*(?:[tT]itle|[hH]eading|summary))\s*:\s*\n?\s*["'`]([^"'`\n]*\?)["'`]/g;
const CONFIRM_VERB =
  /^(Видалити|Очистити|Вимкнути|Відключити|Відʼєднати|Відвʼязати|Скинути|Замінити|Зберегти|Скопіювати|Відновити|Вийти|Скасувати|Перерахувати)\s/u;

describe("заголовки в локалях без питань", () => {
  it("ключі *title / *heading / summary не закінчуються «?», крім підтверджень", () => {
    const dir = path.join(SRC, "shared/i18n");
    const hits = readdirSync(dir)
      .filter((f) => /^uk.*\.ts$/.test(f) && !f.includes(".test."))
      .flatMap((f) => {
        const text = readFileSync(path.join(dir, f), "utf8");
        return [...text.matchAll(HEADING_KEY)]
          .filter((m) => !CONFIRM_VERB.test(m[2] ?? ""))
          .map((m) => `${f}: ${m[1]}: «${m[2]}»`);
      });
    expect(hits).toEqual([]);
  });
});

/**
 * Словник, який читається як шаблон: дашборд-ярлики BI («Зведення»,
 * «Лідери та аутсайдери», «Тиждень у цифрах»), коуч-голос («Продовжуй»),
 * індикатор чат-бота («Готую пораду…») і плейсхолдер-приклад («Напр. …»).
 * Шукаємо в коді без коментарів, а не лише в літералах: частина цих рядків
 * жила текстом JSX, який регекс літералів не бачить.
 */
const BANNED_PHRASES =
  /Зведення|Лідери та аутсайдери|Тиждень у цифрах|Продовжуй|Готую пораду|["'`>]\s*(?:[Нн]апр\.|Наприклад)/gu;

function withoutComments(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

describe("словник шаблону поза копією", () => {
  it("у src немає заборонених фраз редизайну v3", () => {
    const hits = sourceFiles(SRC)
      .filter((f) => !f.endsWith(`copy.slop.test.ts`))
      .flatMap((f) =>
        [...withoutComments(f).matchAll(BANNED_PHRASES)].map(
          (m) => `${path.relative(SRC, f)}: ${m[0]}`,
        ),
      );
    expect(hits).toEqual([]);
  }, 180_000);
});

/**
 * Плейсхолдер-перелік прикладів («Кава, продукти, таксі»): каталог
 * `2026-10-08-redesign-v3-gap-memo.md` п. 23, заборонений у PR0 редизайну v3.
 * Гейт вище ловив лише префікси «Напр.» / «Наприклад», а перелік без
 * префікса, ще й у тернарнику на кількох рядках, проходив повз нього, тож
 * він пережив PR0 у формі витрати Фініка (інвентар v3.1, Е1). Ловимо
 * атрибут `placeholder=` і ключі `*placeholder:` з кириличним рядком, у якому
 * дві й більше коми; квадратні дужки означають шаблон юридичного тексту, а
 * не поле вводу.
 */
const PLACEHOLDER_LIST =
  /placeholder\s*(?:=\s*\{?|:)\s*(?:[^"'`;{}]{0,80}\?\s*)?["'`]([^"'`\n]*)["'`](?:\s*:\s*["'`]([^"'`\n]*)["'`])?/giu;

function placeholderLists(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER_LIST)].flatMap((m) =>
    [m[1], m[2]].filter(
      (body): body is string =>
        body !== undefined &&
        CYRILLIC.test(body) &&
        !body.includes("[") &&
        (body.match(/,/g) ?? []).length >= 2,
    ),
  );
}

describe("плейсхолдер без переліку прикладів", () => {
  it("ловить перелік і в тернарнику на кількох рядках", () => {
    const sample = `placeholder={
          isIncome
            ? "Зарплата, повернення боргу, підробіток"
            : "Кава, продукти, таксі"
        }`;
    expect(placeholderLists(sample)).toEqual([
      "Зарплата, повернення боргу, підробіток",
      "Кава, продукти, таксі",
    ]);
    expect(placeholderLists(`placeholder="Назва"`)).toEqual([]);
  });

  it("у src немає плейсхолдера-переліку", () => {
    const hits = sourceFiles(SRC).flatMap((f) =>
      placeholderLists(withoutComments(f)).map(
        (body) => `${path.relative(SRC, f)}: «${body}»`,
      ),
    );
    expect(hits).toEqual([]);
  }, 180_000);
});

/**
 * Суфлер (redesign v3.2, PR3; style-guide §7): порожній стан, підказка, надж
 * чи підзаголовок обіцяє результат замість факту («…і Фінік почне рахувати»,
 * «…порахуються тут», «…решта підтягнеться», «…щоб стежити за КБЖВ»).
 * Ловимо кириличний рядок у локалях, якщо в шляху ключа є `empty`, `hint`,
 * `nudge` чи `subtitle`, а в рядку дієслово-обіцянка майбутнього часу або
 * сполучник мети «щоб». Шлях, а не лише останній ключ: `journalEmpty.
 * description` це той самий порожній стан, що й `emptyDescription`.
 */
const PROMPTER_KEY = /empty|hint|nudge|subtitle/i;
const PROMPTER_WORD =
  /(?<![а-яіїєґʼ'])(щоб|почне|почнуть|порахує|порахують|порахується|порахуються|підтягне|підтягнеться|підтягнуться|врахує|врахують|покаже|покажуть|зʼявиться|з'явиться|зʼявляться)(?![а-яіїєґʼ'])/iu;

/** Шлях ключа → чому обіцянка тут доречна. */
const PROMPTER_ALLOW: Record<string, string> = {};

function prompterHits(node: unknown, pathParts: string[] = []): string[] {
  if (typeof node === "string") {
    const p = pathParts.join(".");
    return CYRILLIC.test(node) &&
      pathParts.some((k) => PROMPTER_KEY.test(k)) &&
      PROMPTER_WORD.test(node) &&
      !(p in PROMPTER_ALLOW)
      ? [`${p}: «${node}»`]
      : [];
  }
  if (node && typeof node === "object")
    return Object.entries(node).flatMap(([k, v]) =>
      prompterHits(v, [...pathParts, k]),
    );
  return [];
}

describe("копія без суфлера", () => {
  it("ловить обіцянку в порожньому стані і пропускає факт", () => {
    expect(
      prompterHits({
        journalEmpty: { description: "Калорії та КБЖВ порахуються тут." },
        moduleEmpty: { routine: { hint: "Створи одну, щоб почати серію." } },
        empty: { description: "Сьогодні 0 записів" },
        title: "Додай, і Фінік почне рахувати",
      }),
    ).toEqual([
      "journalEmpty.description: «Калорії та КБЖВ порахуються тут.»",
      "moduleEmpty.routine.hint: «Створи одну, щоб почати серію.»",
    ]);
  });

  it("у локалях немає суфлера поза allowlist", async () => {
    const mods = import.meta.glob<Record<string, unknown>>("./uk*.ts", {
      eager: true,
    });
    const hits = Object.entries(mods)
      .filter(([file]) => !file.includes(".test."))
      .flatMap(([file, mod]) =>
        prompterHits(mod).map((h) => `${file.slice(2)}: ${h}`),
      );
    expect([...new Set(hits)]).toEqual([]);
  });
});
