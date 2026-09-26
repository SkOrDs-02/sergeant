import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import routeMeta from "./lib/routeMeta.json";

/**
 * Гейт тону сайту: механічні ознаки ШІ-тексту, за якими аудит копії
 * сайту 2026-09-17 (`2026-09-17-site-copy-audit.md` у
 * `docs/work/specs/audits/`, PR #108, §6.2) розібрав усі 31 маршрут.
 * Пороги взяті з найчистіших сторінок того дня і
 * затверджені власником (§8 п. 6, 14): гейт не судить стиль, він ловить
 * повернення конструкцій, які вже раз вичищали хвилями A–F.
 *
 * Що рахується – на видимому тексті сторінки (без коментарів, атрибутів
 * і тегів), тому регекси нижче ті самі, що дали числа §2 аудиту. JS-`\b`
 * кирилиці не бачить, межі слів – lookaround на літерах.
 *
 * Для коротких сторінок густина на 100 слів вироджується (одна антитеза
 * на 130-словній головній – уже 0,77), тож у кожного порогу є абсолютний
 * мінімум: слоган «рахує, а не читає лекцій» лишається за рішенням §8 п. 2.
 */
const SRC = path.dirname(fileURLToPath(import.meta.url));

/** Маршрут → файли з його видимим текстом (App.tsx ROUTES + винесений контент). */
const PAGES: Record<string, { files: string[]; words: number }> = {
  "/": {
    files: ["pages/HomePage.tsx", "components/HomeSections.tsx"],
    words: 350,
  },
  "/beta": { files: ["pages/BetaPage.tsx"], words: 400 },
  "/about": { files: ["pages/AboutPage.tsx"], words: 400 },
  "/data": { files: ["pages/DataPage.tsx"], words: 400 },
  "/hroshi": { files: ["pages/HroshiPage.tsx"], words: 800 },
  "/yizha": { files: ["pages/YizhaPage.tsx"], words: 800 },
  "/zvychky": { files: ["pages/ZvychkyPage.tsx"], words: 800 },
  "/trenuvannia": { files: ["pages/TrenuvanniaPage.tsx"], words: 800 },
  "/ruchna-robota": { files: ["pages/RuchnaRobotaPage.tsx"], words: 400 },
  "/vyhid": { files: ["pages/VyhidPage.tsx"], words: 400 },
  "/guides": { files: ["pages/GuidesPage.tsx"], words: 400 },
  "/zvyazky": { files: ["pages/ZvyazkyPage.tsx"], words: 550 },
  "/pomichnyk": { files: ["pages/PomichnykPage.tsx"], words: 550 },
  "/stan": { files: ["pages/StanPage.tsx"], words: 400 },
  "/obitsyanky": { files: ["pages/ObitsyankyPage.tsx"], words: 400 },
  "/pytannya": {
    files: ["pages/PytannyaPage.tsx", "content/faqItems.ts"],
    words: 400,
  },
  "/contact": { files: ["pages/ContactPage.tsx"], words: 400 },
  "/guides/monobank": { files: ["pages/GuideMonobankPage.tsx"], words: 550 },
  "/guides/kbzhv": { files: ["pages/GuideKbzhvPage.tsx"], words: 550 },
  "/guides/cheky": { files: ["pages/GuideChekyPage.tsx"], words: 550 },
  "/guides/foto-kalorii": {
    files: ["pages/GuideFotoKaloriiPage.tsx"],
    words: 550,
  },
  "/guides/bank-bezpeka": {
    files: ["pages/GuideBankBezpekaPage.tsx"],
    words: 550,
  },
  "/guides/kilka-bankiv": {
    files: ["pages/GuideKilkaBankivPage.tsx"],
    words: 550,
  },
  "/guides/pryvat24": { files: ["pages/GuidePryvat24Page.tsx"], words: 550 },
  "/guides/silpo": { files: ["pages/GuideSilpoPage.tsx"], words: 550 },
  "/guides/pauza-i-propusk": {
    files: ["pages/GuidePauzaPropuskPage.tsx"],
    words: 550,
  },
  "/guides/ohlyad-dnya": {
    files: ["pages/GuideOhlyadDnyaPage.tsx"],
    words: 550,
  },
  "/guides/tyzhnevyi-pidsumok": {
    files: ["pages/GuideTyzhnevyiPidsumokPage.tsx"],
    words: 550,
  },
  "/guides/zamist-chotyryokh-trekeriv": {
    files: ["pages/GuideZamistTrekerivPage.tsx"],
    words: 550,
  },
  "/privacy": { files: ["pages/PrivacyPage.tsx"], words: 400 },
  "/terms": { files: ["pages/TermsPage.tsx"], words: 400 },
  "/404": { files: ["pages/NotFoundPage.tsx"], words: 400 },
};

