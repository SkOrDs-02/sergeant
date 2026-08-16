/**
 * Контракт палітри категорій Фініка.
 *
 * Що саме тут гейтиться і чому — три різні обіцянки, кожна вже раз
 * ламалась у цій кодовій базі:
 *
 * 1. **Хекси не розходяться з генератором.** Замороженому літералу в
 *    `tokens.js` немає сенсу, якщо його можна «підправити руками» —
 *    тоді hue-таблиця в `categoryColors.gen.js` стає декорацією.
 * 2. **Жоден колір категорії не сидить на hue модульного акценту.**
 *    Це умова власника (2026-08-11): категорії дістають власну родину
 *    саме тому, що чужий акцент усередині піддерева Фініка читається
 *    як «це інший модуль». Той самий клас помилки, який `chartHex`
 *    ловив у макро-шкалі (blue/yellow/green — hue поза системою).
 * 3. **Контраст.** `ink` мусить лишатись читабельним і на своєму
 *    `tint`, і на фоні сторінки, і на білій картці; `inkDark` — на
 *    `tintDark` і на поверхні «Чорнила».
 *
 * Last validated: 2026-08-11
 * Status: Active
 */
import { describe, it, expect } from "vitest";
import {
  categoryColors,
  categoryFallbackOrder,
  moduleColors,
  statusColors,
  brandColors,
} from "./tokens.js";
import {
  buildCategoryColors,
  CATEGORY_HUES,
  contrastRatio,
  hexToOklch,
} from "./categoryColors.gen.js";

/** Фон сторінки світлої теми та поверхня «Чорнила» — див. theme.css. */
const PAGE_BG = "#ecebe7";
const CARD_BG = "#ffffff";
const INK_SURFACE = "#1b1613";

/**
 * Смуги, у які категорії заходити не мають: чотири модульні акценти
 * (обидва тири — default і strong) плюс статус-червоний.
 */
const RESERVED = {
  "finyk teal-700": moduleColors.finyk.primary,
  "finyk teal-500": brandColors.teal[500],
  "fizruk cyan-700": moduleColors.fizruk.primary,
  "fizruk cyan-500": brandColors.cyan[500],
  "routine rose-500": moduleColors.routine.primary,
  "nutrition lime-500": moduleColors.nutrition.primary,
  danger: statusColors.danger,
};

/** Мінімальна кутова відстань між двома hue на колі. */
const hueGap = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * 15° — не кругле число заради краси: `travel` (53) і `utilities` (66)
 * різняться на 13, тобто поріг усередині родини свідомо нижчий. Але
 * до ЧУЖОГО акценту 15° — мінімум, за якого приглушений `tint` уже не
 * читається як бліда версія модульного кольору.
 */
const MIN_GAP_TO_ACCENT = 15;

describe("@sergeant/design-tokens — контракт categoryColors", () => {
  it("літерал у tokens.js збігається з виводом генератора", () => {
    expect(categoryColors).toEqual(buildCategoryColors());
  });

  for (const [id, [H]] of Object.entries(CATEGORY_HUES)) {
    // `other` — тепла нейтраль (C×0.12): її hue формально лежить у
    // жовтій зоні, але хрома настільки низька, що колір читається як
    // сірий. Перевіряти кутову відстань для майже-ахромата безглуздо.
    if (id === "other") continue;
    it(`${id} (H ${H}) — не на hue модульного акценту`, () => {
      for (const [name, hex] of Object.entries(RESERVED)) {
        const gap = hueGap(H, hexToOklch(hex).H);
        expect(
          gap,
          `hue категорії "${id}" (${H}°) за ${gap.toFixed(1)}° від "${name}" — ` +
            `менше за поріг ${MIN_GAP_TO_ACCENT}°`,
        ).toBeGreaterThanOrEqual(MIN_GAP_TO_ACCENT);
      }
    });
  }

  for (const [id, t] of Object.entries(categoryColors)) {
    it(`${id} — контраст ink/inkDark тримає AA`, () => {
      expect(contrastRatio(t.ink, t.tint)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.ink, PAGE_BG)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.ink, CARD_BG)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.inkDark, t.tintDark)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.inkDark, INK_SURFACE)).toBeGreaterThanOrEqual(4.5);
    });
  }

  /**
   * `other` і `income` сидять за 5° і 2° від сусіда по дузі — вони
   * тримаються не кутом, а хромою. Якщо хтось «вирівняє» їхній множник
   * до 1, гейт вище цього не побачить (hue не зрушив), а в стрічці
   * зʼявиться пара однакових чипів: `other` зіллється з `charity`,
   * `income` — з `entertainment`. Тому окремо міряємо саме хрому.
   */
  for (const [id, neighbour] of [
    ["other", "charity"],
    ["income", "entertainment"],
  ]) {
    it(`${id} відділений від "${neighbour}" хромою, а не кутом`, () => {
      const c = hexToOklch(categoryColors[id].tint).C;
      const n = hexToOklch(categoryColors[neighbour].tint).C;
      expect(
        n / c,
        `хрома "${id}" (${c.toFixed(4)}) надто близька до "${neighbour}" ` +
          `(${n.toFixed(4)}) — на сусідньому hue це той самий колір`,
      ).toBeGreaterThanOrEqual(2);
    });
  }

  it("fallback-порядок посилається лише на наявні категорії й без повторів", () => {
    for (const id of categoryFallbackOrder) {
      expect(categoryColors, `невідома категорія "${id}"`).toHaveProperty(id);
    }
    expect(new Set(categoryFallbackOrder).size).toBe(
      categoryFallbackOrder.length,
    );
  });
});
