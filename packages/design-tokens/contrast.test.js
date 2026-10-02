/**
 * WCAG AA contrast test for Sergeant brand surfaces.
 *
 * Locks the canonical foreground/background pairs that must clear the
 * 4.5:1 normal-text contrast ratio. The saturated `*-500` brand tones
 * (`brand`, `finyk`, `fizruk`, `routine`, `nutrition`) regress on
 * white / cream surfaces; the `-strong` companion (`-700` for most
 * families, `-800` for nutrition/lime) is what pages must use whenever
 * the colour appears as body text on a light surface.
 *
 * If a snapshot diff or pair flip here is intentional (e.g. a brand
 * retune), update the WCAG-AA proposal doc + BRANDBOOK in the same PR.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  brandColors,
  chartHex,
  moduleColors,
  inkTheme,
  moduleAccentRgb,
  moduleSurfaces,
  statusInkHex,
  accentInkHex,
  accentStrongHex,
  statusStrongHex,
} from "./tokens.js";

function luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(hex1, hex2) {
  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Зупинки світлого геро-градієнта модуля, прочитані з `theme.css` (`:root`,
 * перший збіг — HC-перевизначення йдуть нижче в тому ж файлі). Джерело
 * правди для градієнтів — саме CSS, а не `tokens.js`: тест міряє те, що
 * реально малюється, а не копію.
 */
const THEME_CSS = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "apps",
    "web",
    "src",
    "styles",
    "theme.css",
  ),
  "utf8",
);

/**
 * Джерело осередків `MealStrip` — з нього гейт читає класи перехідних
 * станів (`hover:bg-hero-ink/N`, `active:bg-hero-ink/N`), а не копію чисел.
 */
const MEAL_STRIP_SRC = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "apps",
    "web",
    "src",
    "modules",
    "nutrition",
    "components",
    "MealStrip.tsx",
  ),
  "utf8",
);