const L = "[а-яіїєґА-ЯІЇЄҐʼ]";

const DASH = / – /g;
/** «X, а не Y», «, а Y.» як поворот, «не X, а Y» (крім «а ти / а я»). */
const ANTITHESIS = new RegExp(
  `(?:,| )а не |, а (?!ти(?!${L})|я(?!${L}))[^,.;]{1,50}[.;]|(?<!${L})не [^,.;]{2,70}, а `,
  "giu",
);
const CHESN = /чесн/gi;
const META_HONESTY =
  /чесна відповідь|скажу прямо|пишу це прямо|каж(?:е|у) (?:це )?прямо|Чесно:|чесно каж|це чесн|чесний опис|чесна межа|чесно мовчить/giu;
/** Інженерний стоп-список; «борг» – лише з малої літери, бо є шкала Борга. */
const JARGON = new RegExp(
  `aria-label|промпт|(?<!${L})тест(?:ом|и|ами|ів|у)?(?!${L})|батч|ендпоінт|windows-1251|Атвотер|(?<!${L})у коді(?!${L})|ратиф|(?<!${L})канон|(?<!${L})гейт|(?<!${L})коміт|прапорц`,
  "giu",
);
const JARGON_LOWER = new RegExp(`(?<!${L})борг(?:у|и|ів)?(?!${L})`, "gu");
const TOMU_START = new RegExp(
  `(?:^|[.!?»] )(?:Саме тому|Тому|Тобто|Тож)(?!${L})`,
  "gmu",
);
const CHANGELOG = /Раніше|Тепер |До 2026|Доти /g;
const CALLOUT = /border-l-2/g;
/** Асистент називається «Сержант» у видимому тексті; «AI-помічник» лишається лише в routeMeta.json (title/description, §L1). */
const AI_HELPER = /AI-помічник/g;

function read(file: string): string {
  return readFileSync(path.join(SRC, file), "utf8");
}

/** Видимий текст модуля: без коментарів, JSX-атрибутів і тегів; лише рядки з кирилицею. */
function visibleText(src: string): string {
  let s = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  s = s
    .replace(/\b[a-zA-Z-]+=\{`[^`]*`\}/g, "")
    .replace(/\b[a-zA-Z-]+="[^"]*"/g, "");
  s = s.replace(/<[^>]+>/g, " ").replace(/\{"\s*"\}/g, " ");
  return s
    .split("\n")
    .filter((line) => /[а-яіїєґА-ЯІЇЄҐ]/.test(line))
    .map((line) =>
      line
        .replace(
          /^\s*(?:text|title|teaser|q|a|what|how|why|when|from|data|access|note|extra|sergeant|body|sphere|label|name|description|headline|alt|subtitle|"[^"]+")\s*:\s*/,
          "",
        )
        .replace(/^[\s`"',{}[\]]+|[\s`"',{}[\]]+$/g, ""),
    )
    .join("\n");
}

function count(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

function words(text: string): number {
  return (text.match(/[а-яіїєґА-ЯІЇЄҐa-zA-Z0-9ʼ-]+/gu) ?? []).length;
}

function headings(src: string): string {
  return [...src.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/g)]
    .map((m) => m[1] ?? "")
    .join("\n");
}

