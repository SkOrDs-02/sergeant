/**
 * Status: Active
 *
 * Гейт на ЄДИНІСТЬ ink-поверхонь: `inkTheme.surface` у
 * `@sergeant/design-tokens` ↔ `.dark` у `theme.css` ↔ прев'ю-блок ↔
 * back-compat аліаси `--surface-*glass`.
 *
 * AI-CONTEXT (2026-09-12): цього гейта не було, і ink-поверхня розійшлась
 * на ТРИ значення в одному файлі. `.dark` шипив `#1f1a17` / `#2a231f`,
 * `--surface-glass` (на ньому тримаються `Card glass`, `Sheet`, `Popover`)
 * — `#1b1613`, а `[data-theme-preview="dark"]` — теж `#1b1613`, і це
 * попри власну шапку блоку «Keep these blocks in 1:1 lockstep with the
 * `:root`, `.dark`, `html.hc`, and `html.hc.dark` declarations above».
 * Наслідок у рантаймі: дві різні «картки» на одному екрані.
 *
 * AI-DANGER: обіцянка в коментарі гейтом не є. Саме та шапка й трималась
 * як «синхронно», поки значення розходились (джерело — коміт `2f0c49a`
 * 2026-09-06: підняв поверхні, оновив лише `.dark` і `tokens.js`).
 * Додаєш нову поверхневу змінну в `.dark` — додай її сюди, інакше
 * повертаєш той самий мовчазний дрейф.
 *
 * AI-DANGER: колір тут — це ПАРА (rgb, alpha), і перша версія цього файлу
 * альфу захоплювала та викидала. Через це `rgba(31, 26, 23, 0.95)` і
 * `rgba(31, 26, 23, 1)` були для гейта однакові, тобто прозорість
 * glass-аліасів могла зрушити непомітно — рівно той клас дірки, який цей
 * файл і закриває (знахідка рев'ю на PR #1112). Порівнюєш поверхні —
 * порівнюй обидві половини.
 */
import { readFileSync } from "node:fs";
import { inkTheme } from "@sergeant/design-tokens/tokens";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./theme.css", import.meta.url), "utf8");

/** Непрозорий триплет — це та сама пара з альфою 1; так порівняння однорідне. */
interface Colour {
  rgb: string;
  alpha: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Усі блоки селектора зливаються в одну мапу — у `theme.css` `.dark` оголошено двічі. */
function variablesFor(selector: string): Record<string, Colour> {
  const values: Record<string, Colour> = {};
  const blocks = new RegExp(
    `(?:^|\\n)\\s*${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`,
    "g",
  );
  for (const block of css.matchAll(blocks)) {
    const body = block[1]!;
    for (const v of body.matchAll(/--([\w-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) {
      values[`--${v[1]!}`] = { rgb: `${v[2]} ${v[3]} ${v[4]}`, alpha: 1 };
    }
    // rgba-форма: back-compat аліаси `--surface-*glass` несуть альфу.
    for (const v of body.matchAll(
      /--([\w-]+):\s*rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)\s*;/g,
    )) {
      values[`--${v[1]!}`] = {
        rgb: `${v[2]} ${v[3]} ${v[4]}`,
        alpha: Number(v[5]),
      };
    }
  }
  return values;
}

function hexToColour(hex: string): Colour {
  const h = hex.replace("#", "");
  return {
    rgb: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(" "),
    alpha: 1,
  };
}

/** Той самий колір, але з явною альфою — для напівпрозорих аліасів. */
function withAlpha(colour: Colour | undefined, alpha: number): Colour {
  return { rgb: colour?.rgb ?? "(відсутній)", alpha };
}

const dark = variablesFor(".dark");
const preview = variablesFor('[data-theme-preview="dark"]');
const darkHc = variablesFor("html.hc.dark");

describe("theme.css — ink-поверхні не розходяться з inkTheme", () => {
  it.each([
    ["--c-bg", inkTheme.surface.bg],
    ["--c-panel", inkTheme.surface.surface],
    ["--c-panel-hi", inkTheme.surface.surfaceHi],
  ])("`.dark` %s = %s з inkTheme", (variable, hex) => {
    expect(dark[variable]).toEqual(hexToColour(hex));
  });

  it("`--c-ring-offset` дорівнює панелі — обведення сідає на картку", () => {
    expect(dark["--c-ring-offset"]).toEqual(dark["--c-panel"]);
  });
});

describe("theme.css — прев'ю-блок у 1:1 із `.dark`", () => {
  it.each(["--c-bg", "--c-panel", "--c-panel-hi", "--c-text"])(
    "%s однаковий у `.dark` і `[data-theme-preview=dark]`",
    (variable) => {
      expect(preview[variable]).toEqual(dark[variable]);
    },
  );
});

describe("theme.css — back-compat glass-аліаси сидять на тій самій поверхні", () => {
  // `--surface-*glass` — deprecated аліаси під «Чорнилом» (глибина = tint +
  // бордер + glow, не прозорість). Вони лишились, щоб наявні call-sites
  // `bg-surface-glass*` резолвились без переписування компонентів, — але
  // саме тому мусять віддавати РІВНО панель, і непрозоро.
  it.each([
    "--surface-glass",
    "--surface-strong-glass",
    "--surface-soft-glass",
  ])("`.dark` %s = `--c-panel` і повністю непрозорий", (variable) => {
    expect(dark[variable]).toEqual(withAlpha(dark["--c-panel"], 1));
  });

  it("`html.hc.dark` тримає пару panel / panel-hi з власними альфами", () => {
    // У високому контрасті `soft` навмисно на 0.95 — єдина напівпрозора
    // поверхня в системі. Число тут перевіряється, а не переноситься: до
    // цього гейт альфу викидав, і зміна 0.95 на будь-що лишалась зеленою.
    expect(darkHc["--surface-glass"]).toEqual(withAlpha(dark["--c-panel"], 1));
    expect(darkHc["--surface-strong-glass"]).toEqual(
      withAlpha(dark["--c-panel-hi"], 1),
    );
    expect(darkHc["--surface-soft-glass"]).toEqual(
      withAlpha(dark["--c-panel"], 0.95),
    );
  });
});
