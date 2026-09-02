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
import {
  brandColors,
  moduleColors,
  inkTheme,
  moduleAccentRgb,
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
const PAIRS = [
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
    "nutrition hero-ink on lime-700 (hero light end)",
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
  // Макро-шкала (бриф «Папір» §3). Сегменти несуть `text-white`, тому
  // тир обирався за AA, а не за яскравістю: -600 із пропозиції аудиту
  // фейлить (пари нижче фіксують і це), -700 проходить.
  ["macro protein — white on cyan-700", "#ffffff", brandColors.cyan[700], true],
  ["macro fat — white on rose-700", "#ffffff", brandColors.rose[700], true],
  ["macro carbs — white on lime-700", "#ffffff", brandColors.lime[700], true],
  [
    "macro protein — white on cyan-600 (відхилений тир)",
    "#ffffff",
    brandColors.cyan[600],
    false,
  ],
  [
    "macro carbs — white on lime-600 (відхилений тир)",
    "#ffffff",
    brandColors.lime[600],
    false,
  ],
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
  const muted = "#5c665f"; // meta / captions
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
});