describe("регекси ловлять рівно ті конструкції, з яких почався гейт", () => {
  it("антитеза", () => {
    expect(count("Це облік, а не банкінг.", ANTITHESIS)).toBe(1);
    expect(
      count("Не десять днів взагалі, а десять днів роботи.", ANTITHESIS),
    ).toBe(1);
    expect(count("Серія це переживає, а ти нічого не робиш.", ANTITHESIS)).toBe(
      0,
    );
  });
  it("мета-чесність і жаргон", () => {
    expect(count("Скажу прямо: фото у платному плані.", META_HONESTY)).toBe(1);
    expect(count("імпорт відкочується цілим батчем", JARGON)).toBe(1);
    expect(count("це моє зобовʼязання, а не механізм у коді", JARGON)).toBe(1);
    expect(count("Оцінка зусилля за Боргом", JARGON_LOWER)).toBe(0);
    expect(count("технічний борг лишається", JARGON_LOWER)).toBe(1);
  });
  it("початок речення і changelog", () => {
    expect(
      count("Даних мало. Тому день пунктирний. Тобто нуль.", TOMU_START),
    ).toBe(2);
    expect(count("Раніше кіт був стравою. Тепер ні.", CHANGELOG)).toBe(2);
  });
});

describe("тон сайту в межах порогів аудиту копії (§6.2)", () => {
  for (const [route, page] of Object.entries(PAGES)) {
    it(`${route}`, () => {
      const sources = page.files.map(read);
      const text = sources.map(visibleText).join("\n");
      const n = words(text);
      const problems: string[] = [];
      const check = (label: string, value: number, limit: number) => {
        if (value > limit) problems.push(`${label}: ${value} > ${limit}`);
      };
      check("слів", n, page.words);
      check("тире « – »", count(text, DASH), Math.max(3, Math.floor(n / 100)));
      check(
        "антитез «X, а не Y»",
        count(text, ANTITHESIS),
        Math.max(1, Math.floor(n * 0.003)),
      );
      check("«чесн*»", count(text, CHESN), 1);
      check(
        "«чесн*» у h1/h2",
        count(sources.map(headings).join("\n"), CHESN),
        0,
      );
      check("мета-чесності", count(text, META_HONESTY), 0);
      check(
        "жаргону зі стоп-списку",
        count(text, JARGON) + count(text, JARGON_LOWER),
        0,
      );
      check("callout border-l-2", count(sources.join("\n"), CALLOUT), 1);
      check(
        "речень із «Тому/Тобто/Тож» на початку",
        count(text, TOMU_START),
        2,
      );
      if (route !== "/stan")
        check("changelog-маркерів", count(text, CHANGELOG), 0);
      check("«AI-помічник» у видимому тексті", count(text, AI_HELPER), 0);
      expect(problems, `${route}: ${page.files.join(", ")}`).toEqual([]);
    });
  }

  it("усі маршрути App.tsx покриті бюджетом", () => {
    const routes = [
      ...read("App.tsx").matchAll(/^\s+"(\/[^"]*)": \w+Page,/gm),
    ].map((m) => m[1]);
    expect(routes.sort()).toEqual(Object.keys(PAGES).sort());
    expect(Object.keys(routeMeta).filter((r) => !(r in PAGES))).toEqual([]);
  });

  it("мета маршрутів і llms.txt без заяв про чесність і жаргону", () => {
    const meta = Object.entries(routeMeta)
      .map(([route, r]) => `${route}: ${r.title}\n${r.description ?? ""}`)
      .join("\n");
    const llms = readFileSync(
      path.join(SRC, "..", "public", "llms.txt"),
      "utf8",
    );
    for (const [label, text] of [
      ["routeMeta.json", meta],
      ["llms.txt", llms],
    ] as const) {
      expect(text.match(META_HONESTY) ?? [], label).toEqual([]);
      expect(text.match(JARGON) ?? [], label).toEqual([]);
      expect(text.match(CHESN) ?? [], label).toEqual([]);
    }
  });
});
