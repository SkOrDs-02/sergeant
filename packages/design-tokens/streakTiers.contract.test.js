/**
 * Контракт драбини «жару» серії — дизайн-аудит цикл 4.
 *
 * Той самий клас правила, що `chartHex.contract.test.js`: компонентна
 * колірна драбина мусить складатися з бренд-тирів або статус/celebration
 * токенів, а не з довільних hue. До циклу 3 `StreakFlame` ротував
 * yellow → amber → orange → red → pink → violet — п'ять чужих родин, і
 * жоден лінтер їх не бачив, бо кольори жили гілками всередині компонента.
 *
 * Розширити правило вдалося саме тому, що цикл 4 переніс щаблі у токени:
 * у файлі токенів шейп стабільний, а гілки функції статично не вирішуються.
 *
 * Тест читає `theme.css` як текст — це єдине джерело правди для
 * тем-залежних пар, і парсити його дешевше, ніж дублювати значення в JS.
 *
 * Last validated: 2026-07-22
 * Status: Active
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brandColors, celebrationColors, statusColors } from "./tokens.js";

const THEME_CSS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "apps",
  "web",
  "src",
  "styles",
  "theme.css",
);

const css = readFileSync(THEME_CSS, "utf8");

/** `--c-streak-tier-14: 194 58 58;` → { "14": [194,58,58] }, у порядку появи. */
function readTiers() {
  const out = [];
  const re = /--c-streak-tier-(\d+):\s*([\d]+)\s+([\d]+)\s+([\d]+)\s*;/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    out.push({ tier: m[1], rgb: [+m[2], +m[3], +m[4]] });
  }
  return out;
}

const hex = ([r, g, b]) =>
  "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");

const ALLOWED = new Set(
  [
    ...Object.values(brandColors).flatMap((family) => Object.values(family)),
    ...Object.values(statusColors),
    // Святкування — узаконений п'ятий hue (див. `celebrationColors`).
    ...Object.values(celebrationColors),
  ]
    .filter((v) => typeof v === "string" && v.startsWith("#"))
    .map((v) => v.toLowerCase()),
);

describe("@sergeant/design-tokens — контракт драбини серії", () => {
  const tiers = readTiers();

  it("обидві теми оголошують повний набір щаблів", () => {
    // 6 щаблів × 2 теми (`:root` + `.dark`).
    expect(tiers).toHaveLength(12);
  });

  for (const [i, t] of tiers.entries()) {
    const theme = i < 6 ? "light" : "dark";
    it(`${theme} tier-${t.tier} (${hex(t.rgb)}) — з бренд-палітри або статус-токенів`, () => {
      expect(
        ALLOWED.has(hex(t.rgb)),
        `--c-streak-tier-${t.tier} = ${hex(t.rgb)} не належить бренд-палітрі`,
      ).toBe(true);
    });
  }

  it("драбина монотонна всередині кожної теми (щабель не світлішає назад)", () => {
    // Celebration-щабель (100) навмисно вибивається з монотонності —
    // сота доба це подія, а не «ще темніший coral», — тому він поза
    // перевіркою.
    const lum = ([r, g, b]) => {
      const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    for (const [from, to] of [
      [0, 5],
      [6, 11],
    ]) {
      // Обидві теми темнішають з ростом серії — просто стартують з різних
      // кінців шкали (світла з coral-600, темна з coral-300).
      const ramp = tiers.slice(from, to).map((t) => lum(t.rgb));
      for (let i = 1; i < ramp.length; i++) {
        expect(ramp[i]).toBeLessThanOrEqual(ramp[i - 1]);
      }
    }
  });
});