function heroGradientStops(module) {
  const decl = new RegExp(
    `--hero-grad-${module}:\\s*linear-gradient\\(([^)]*)\\)`,
  ).exec(THEME_CSS);
  if (!decl) throw new Error(`--hero-grad-${module} не знайдено в theme.css`);
  return [...decl[1].matchAll(/#([0-9a-fA-F]{6})\b/g)].map((m) =>
    `#${m[1]}`.toLowerCase(),
  );
}

/** Найсвітліша зупинка: саме під нею чорнило найгірше. */
function lightestStop(stops) {
  return stops.reduce((a, b) => (luminance(b) > luminance(a) ? b : a));
}

/** `moduleAccentRgb` тримає значення як "R G B"; тут потрібен hex. */
function rgbTripleToHex(triple) {
  return (
    "#" +
    triple
      .split(/\s+/)
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("")
  );
}

// Each row: [name, foreground hex, background hex, shouldPassAA].
// `shouldPassAA === false` means the pair is documented as failing AA;
// the test asserts the failure so we don't accidentally start treating
// it as a viable text colour.
// Третинні тони світлої теми (`--c-muted` / `--c-subtle` у theme.css).
//
// AI-DANGER: **обидва мусять критись проти СТОЛУ І ЗОНИ, не лише проти
// білого.** До 2026-09-11 цей гейт перевіряв `subtle` тільки на столі, а
// зону — лише під `-strong` акцентом, бо вважалося, що в зоні буває лише
// акцентний текст або чорнило. У коді це було не так: `ModuleHeader`
// рендерить свою кнопку «Назад» у `text-muted` саме в зоні. Гейт був
// зелений, а axe знайшов 14 вузлів на 11 маршрутах у діапазоні
// 4.21-4.49:1 — усі під порогом AA і всі через те, що «стіл і зона»
// (#1063) прибрали з-під третинного тексту білу картку. Не звужуй ці
// матриці назад до однієї поверхні.
const MUTED_LIGHT = "#535c56";
const SUBTLE_LIGHT = "#605a54";

// Стіл — фон сторінки; на ньому живе будь-який текстовий тір.
const DESK_PAIRS = Object.entries(moduleSurfaces).flatMap(([name, s]) => [
  [`muted on ${name} desk (light)`, MUTED_LIGHT, s.light.desk, true],
  [`subtle on ${name} desk (light)`, SUBTLE_LIGHT, s.light.desk, true],
]);

// Зона — смуга під шапкою і табами модуля. Крім `-strong` акценту й
// чорнила, туди сідає третинний текст контролів шапки, тож перевіряємо
// всі три тіри. Зона хаба (#dad6ce) — найтемніша з реальних поверхонь,
// саме вона тут визначає поріг.
const ZONE_PAIRS = [
  ...Object.entries(moduleSurfaces).flatMap(([name, s]) => [
    [`muted on ${name} zone (light)`, MUTED_LIGHT, s.light.zone, true],
    [`subtle on ${name} zone (light)`, SUBTLE_LIGHT, s.light.zone, true],
  ]),
  ...["finyk", "fizruk", "routine", "nutrition"].map((m) => [
    `${m}-strong on ${m} zone (light)`,
    rgbTripleToHex(moduleAccentRgb[m].strong),
    moduleSurfaces[m].light.zone,
    true,
  ]),
];

const PAIRS = [
  ...DESK_PAIRS,
  ...ZONE_PAIRS,
  ["nutrition text on white", moduleColors.nutrition.primary, "#ffffff", false],
  ["nutrition-strong on white", brandColors.lime[800], "#ffffff", true],
  [
    "nutrition-strong on lime-50",
    brandColors.lime[800],
    brandColors.lime[50],
    true,
  ],
  ["routine text on white", moduleColors.routine.primary, "#ffffff", false],
  ["routine-strong on white", brandColors.rose[700], "#ffffff", true],
  [
    "routine-strong on rose-50",
    brandColors.rose[700],
    brandColors.rose[50],
    true,
  ],
  ["finyk-strong on white", brandColors.teal[800], "#ffffff", true], // 2026-07: was emerald[700]
  ["fizruk-strong on white", brandColors.cyan[800], "#ffffff", true],
  // Dark `--c-accent` — 2026-08 design-audit T1. `--c-accent` had no
  // `.dark` override (unlike its sibling `--c-ring`), so `text-accent` /
  // `bg-accent` rendered the light-tier teal-700 on the ink surface
  // (~3.4:1, sub-AA). Locks the fixed dark tier (teal-400) against the
  // ink page background.
  [
    "accent (dark, teal-400) on ink bg",
    brandColors.teal[400],
    inkTheme.surface.bg,
    true,
  ],
  // Routine hero (light) — реальні пари з рендера (design-audit F2):
  // світлий градієнт стиснуто до rose-800→700, текст hero-ink #fdf9f3.
  // Пари фіксують обидва стопи, щоб майбутнє «освітлення» героя знову
  // не впустило дрібний текст під 4.5:1 (виміряний фейл був 2.12:1 на
  // старому стопі rose-400).
  [
    "routine hero-ink on rose-700 (hero light end)",
    "#fdf9f3",
    brandColors.rose[700],
    true,
  ],
  [
    "routine hero-ink on rose-800 (hero dark end)",
    "#fdf9f3",
    brandColors.rose[800],
    true,
  ],
  [
    "routine hero-ink on rose-400 (старий стоп — задокументований фейл)",
    "#fdf9f3",
    brandColors.rose[400],
    false,
  ],
  // Fizruk + nutrition hero (light) — 2026-08 design-audit T2: same
  // failure class as routine F2 above (light end measured ~1.7–2.2:1 for
  // hero-ink text), fixed the same way — compress to `-800`/`-700`.
  [
    "fizruk hero-ink on cyan-700 (hero light end)",
    "#fdf9f3",
    brandColors.cyan[700],
    true,
  ],
  [
    "fizruk hero-ink on cyan-800 (hero dark end)",
    "#fdf9f3",
    brandColors.cyan[800],
    true,
  ],
  [
    // Колишній світлий кінець. Голий він проходить (4.67), але під заливкою
    // осередка `MealStrip` — ні (4.27), тому з 2026-10-01 кінець `#4e6f10`;
    // реальні зупинки й заливку міряє блок «кожна зупинка» нижче.
    "nutrition hero-ink on lime-700 (колишній світлий кінець, голий)",
    "#fdf9f3",
    brandColors.lime[700],
    true,
  ],
  [
    "nutrition hero-ink on lime-800 (hero dark end)",
    "#fdf9f3",
    brandColors.lime[800],
    true,
  ],
  // Finyk hero (light) — 2026-08 design-audit T2 follow-up: compressed to
  // teal-800 → teal-700 like the other three modules (the old teal-400
  // light end measured ~1.77:1 for hero-ink text).
  [
    "finyk hero-ink on teal-700 (hero light end)",
    "#fdf9f3",
    brandColors.teal[700],
    true,
  ],
  [
    "finyk hero-ink on teal-800 (hero dark end)",
    "#fdf9f3",
    brandColors.teal[800],
    true,
  ],
  // Макро-шкала (бриф «Папір» §3; родина переглянута N-13, продуктовий
  // аудит 2026-09-16 - власна палітра замість cyan/rose/lime, що
  // збігались з акцентами Фізрука/Рутини/Їжі). Сегменти несуть
  // `text-white`, звідси перевірка тут, а не лише в `chartHex.contract.test.js`.
  [
    "macro protein - white on chartHex.protein",
    "#ffffff",
    chartHex.protein,
    true,
  ],
  ["macro fat - white on chartHex.fat", "#ffffff", chartHex.fat, true],
  ["macro carbs - white on chartHex.carbs", "#ffffff", chartHex.carbs, true],
];

describe("@sergeant/design-tokens — WCAG AA contrast", () => {
  for (const [name, fg, bg, shouldPass] of PAIRS) {
    it(`${name} ${shouldPass ? "≥ 4.5:1" : "< 4.5:1 (documented regression)"}`, () => {
      const ratio = contrastRatio(fg, bg);
      if (shouldPass) {
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      } else {
        // Lock the regression: if a future tweak accidentally pushes the
        // saturated `*-500` shade above AA on white, this test will fail
        // and force us to revisit the `-strong` migration.
        expect(ratio).toBeLessThan(4.5);
      }
    });
  }
});

describe("@sergeant/design-tokens — «Чорнило» ink contrast", () => {
  // Locks the ink text tiers against the ink surfaces (spec § 1). If a
  // retune darkens the surface or lifts the text, these guard the AA/AAA
  // floors the direction promises so the swap can't silently regress.
  const { bg, surface } = inkTheme.surface;
  const { strong, fg, muted, subtle } = inkTheme.text;

  it("fg-strong on bg ≥ 7:1 (AAA)", () => {
    expect(contrastRatio(strong, bg)).toBeGreaterThanOrEqual(7);
  });
  it("fg on bg ≥ 7:1 (AAA)", () => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(7);
  });
  it("muted on surface ≥ 4.5:1 (AA)", () => {
    expect(contrastRatio(muted, surface)).toBeGreaterThanOrEqual(4.5);
  });
  // AI-DANGER: 2026-08-21 — поріг тут був 3:1 із підписом «AA large /
  // ≥12px labels». Такого послаблення не існує: 3:1 діє від 18.66px bold /
  // 24px regular, а `text-subtle` носить 12px-підписи. Через це тест був
  // зелений на значенні, яке axe ловив як `[serious] color-contrast` на
  // `/settings [dark]`. Не повертай 3:1 — якщо новий тон його не тримає,
  // це тон треба піднімати, а не поріг опускати.
  it("subtle on surface ≥ 4.5:1 (AA normal text — 12px це звичайний текст)", () => {
    expect(contrastRatio(subtle, surface)).toBeGreaterThanOrEqual(4.5);
  });
  it("драбина з трьох помітних щаблів: strong > muted > subtle", () => {
    expect(contrastRatio(strong, surface)).toBeGreaterThan(
      contrastRatio(muted, surface),
    );
    expect(contrastRatio(muted, surface)).toBeGreaterThan(
      contrastRatio(subtle, surface),
    );
  });
});

