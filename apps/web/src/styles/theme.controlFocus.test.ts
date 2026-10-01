/**
 * Status: Active
 *
 * Гейт на ДВІ ролі, які аудит контрасту 2026-10-01 (A1, A3, A8) знайшов без
 * гейта: «колір індикатора фокусу» і «межа контролу».
 *
 * Обидві мають поріг 3:1 (WCAG 1.4.11) проти КОЖНОЇ поверхні, на якій
 * стоять. До цього гейта їх не існувало як окремих токенів: фокус брав
 * `--c-ring` через клас з прозорістю `ring-focus/45` (0 з 381 зупинок Tab
 * доходили до 3:1), а межа поля брала `--c-line` (1.32 / 1.56 проти картки).
 *
 * AI-DANGER: правила в кінці `theme.css` (`:focus-visible` і межа поля)
 * МУСЯТЬ стояти поза `@layer`. Усередині шару вони програють `.ring-2` /
 * `.border-line` з шару `utilities` незалежно від специфічності — і мовчки не
 * роблять нічого (той самий клас відмови, що в `theme.focusRingHc.test.ts`).
 * Тому тут пінимо не лише числа, а й ЛОКАЦІЮ правил.
 */
import { readFileSync } from "node:fs";
import {
  brandColors,
  controlEdge,
  moduleSurfaces,
} from "@sergeant/design-tokens/tokens";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./theme.css", import.meta.url), "utf8");

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Триплети `--x: R G B;`; блоки одного селектора зливаються. */
function variablesFor(selector: string): Record<string, string> {
  const values: Record<string, string> = {};
  const blocks = new RegExp(
    `(?:^|\\n)\\s*${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`,
    "g",
  );
  for (const block of css.matchAll(blocks)) {
    for (const v of block[1]!.matchAll(
      /--([\w-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g,
    )) {
      values[v[1]!] = `${v[2]} ${v[3]} ${v[4]}`;
    }
  }
  return values;
}

function hexToTriplet(hex: string): string {
  const n = (i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `${n(0)} ${n(1)} ${n(2)}`;
}

function luminance(triplet: string): number {
  const [r, g, b] = triplet.split(/\s+/).map(Number);
  const lin = [r!, g!, b!].map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const root = variablesFor(":root");
const dark = { ...root, ...variablesFor(".dark") };

/** Поверхні, на яких контрол або кільце реально стоять (hex → триплет). */
const LIGHT_SURFACES: Record<string, string> = {
  "c-panel": root["c-panel"]!,
  "c-panel-hi": root["c-panel-hi"]!,
  "c-bg": root["c-bg"]!,
  ...Object.fromEntries(
    Object.entries(moduleSurfaces).flatMap(([name, s]) => [
      [`${name} desk`, hexToTriplet(s.light.desk)],
      [`${name} zone`, hexToTriplet(s.light.zone)],
    ]),
  ),
};
const DARK_SURFACES: Record<string, string> = {
  "c-panel": dark["c-panel"]!,
  "c-panel-hi": dark["c-panel-hi"]!,
  "c-bg": dark["c-bg"]!,
  ...Object.fromEntries(
    Object.entries(moduleSurfaces).map(([name, s]) => [
      `${name} zone`,
      hexToTriplet(s.dark.zone),
    ]),
  ),
};

describe("--c-control (межа контролу): дзеркало tokens.js і поріг 3:1", () => {
  it("світле значення збігається з `controlEdge.light`", () => {
    expect(root["c-control"]).toBe(hexToTriplet(controlEdge.light));
  });
  it("темне значення збігається з `controlEdge.dark`", () => {
    expect(dark["c-control"]).toBe(hexToTriplet(controlEdge.dark));
  });
  for (const [name, surface] of Object.entries(LIGHT_SURFACES)) {
    it(`light: control проти ${name} ≥ 3:1`, () => {
      expect(contrast(root["c-control"]!, surface)).toBeGreaterThanOrEqual(3);
    });
  }
  for (const [name, surface] of Object.entries(DARK_SURFACES)) {
    it(`dark: control проти ${name} ≥ 3:1`, () => {
      expect(contrast(dark["c-control"]!, surface)).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("--c-focus-solid (суцільний колір індикатора фокусу): поріг 3:1", () => {
  // Базовий токен резолвиться у `--c-ring-strong` (`var()`), тож у карті
  // триплетів його нема — звіряємо саме цей зв'язок.
  it("база — `var(--c-ring-strong)` у `:root`", () => {
    expect(css).toMatch(
      /:root\s*\{[\s\S]*?--c-focus-solid:\s*var\(--c-ring-strong\)/,
    );
  });
  for (const [name, surface] of Object.entries(LIGHT_SURFACES)) {
    it(`light: ring-strong проти ${name} ≥ 3:1`, () => {
      expect(contrast(root["c-ring-strong"]!, surface)).toBeGreaterThanOrEqual(
        3,
      );
    });
  }
  for (const [name, surface] of Object.entries(DARK_SURFACES)) {
    it(`dark: ring-strong проти ${name} ≥ 3:1`, () => {
      expect(contrast(dark["c-ring-strong"]!, surface)).toBeGreaterThanOrEqual(
        3,
      );
    });
  }

  // Усередині модуля токен = `--c-{module}-ink` (світла -800, темна -400).
  for (const module of ["finyk", "fizruk", "routine", "nutrition"] as const) {
    it(`[data-module-accent="${module}"] бере \`--c-${module}-ink\``, () => {
      expect(css).toMatch(
        new RegExp(
          `html:not\\(\\.hc\\)\\s+\\[data-module-accent="${module}"\\]\\s*\\{\\s*--c-focus-solid:\\s*var\\(--c-${module}-ink\\);`,
        ),
      );
    });
    for (const [name, surface] of [
      [
        `${module} desk (light)`,
        hexToTriplet(moduleSurfaces[module].light.desk),
      ],
      [
        `${module} zone (light)`,
        hexToTriplet(moduleSurfaces[module].light.zone),
      ],
      ["c-panel (light)", LIGHT_SURFACES["c-panel"]!],
    ] as const) {
      it(`light: ${module}-ink проти ${name} ≥ 3:1`, () => {
        expect(
          contrast(root[`c-${module}-ink`]!, surface),
        ).toBeGreaterThanOrEqual(3);
      });
    }
    for (const [name, surface] of [
      [`${module} zone (dark)`, hexToTriplet(moduleSurfaces[module].dark.zone)],
      ["c-panel (dark)", DARK_SURFACES["c-panel"]!],
      ["c-panel-hi (dark)", DARK_SURFACES["c-panel-hi"]!],
    ] as const) {
      it(`dark: ${module}-ink проти ${name} ≥ 3:1`, () => {
        expect(
          contrast(dark[`c-${module}-ink`]!, surface),
        ).toBeGreaterThanOrEqual(3);
      });
    }
  }
});

describe("фокус на світлому hero-градієнті: `hero-ink` ≥ 4.5:1 проти кожної зупинки", () => {
  // Follow-up аудиту 2026-10-01: у піддереві модуля `--c-focus-solid` =
  // `--c-{m}-ink` (світла -800), а початок hero-градієнта — той самий тир, тож
  // кільце зливалось із фоном (≈1.0-1.3:1). Правило в кінці `theme.css`
  // підставляє чорнило `#fdf9f3`; тут пінимо, що воно тримає ≥4.5:1 (вище за
  // 3:1 індикатора: те саме чорнило несе текст hero) і що правило справді
  // ставить саме цей колір.
  const HERO_INK = "253 249 243";
  it("правило ставить `--c-focus-solid: 253 249 243`", () => {
    expect(css).toMatch(
      /html:not\(\.dark\) \[class\*="bg-hero-grad-"\]\s*\{\s*--c-focus-solid:\s*253 249 243;/,
    );
  });
  for (const module of ["finyk", "fizruk", "routine", "nutrition"] as const) {
    const decl = new RegExp(
      `--hero-grad-${module}:\\s*linear-gradient\\(([^)]*)\\)`,
    ).exec(css);
    it(`${module}: градієнт у :root знайдено`, () => {
      expect(
        decl,
        `--hero-grad-${module} не знайдено в theme.css`,
      ).not.toBeNull();
    });
    const stops = [...(decl?.[1] ?? "").matchAll(/#([0-9a-fA-F]{6})\b/g)].map(
      (m) => hexToTriplet(`#${m[1]}`),
    );
    it(`${module}: у градієнті є щонайменше дві зупинки`, () => {
      expect(stops.length).toBeGreaterThanOrEqual(2);
    });
    for (const stop of stops) {
      it(`${module}: hero-ink проти зупинки rgb(${stop}) ≥ 4.5:1`, () => {
        expect(contrast(HERO_INK, stop)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe("Switch: трек і бігунок — стани розрізняються ≥3:1 (CodeRabbit на #1286)", () => {
  // `dark:bg-brand-400` (#a8a29e) проти вимкненого `bg-control` (#827b77) давав
  // 1.65:1: стани майже не розрізнялись. Тут числа беруться ЗІ ДЖЕРЕЛА
  // компонента (regex по `Switch.tsx`), а не з копії: правка класу без правки
  // пари валить саме цей гейт.
  const source = readFileSync(
    new URL("../shared/components/ui/Switch.tsx", import.meta.url),
    "utf8",
  );
  // `stone` є в `brandColors` у runtime, але не в `BrandColor` у `index.d.ts`.
  const stoneRamp = (
    brandColors as unknown as Record<string, Record<string, string>>
  )["stone"]!;
  const stone = (tier: string): string => hexToTriplet(stoneRamp[tier]!);
  const darkTrackTier = /"bg-brand-strong dark:bg-brand-(\d+)"/.exec(
    source,
  )?.[1];

  it("клас увімкненого треку знайдено в джерелі", () => {
    expect(
      darkTrackTier,
      "не знайдено `dark:bg-brand-NNN` у Switch.tsx",
    ).toBeDefined();
  });
  it("світла: увімкнений `brand-strong` (stone-800) проти вимкненого `control` ≥ 3:1", () => {
    expect(contrast(stone("800"), root["c-control"]!)).toBeGreaterThanOrEqual(
      3,
    );
  });
  it("темна: увімкнений трек проти вимкненого `control` ≥ 3:1", () => {
    expect(
      contrast(stone(darkTrackTier!), dark["c-control"]!),
    ).toBeGreaterThanOrEqual(3);
  });
  it("темна: увімкнений трек проти картки й `panelHi` ≥ 3:1", () => {
    for (const surface of [dark["c-panel"]!, dark["c-panel-hi"]!]) {
      expect(contrast(stone(darkTrackTier!), surface)).toBeGreaterThanOrEqual(
        3,
      );
    }
  });
  it("темна: вимкнений трек проти картки й `panelHi` ≥ 3:1", () => {
    for (const surface of [dark["c-panel"]!, dark["c-panel-hi"]!]) {
      expect(contrast(dark["c-control"]!, surface)).toBeGreaterThanOrEqual(3);
    }
  });
  it("темна: бігунок увімкненого (`dark:bg-bg`) проти треку ≥ 3:1, а світлий `dark:bg-text` на ньому б зник", () => {
    expect(source).toMatch(/currentChecked && "dark:bg-bg"/);
    expect(
      contrast(dark["c-bg"]!, stone(darkTrackTier!)),
    ).toBeGreaterThanOrEqual(3);
    expect(contrast(dark["c-text"]!, stone(darkTrackTier!))).toBeLessThan(3);
  });
  it("темна: бігунок вимкненого (`dark:bg-text`) проти `control` ≥ 3:1", () => {
    expect(
      contrast(dark["c-text"]!, dark["c-control"]!),
    ).toBeGreaterThanOrEqual(3);
  });
  it("світла: бігунок `bg-panel` проти обох треків ≥ 3:1", () => {
    expect(contrast(root["c-panel"]!, stone("800"))).toBeGreaterThanOrEqual(3);
    expect(
      contrast(root["c-panel"]!, root["c-control"]!),
    ).toBeGreaterThanOrEqual(3);
  });
});

describe("світла `--c-line`: контур картки читається на столі", () => {
  // Аудит A8: `#e2e0da` давав 1.05 проти столу хаба — межа картки на столі
  // була невидима. Паритет із темною (1.56 проти картки): ≥1.5 / ≥1.2.
  it("проти картки ≥ 1.5:1", () => {
    expect(contrast(root["c-line"]!, root["c-panel"]!)).toBeGreaterThanOrEqual(
      1.5,
    );
  });
  for (const [name, s] of Object.entries(moduleSurfaces)) {
    it(`проти столу ${name} ≥ 1.15:1`, () => {
      expect(
        contrast(root["c-line"]!, hexToTriplet(s.light.desk)),
      ).toBeGreaterThanOrEqual(1.15);
    });
  }
  it("ієрархія weak < line < strong збережена (strong темніша за line)", () => {
    expect(luminance(root["c-border-strong"]!)).toBeLessThan(
      luminance(root["c-line"]!),
    );
    expect(luminance(root["c-line"]!)).toBeLessThan(
      luminance(root["c-divider-weak"]!),
    );
  });
});

describe("локація правил: ПОЗА `@layer` (інакше вони не діють); виняток — межа полів у `utilities`", () => {
  /** Глибина дужок на позиції `index` (рахуємо `{`/`}` поза коментарями). */
  function depthAt(index: number): number {
    const text = css.slice(0, index).replace(/\/\*[\s\S]*?\*\//g, "");
    let depth = 0;
    for (const ch of text) {
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    return depth;
  }

  const RULES: Record<string, RegExp> = {
    "колір кільця на :focus-visible":
      /\n\*:focus-visible:not\(\.focus-ring\)\s*\{/,
    "контур для елементів без кільця":
      /\n:is\(\s*a\[href\][\s\S]*?\):focus-visible:not\(\.focus-ring\):not\(\[class\*="ring-"\]\)\s*\{/,
    "peer-кільце (Switch)":
      /\n\.peer:focus-visible ~ \[class\*="peer-focus-visible:ring"\]\s*\{/,
    "кільце невалідного поля":
      /\n\*:focus-visible\[aria-invalid="true"\]:not\(\.focus-ring\)\s*\{/,
    "фокус на світлому hero-градієнті (hero-ink)":
      /\nhtml:not\(\.dark\) \[class\*="bg-hero-grad-"\]\s*\{/,
  };
  for (const [name, re] of Object.entries(RULES)) {
    it(`${name}: правило є і стоїть на нульовій глибині`, () => {
      const match = re.exec(css);
      expect(match, `правило «${name}» не знайдено в theme.css`).not.toBeNull();
      expect(depthAt(match!.index + 1)).toBe(0);
    });
  }

  describe("межа голих input/select/textarea.border-line (CodeRabbit на #1286)", () => {
    // Правило мусить (а) перебивати `.border-line` (0,1,0) і (б) поступатись
    // станові утиліті компонента (`hover:`/`focus:`/`aria-invalid:`/
    // `disabled:border-*`, усі (0,2,0)). Це можливо лише в `@layer utilities`
    // зі специфічністю (0,1,1): колишня форма поза шарами з голими `:not(...)`
    // мала (0,3,1) і перебивала всі ці утиліти (заміряно в Chromium).
    const re = /\n {2}input\.border-line:where\(/;
    const match = re.exec(css);

    it("правило є і стоїть у `@layer utilities` (глибина 1)", () => {
      expect(
        match,
        "правило межі полів не знайдено в theme.css",
      ).not.toBeNull();
      expect(depthAt(match!.index + 1)).toBe(1);
      const before = css.slice(0, match!.index);
      expect(before.lastIndexOf("@layer utilities")).toBeGreaterThan(
        before.lastIndexOf("@layer components"),
      );
    });
    it("колишньої форми — поза шарами, зі специфічністю (0,3,1) — немає", () => {
      expect(css).not.toMatch(/\ninput\.border-line:not\(/);
    });
    it("виняток для типів і `:focus-visible` загорнуто в `:where()` (специфічність 0)", () => {
      const block = css.slice(match!.index, css.indexOf("}", match!.index));
      expect(block).toMatch(
        /input\.border-line:where\(\s*:not\([\s\S]*?\)\s*\):where\(:not\(:focus-visible\)\)/,
      );
      expect(block).toContain("select.border-line:where(:not(:focus-visible))");
      expect(block).toContain(
        "textarea.border-line:where(:not(:focus-visible))",
      );
      // Жодного «голого» `:not(` поза `:where(`: він піднімає специфічність.
      const stripped = block.replace(
        /:where\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)/g,
        "",
      );
      expect(stripped).not.toMatch(/:not\(/);
    });
    it("не доповнено блокуванням станів (:hover/:disabled), яке прибрало б 3:1 з кожного поля на hover", () => {
      const block = css.slice(match!.index, css.indexOf("}", match!.index));
      expect(block).not.toMatch(/:hover|:disabled|aria-invalid/);
    });
  });

  it("`.zone-chip` — у `@layer components`, а не поза шарами", () => {
    // Відступ у два пробіли — це саме правило, а не згадка в коментарі.
    const index = css.indexOf("\n  .zone-chip {") + 1;
    expect(index).toBeGreaterThan(0);
    expect(depthAt(index)).toBe(1);
    const before = css.slice(0, index);
    expect(before.lastIndexOf("@layer components")).toBeGreaterThan(
      before.lastIndexOf("@layer base"),
    );
  });
});