describe("@sergeant/design-tokens — статуси як ТЕКСТ у «Чорнилі»", () => {
  // AI-CONTEXT (2026-08-21): `statusStrongHex` — світлий тир, і як текст на
  // чорнилі він не працює (red-800 на картці = 1.9:1). До цього дня це
  // ніде не було зафіксовано, тож `text-{status}-strong` без ручної
  // `dark:`-пари малював темно-червоне по темному в третині місць.
  // Пари нижче тримають обидва боки контракту: чорнильний тир проходить
  // AA на всіх трьох ink-поверхнях, а світлий — задокументовано НЕ
  // проходить, щоб його не «повернули назад» як спільне значення.
  const { bg, surface, surfaceHi } = inkTheme.surface;
  const surfaces = { bg, surface, surfaceHi };

  for (const [status, hex] of Object.entries(statusInkHex)) {
    for (const [surfaceName, surfaceHex] of Object.entries(surfaces)) {
      it(`${status}-ink ≥ 4.5:1 на ink ${surfaceName}`, () => {
        expect(contrastRatio(hex, surfaceHex)).toBeGreaterThanOrEqual(4.5);
      });
    }
    it(`${status}-strong (світлий тир) < 4.5:1 на ink surface — задокументований фейл`, () => {
      expect(contrastRatio(statusStrongHex[status], surface)).toBeLessThan(4.5);
    });
  }

  // Заливка й текст мусять лишатися РІЗНИМИ значеннями: спільного числа
  // між «≥4.5 як текст на чорнилі» і «≥4.5 під `text-white`» не існує.
  for (const [status, hex] of Object.entries(statusInkHex)) {
    it(`${status}: чорнильний тир не годиться під text-white (тому заливка лишається на -strong)`, () => {
      expect(contrastRatio("#ffffff", hex)).toBeLessThan(4.5);
      expect(
        contrastRatio("#ffffff", statusStrongHex[status]),
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("@sergeant/design-tokens — бренд і модулі як ТЕКСТ у «Чорнилі»", () => {
  // AI-CONTEXT (2026-09-02): та сама пара контрактів, що для статусів вище,
  // але для бренду й модульних акцентів. Акцентний `-strong` — тир -800; на
  // ink-поверхнях він дає 1.11…2.74:1, тобто `text-{accent}-strong` малював
  // темне по темному у спільних примітивах (`Tabs`, `Badge`, `Stat`,
  // `KeyboardAccessory`), на екрані входу й у повідомленнях чату.
  //
  // AI-DANGER: модульний світлий тир звіряємо з `moduleAccentRgb` — це
  // окрема мапа, і саме її розходження зі своєю копією колись лишило
  // `warning-strong` на 4.21 під підписом «4.83». Бренд у тій мапі запису
  // не має (він не модульний акцент), тож для нього джерело —
  // `accentStrongHex`, а нижній цикл доводить, що обидва джерела збігаються.
  const { bg, surface, surfaceHi } = inkTheme.surface;
  const surfaces = { bg, surface, surfaceHi };

  for (const [module, triple] of Object.entries(moduleAccentRgb)) {
    it(`${module}: accentStrongHex збігається з moduleAccentRgb.strong`, () => {
      expect(accentStrongHex[module]).toBe(rgbTripleToHex(triple.strong));
    });
  }

  for (const [module, hex] of Object.entries(accentInkHex)) {
    for (const [surfaceName, surfaceHex] of Object.entries(surfaces)) {
      it(`${module}-ink ≥ 4.5:1 на ink ${surfaceName}`, () => {
        expect(contrastRatio(hex, surfaceHex)).toBeGreaterThanOrEqual(4.5);
      });
    }
    it(`${module}-strong (світлий тир) < 4.5:1 на ink surface — задокументований фейл`, () => {
      expect(contrastRatio(accentStrongHex[module], surface)).toBeLessThan(4.5);
    });
  }

  // Заливка й текст лишаються РІЗНИМИ значеннями: `bg-{accent}-strong`
  // тримає тир -800 під `text-white`, чорнильний тир для цього не годиться.
  for (const [module, hex] of Object.entries(accentInkHex)) {
    it(`${module}: чорнильний тир не годиться під text-white (тому заливка лишається на -strong)`, () => {
      expect(contrastRatio("#ffffff", hex)).toBeLessThan(4.5);
      expect(
        contrastRatio("#ffffff", accentStrongHex[module]),
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("@sergeant/design-tokens — `moduleColors.primary` мішаний за тиром", () => {
  // AI-DANGER: 2026-09-12 (D1 крок 3) — цей тест фіксує РОЗХОДЖЕННЯ ТИРІВ як
  // відомий стан, а не виправляє його. Рішення власника: значень не рушати
  // (зведення в один тир помітно змінює вигляд двох модулів), закрити гейтом.
  //
  // finyk і fizruk сидять на тирі -700, routine і nutrition — на -500. Це та
  // сама «мішанка тирів», про яку попереджає коментар до `statusStrongHex`,
  // тільки в мапі модулів. Наслідок під білим текстом: finyk 5.47 і fizruk
  // 5.36 (повний AA), routine 2.79 і nutrition 1.93 (провал навіть для
  // large-text 3:1). Тобто правило «модульний акцент під білим» НЕ існує —
  // під білий іде `-strong` (тир -800, гейтований вище).
  //
  // `PAIRS` вище вже фіксує провал routine/nutrition на білому. Негейтованим
  // лишалося саме розходження: ніщо не стверджувало, що дві родини стоять на
  // РІЗНИХ щаблях рампи. Тепер зміна будь-якої з них дає видимий діф тут.
  const TIER_700 = { finyk: "teal", fizruk: "cyan" };
  const TIER_500 = { routine: "rose", nutrition: "lime" };

  for (const [module, ramp] of Object.entries(TIER_700)) {
    it(`${module}: primary — тир -700 (${ramp})`, () => {
      expect(moduleColors[module].primary).toBe(brandColors[ramp][700]);
    });
  }

  for (const [module, ramp] of Object.entries(TIER_500)) {
    it(`${module}: primary — тир -500 (${ramp}), НЕ -700`, () => {
      expect(moduleColors[module].primary).toBe(brandColors[ramp][500]);
      expect(moduleColors[module].primary).not.toBe(brandColors[ramp][700]);
    });
  }

  it("розходження тирів лишається саме таким: два -700 і два -500", () => {
    const onSevenHundred = Object.entries(moduleColors)
      .filter(([, v]) => v.primary)
      .filter(([, v]) =>
        [
          brandColors.teal[700],
          brandColors.cyan[700],
          brandColors.rose[700],
          brandColors.lime[700],
        ].includes(v.primary),
      )
      .map(([m]) => m);
    expect(onSevenHundred.sort()).toEqual(["finyk", "fizruk"]);
  });
});

describe("@sergeant/design-tokens — «Чорнило» light pair (spec § 5)", () => {
  // The light theme is the tonal inverse of the dark ink base: a warm-beige
  // page (#ecebe7) + white cards, green-ink text tiers, and strong-tier
  // module accents. These literals mirror the values applied to the light
  // `:root` in apps/web/src/styles/theme.css; the test pins their AA/AAA
  // floors so the § 5 swap can't silently regress the DEFAULT theme.
  const bg = "#ecebe7"; // page background (Б1, 2026-08-07; було #f2ecdf)
  const surface = "#ffffff"; // cards
  const fgStrong = "#0f1713"; // display / headings
  const fg = "#17201b"; // body
  const muted = "#535c56"; // meta / captions (2026-09-11: було #5c665f)
  const onAccent = "#fdf9f3"; // text over an accent fill
  // Strong-tier module accents (AA on white / cream).
  //
  // AI-DANGER: читаємо `moduleAccentRgb`, а НЕ свою копію хексів
  // (2026-08-07). Копія тут уже одного разу розійшлася з реальністю: тест
  // стверджував, що routine стоїть на rose-800, тоді як
  // `bg-routine-strong` і `--module-accent-strong` віддавали rose-700 з
  // 4.43 на фоні сторінки. Тест був зелений, а екран — ні. Не повертай
  // літерали: перевіряти треба те значення, яке справді доїжджає в CSS.
  const accents = Object.fromEntries(
    Object.entries(moduleAccentRgb).map(([name, { strong }]) => [
      name,
      rgbTripleToHex(strong),
    ]),
  );

  it("fg-strong ≥ 7:1 on both bg and surface (AAA)", () => {
    expect(contrastRatio(fgStrong, bg)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(fgStrong, surface)).toBeGreaterThanOrEqual(7);
  });
  it("fg (body) ≥ 7:1 on bg (AAA)", () => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(7);
  });
  it("muted ≥ 4.5:1 on both bg and surface (AA)", () => {
    expect(contrastRatio(muted, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(muted, surface)).toBeGreaterThanOrEqual(4.5);
  });

  for (const [name, hex] of Object.entries(accents)) {
    it(`${name} strong accent ≥ 4.5:1 on white (AA text)`, () => {
      expect(contrastRatio(hex, surface)).toBeGreaterThanOrEqual(4.5);
    });
    it(`on-accent text (#fdf9f3) ≥ 4.5:1 on the ${name} accent fill (AA)`, () => {
      expect(contrastRatio(onAccent, hex)).toBeGreaterThanOrEqual(4.5);
    });
    // AI-CONTEXT (2026-08-07): пари проти БІЛОГО тут були від початку, а
    // проти фону сторінки — ні. Саме тому зміна бази могла мовчки опустити
    // акцент нижче AA: `text-{module}` стоїть і на картці, і на `bg-bg`,
    // тож гірший випадок — фон. На старій базі cyan-700 давав 4.55 (на
    // межі), а lime-700 — 4.16, тобто був зламаний ще до Б1 і жоден тест
    // цього не бачив. Ця пара закриває сліпу пляму.
    it(`${name} strong accent ≥ 4.5:1 on the page background (AA text)`, () => {
      expect(contrastRatio(hex, bg)).toBeGreaterThanOrEqual(4.5);
    });
  }

  // AI-CONTEXT (2026-08-07): семантичні тири не мали ЖОДНОЇ пари в цьому
  // файлі — гейт покривав чотири модульні акценти й на цьому спинявся.
  // Це та сама сліпа пляма, що й вище, лише на іншій половині палітри:
  // `warning-strong` тримався на amber-700 = 4.21 на фоні сторінки, тобто
  // фейлив AA, а підпис у пресеті стверджував 4.83 (замір проти старої
  // кремової бази). Хекси беруться з `statusStrongHex` — того самого
  // джерела, що споживає Tailwind-пресет, — щоб копія не могла розійтися.
  for (const [name, hex] of Object.entries(statusStrongHex)) {
    it(`${name}-strong ≥ 4.5:1 on the page background (AA text)`, () => {
      expect(contrastRatio(hex, bg)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${name}-strong ≥ 4.5:1 on white (AA text on cards)`, () => {
      expect(contrastRatio(hex, surface)).toBeGreaterThanOrEqual(4.5);
    });
    it(`white text ≥ 4.5:1 on the ${name}-strong fill (AA)`, () => {
      expect(contrastRatio("#ffffff", hex)).toBeGreaterThanOrEqual(4.5);
    });
  }

  // Модульні й семантичні тири мусять лишатися на ОДНОМУ тирі. Не
  // естетика: система з двома конвенціями не має способу відрізнити
  // «свідомий виняток» від «забули підняти» — і саме так routine
  // прожив на -700, поки решта пішла на -800.
  it("семантичні тири не слабші за найслабший модульний акцент", () => {
    const weakestModule = Math.min(
      ...Object.values(accents).map((hex) => contrastRatio(hex, bg)),
    );
    for (const [name, hex] of Object.entries(statusStrongHex)) {
      expect(
        contrastRatio(hex, bg),
        `${name}-strong слабший за найслабший модульний акцент`,
      ).toBeGreaterThanOrEqual(weakestModule - 0.5);
    }
  });

  /**
   * Альфа на `hero-ink` — знахідка WF-23 (аудит шуму 2026-09-16), рішення
   * власника 2026-10-01 (аудит контрасту, A9): «чорнило без альфи».
   *
   * Пари вище міряють РІВНО 100%-чорнило, і саме тому дефект прожив довго:
   * `text-hero-ink/70` у коді композитно підмішує колір градієнта, а гейт
   * цього не бачив. Тест нижче міряє те, чим воно стає на екрані.
   *
   * Лічильник call-site-ів живе окремо — метрика `heroInkAlpha` у
   * `scripts/check-ui-canon-ratchet.mjs` (з 2026-10-01 baseline = 0: це
   * заборона, не стеля над боргом; 20 місць прибрано, градієнт не чіпали).
   * Тут закріплені ЧИСЛА, які пояснюють, чому нуль, а не «трохи менше
   * прозорості»: /80 і нижче не тримає жоден із чотирьох градієнтів, а
   * проміжні кроки (/90-/95) тримають на одних і не тримають на інших
   * (teal-700 /90 = 4.55, rose-700 /90 = 4.42), тож «безпечної» альфи
   * немає навіть формально. Якщо хтось освітлить геро-градієнт, впаде
   * перший тест і назве модуль; якщо потемнить настільки, що /80 почне
   * проходити, впаде другий і змусить перечитати рішення, а не мовчки
   * лишить заборону без підстав.
   *
   * Світлий кінець береться зі `theme.css` (див. `heroGradientStops`), а не
   * з палітри: з 2026-10-01 кінець градієнта Їжі — `#4e6f10`, середина між
   * lime-800 і lime-700, і в палітрі такого щабля немає.
   */
  describe("«Чорнило» на геро-градієнті — альфа", () => {
    const HERO_INK = "#fdf9f3";
    // Світлий (гірший) кінець кожного геро-градієнта зі `theme.css`.
    const heroLightEnds = Object.fromEntries(
      ["finyk", "fizruk", "routine", "nutrition"].map((m) => [
        m,
        lightestStop(heroGradientStops(m)),
      ]),
    );

    /** sRGB-композит чорнила з альфою поверх непрозорого фону. */
    function compositeHex(fgHex, bgHex, alpha) {
      const mix = (i) => {
        const fg = parseInt(fgHex.slice(1 + i * 2, 3 + i * 2), 16);
        const bg = parseInt(bgHex.slice(1 + i * 2, 3 + i * 2), 16);
        return Math.round(fg * alpha + bg * (1 - alpha));
      };
      return (
        "#" +
        [0, 1, 2].map((i) => mix(i).toString(16).padStart(2, "0")).join("")
      );
    }

    for (const [name, bg] of Object.entries(heroLightEnds)) {
      it(`${name}: повна непрозорість тримає AA на світлому кінці`, () => {
        expect(contrastRatio(HERO_INK, bg)).toBeGreaterThanOrEqual(4.5);
      });

      it(`${name}: /80 і нижче AA НЕ тримає — чому чорнило без альфи, а не випадковість`, () => {
        // Негативне твердження навмисне: воно фіксує, ЧОМУ метрика
        // `heroInkAlpha` стоїть на нулі. Якщо градієнт колись потемнішає
        // настільки, що /80 почне проходити, цей тест впаде і змусить
        // перечитати рішення, а не мовчки лишить заборону без підстав.
        expect(contrastRatio(compositeHex(HERO_INK, bg, 0.8), bg)).toBeLessThan(
          4.5,
        );
      });
    }

    it("nutrition — найтісніший модуль: кінець градієнта темніший за lime-700", () => {
      // До 2026-10-01 кінець був lime-700 `#567c0f` (4.67): прохідна лише
      // повна непрозорість, навіть /95 давав 4.40. Рішення власника
      // («темніший кінець градієнта») затемнило його до `#4e6f10` (5.55):
      // тепер /95 і /90 формально проходять, /80 ні (цикл вище). Цей тест
      // не дає тихо повернути кінець назад на lime-700.
      const end = heroLightEnds.nutrition;
      expect(luminance(end)).toBeLessThan(luminance(brandColors.lime[700]));
      expect(contrastRatio(HERO_INK, end)).toBeGreaterThanOrEqual(5.5);
    });
  });
});

/**
 * Чорнило проти КОЖНОЇ зупинки геро-градієнта й проти найсвітлішої зупинки
 * під заливкою осередка (follow-up аудиту контрасту 2026-10-01, A9;
 * рішення власника по Їжі: «темніший кінець градієнта»).
 *
 * Пари вище міряють чорнило проти ГОЛОЇ зупинки. Але осередки `MealStrip`
 * (Сніданок/Обід/Вечеря/Перекус) мають заливку `bg-hero-ink/5`, тож текст
 * у них лежить на зупинці, підсвіченій чорнилом: на колишньому кінці
 * lime-700 це 4.27 замість 4.67 (піксельний замір цього ж дня давав
 * 3.98-4.32 на найсвітлішому пікселі під написом). Тест міряє саме цей
 * найгірший реальний випадок для всіх чотирьох модулів: решта проходить із
 * запасом (4.59-4.73), Їжа до зміни — ні.
 */
describe("«Чорнило» на геро-градієнті — кожна зупинка і заливка осередка", () => {
  const HERO_INK = "#fdf9f3";
  const WASH_ALPHA = 0.05; // `bg-hero-ink/5` у MealStrip
  const mixHex = (fg, bg, a) =>
    "#" +
    [0, 1, 2]
      .map((i) => {
        const f = parseInt(fg.slice(1 + i * 2, 3 + i * 2), 16);
        const b = parseInt(bg.slice(1 + i * 2, 3 + i * 2), 16);
        return Math.round(f * a + b * (1 - a))
          .toString(16)
          .padStart(2, "0");
      })
      .join("");

  for (const module of ["finyk", "fizruk", "routine", "nutrition"]) {
    const stops = heroGradientStops(module);
    it(`${module}: у градієнті щонайменше дві зупинки`, () => {
      expect(stops.length).toBeGreaterThanOrEqual(2);
    });
    for (const stop of stops) {
      it(`${module}: hero-ink проти зупинки ${stop} ≥ 4.5:1`, () => {
        expect(contrastRatio(HERO_INK, stop)).toBeGreaterThanOrEqual(4.5);
      });
    }
    it(`${module}: найсвітліша зупинка під заливкою осередка (/5) ≥ 4.5:1`, () => {
      const lightest = lightestStop(stops);
      expect(
        contrastRatio(HERO_INK, mixHex(HERO_INK, lightest, WASH_ALPHA)),
      ).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("nutrition: колишній кінець lime-700 під заливкою осередка не проходить (чому градієнт затемнено)", () => {
    // Негативна пара фіксує причину зміни: без неї «повернути як було»
    // виглядало б безпечним, бо голий lime-700 проходить (4.67).
    expect(
      contrastRatio(
        HERO_INK,
        mixHex(HERO_INK, brandColors.lime[700], WASH_ALPHA),
      ),
    ).toBeLessThan(4.5);
  });

  /**
   * Перехідні стани осередків `MealStrip` (follow-up 2026-10-01, рішення
   * власника: «слабша підсвітка»). Заливка на hover/active лежить під тим
   * самим чорнилом, що й спокій, тож її теж міряємо проти найсвітлішої
   * зупинки Їжі. Читається з джерела компонента: повернення `/15` і `/20`
   * (4.06 і 3.67) валить тест.
   */
  describe("MealStrip: hover/active заливка осередка тримає ≥ 4.5:1", () => {
    // Зареєстрована шкала непрозорості (`sergeant-web-ui`: «0, 5, 8, 10,
    // 15, … 100»; `8` додано в `tailwind-preset.js`).
    const REGISTERED_SCALE = [
      0, 5, 8, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85,
      90, 95, 100,
    ];
    const lightest = lightestStop(heroGradientStops("nutrition"));
    const washContrast = (alphaPct) =>
      contrastRatio(HERO_INK, mixHex(HERO_INK, lightest, alphaPct / 100));
    const fillAlpha = (variant) => {
      const hits = [
        ...MEAL_STRIP_SRC.matchAll(
          new RegExp(`(?<![\\w:-])${variant}:bg-hero-ink/(\\d+)`, "g"),
        ),
      ];
      return hits.map((m) => Number(m[1]));
    };
    // Спокій осередка — окремий рядок-літерал у `cn(...)`; смуга частки
    // (`bg-hero-ink/15`, `/60`) і макро-треки мають власні `bg-hero-ink/NN`,
    // тож шукаємо літерал, що займає рядок сам.
    const restAlpha = Number(
      /^\s*"bg-hero-ink\/(\d+)",$/m.exec(MEAL_STRIP_SRC)?.[1],
    );

    it("спокій осередка — `bg-hero-ink/5` (база порівняння)", () => {
      expect(restAlpha).toBe(5);
    });

    for (const variant of ["hover", "active"]) {
      it(`${variant}: заливка знайдена, на зареєстрованій шкалі, не слабша за спокій`, () => {
        const alphas = fillAlpha(variant);
        expect(alphas.length).toBeGreaterThan(0);
        for (const a of alphas) {
          expect(REGISTERED_SCALE).toContain(a);
          expect(a).toBeGreaterThanOrEqual(restAlpha);
        }
      });

      it(`${variant}: чорнило проти найсвітлішої зупинки під заливкою ≥ 4.5:1`, () => {
        for (const a of fillAlpha(variant)) {
          expect(
            washContrast(a),
            `${variant}:bg-hero-ink/${a} → ${washContrast(a).toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      });
    }

    it("hover і active мають видимий відгук поза заливкою (контур), бо між `/5` і `/10` лишається лише `/8`", () => {
      expect(MEAL_STRIP_SRC).toMatch(/(?<![\w:-])hover:border-hero-ink\/\d+/);
      expect(MEAL_STRIP_SRC).toMatch(/(?<![\w:-])active:border-hero-ink\/\d+/);
    });

    it("шкала: `/8` проходить, `/10` і вище — ні (чому стеля hover — `/8`)", () => {
      expect(washContrast(8)).toBeGreaterThanOrEqual(4.5);
      expect(washContrast(10)).toBeLessThan(4.5);
      expect(washContrast(15)).toBeLessThan(4.5);
      expect(washContrast(20)).toBeLessThan(4.5);
    });
  });
});

/**
 * `{module}-edge` — контур вибраного стану модуля (follow-up аудиту
 * контрасту 2026-10-01, A4; рішення власника: «тонований фон + контур
 * -strong з контрастом ≥3:1 проти сусідньої поверхні»).
 *
 * Токен — аліас на `--c-{module}-ink` (світла -800, темна -400), тож
 * гарантії дає той самий щабель, що вже тримає текст модуля. Тут пінимо
 * (1) зв'язок пресета з цією змінною, щоб `-edge` не розʼїхався з `-ink`,
 * і (2) 3:1 проти УСІХ сусідніх поверхонь вибраного стану: картка, стіл,
 * зона, `panelHi` і тонована заливка самого вибору (`surface`).
 */
describe("@sergeant/design-tokens — `{module}-edge`: контур вибраного стану ≥ 3:1", () => {
  const MODULES = ["finyk", "fizruk", "routine", "nutrition"];
  const LIGHT_PANEL = "#ffffff";
  const LIGHT_PANEL_HI = "#f6f5f2";
  const DARK = inkTheme.surface;

  const triple = (hex) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");

  for (const m of MODULES) {
    it(`${m}.edge → --c-${m}-ink з fallback на світлий -strong`, async () => {
      const { default: preset } = await import("./tailwind-preset.js");
      expect(preset.theme.extend.colors[m].edge).toBe(
        `rgb(var(--c-${m}-ink, ${triple(accentStrongHex[m])}) / <alpha-value>)`,
      );
    });

    for (const [name, surface] of [
      ["картка", LIGHT_PANEL],
      ["panelHi", LIGHT_PANEL_HI],
      ["стіл модуля", moduleSurfaces[m].light.desk],
      ["зона модуля", moduleSurfaces[m].light.zone],
      ["стіл хаба", "#e7e5df"],
      ["тонована заливка (surface)", moduleColors[m].surface],
    ]) {
      it(`light: ${m}-edge проти ${name} ≥ 3:1`, () => {
        expect(
          contrastRatio(accentStrongHex[m], surface),
        ).toBeGreaterThanOrEqual(3);
      });
    }

    for (const [name, surface] of [
      ["картка", DARK.surface],
      ["panelHi", DARK.surfaceHi],
      ["фон", DARK.bg],
      ["зона модуля", moduleSurfaces[m].dark.zone],
    ]) {
      it(`dark: ${m}-edge проти ${name} ≥ 3:1`, () => {
        expect(contrastRatio(accentInkHex[m], surface)).toBeGreaterThanOrEqual(
          3,
        );
      });
    }
  }
});

/**
 * `fizruk-surface` — тема-залежна тонована заливка (follow-up аудиту
 * контрасту 2026-10-02).
 *
 * Дефект: `bg-fizruk-surface` був статичним hex (cyan-50 `#ecfeff`) без
 * темного перевизначення. У темній темі заливка лишалась світлою під
 * світлішим текстом: вибраний чип активної сесії («Розминка 0/3», «Нотатка»,
 * «Час») мав `text-fizruk-soft-fg` 1.39:1, лічильник `0/3` (`text-text`)
 * 1.05:1, бейдж суперсету `A1` 1.39:1, назва поточного рядка списку 1.05:1,
 * RPE-чип 1.74:1, галочка обладнання в каталозі ~1.4:1. 13 з 15 вживань у
 * Фізруку не мали ручної `dark:`-пари.
 *
 * Лікування на рівні токена: `--c-fizruk-surface` (світла cyan-50, темна —
 * cyan-700 @15% над `--c-panel`, дзеркало пари `dark:bg-fizruk-surface-dark/15`).
 * Тест читає значення зі `theme.css`, а не з копії: що малює браузер, те й
 * міряємо. Якщо темної декларації немає — береться те, що лишається
 * (світле значення), тобто рівно старий дефект, і тест червоніє.
 */
describe("@sergeant/design-tokens — `fizruk-surface`: темна пара заливки", () => {
  const CSS = THEME_CSS.replace(/\/\*[\s\S]*?\*\//g, "");

  /**
   * Усі декларації `--name: R G B;` у блоках із ТОЧНИМ селектором (`.dark`,
   * `:root`, `html.hc.dark`), у порядку появи в файлі. Коментарі вже
   * вирізані, тож дужки в них не збивають підрахунок вкладеності.
   */
  function themeVar(selector, name) {
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const opener = new RegExp(`(?:^|[\\n}{;])\\s*${esc}\\s*\\{`, "g");
    const found = [];
    while (opener.exec(CSS)) {
      let depth = 1;
      let i = opener.lastIndex;
      while (depth > 0 && i < CSS.length) {
        const c = CSS[i++];
        if (c === "{") depth++;
        else if (c === "}") depth--;
      }
      const body = CSS.slice(opener.lastIndex, i - 1);
      const decl = new RegExp(`${name}:\\s*(\\d+\\s+\\d+\\s+\\d+)\\s*;`).exec(
        body,
      );
      if (decl) found.push(decl[1]);
    }
    return found;
  }
  const hexOf = (triple) => rgbTripleToHex(triple);
  const tripleOf = (hex) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");
  const need = (selector, name) => {
    const [v] = themeVar(selector, name);
    if (!v) throw new Error(`${name} не знайдено в ${selector} (theme.css)`);
    return hexOf(v);
  };
  const mix = (fgHex, bgHex, a) =>
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(
          parseInt(fgHex.slice(i, i + 2), 16) * a +
            parseInt(bgHex.slice(i, i + 2), 16) * (1 - a),
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");

  // Що реально малює браузер: власне перевизначення, інакше успадковане
  // світле, інакше fallback пресета (статичний cyan-50 — це і є старий дефект).
  const declared = (sel) => themeVar(sel, "--c-fizruk-surface")[0];
  const LIGHT_FILL = hexOf(
    declared(":root") ?? tripleOf(moduleColors.fizruk.surface),
  );
  const DARK_FILL = hexOf(
    declared(".dark") ??
      declared(":root") ??
      tripleOf(moduleColors.fizruk.surface),
  );

  it("пресет: `fizruk.surface` → `--c-fizruk-surface` з fallback на cyan-50", async () => {
    const { default: preset } = await import("./tailwind-preset.js");
    expect(preset.theme.extend.colors.fizruk.surface).toBe(
      `rgb(var(--c-fizruk-surface, ${tripleOf(moduleColors.fizruk.surface)}) / <alpha-value>)`,
    );
  });

  it("світла: `:root` = `moduleColors.fizruk.surface` (світлий вигляд не змінився)", () => {
    expect(LIGHT_FILL.toLowerCase()).toBe(
      moduleColors.fizruk.surface.toLowerCase(),
    );
  });

  it("темна: `.dark` має власне значення, не світле cyan-50", () => {
    expect(declared(".dark")).toBeDefined();
    expect(DARK_FILL.toLowerCase()).not.toBe(LIGHT_FILL.toLowerCase());
  });

  it("темна = cyan-700 (`--c-fizruk-surface-dark`) @15% над `--c-panel` (±1 на канал)", () => {
    const expected = mix(
      need(".dark", "--c-fizruk-surface-dark"),
      need(".dark", "--c-panel"),
      0.15,
    );
    for (const i of [1, 3, 5]) {
      const got = parseInt(DARK_FILL.slice(i, i + 2), 16);
      const want = parseInt(expected.slice(i, i + 2), 16);
      expect(Math.abs(got - want)).toBeLessThanOrEqual(1);
    }
  });

  // Ролі тексту й контуру, що реально лежать на цій заливці (виміряно на
  // екрані активної сесії, 393×852, 2026-10-02).
  const ROLES = [
    ["text — лічильник «0/3», назва поточного рядка", "--c-text"],
    ["muted", "--c-muted"],
    ["subtle — підрядок поточного рядка", "--c-subtle"],
    ["soft-fg — підпис вибраного чипа, бейдж A1", "--c-fizruk-soft-fg"],
    [
      "ink — RPE-чип, шеврон, «наступна вправа» (text-fizruk-strong)",
      "--c-fizruk-ink",
    ],
    ["danger-ink — «Ще рано: …» у поточному рядку", "--c-danger-ink"],
  ];

  for (const [label, name] of ROLES) {
    it(`світла: ${label} на заливці ≥ 4.5:1`, () => {
      expect(
        contrastRatio(need(":root", name), LIGHT_FILL),
      ).toBeGreaterThanOrEqual(4.5);
    });
    it(`темна: ${label} на заливці ≥ 4.5:1`, () => {
      const ratio = contrastRatio(need(".dark", name), DARK_FILL);
      expect(
        ratio,
        `${name} на ${DARK_FILL} → ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    });
  }

  // HC dark успадковує `--c-fizruk-surface` з `.dark`; текстові змінні має
  // власні (білий, `#e6e0da`, `#cfc7bf`, cyan-300). Контракт HC — ≥ 7:1.
  for (const [label, name] of ROLES.filter(([, n]) => n !== "--c-danger-ink")) {
    it(`HC dark: ${label} на заливці ≥ 7:1`, () => {
      const [own] = themeVar("html.hc.dark", name);
      const hex = hexOf(own ?? themeVar(".dark", name)[0]);
      const ratio = contrastRatio(hex, DARK_FILL);
      expect(
        ratio,
        `${name} на ${DARK_FILL} → ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(7);
    });
  }

  it("темна: контур `fizruk-edge` проти заливки, картки, `panelHi` і фону ≥ 3:1", () => {
    const edge = need(".dark", "--c-fizruk-ink");
    for (const [name, surface] of [
      ["заливка", DARK_FILL],
      ["картка", inkTheme.surface.surface],
      ["panelHi", inkTheme.surface.surfaceHi],
      ["фон", inkTheme.surface.bg],
    ]) {
      expect(
        contrastRatio(edge, surface),
        `edge проти ${name}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("негативна пара: статичний cyan-50 у темній — це 1.39:1 і 1.05:1 (старий дефект)", () => {
    const old = moduleColors.fizruk.surface;
    expect(
      contrastRatio(need(".dark", "--c-fizruk-soft-fg"), old),
    ).toBeLessThan(1.5);
    expect(contrastRatio(need(".dark", "--c-text"), old)).toBeLessThan(1.5);
  });
});
