/**
 * Контракт складу `chartHex` — дизайн-аудит 2026-07, бриф «Папір» §3.
 *
 * Проблема, яку правило закриває: токен може бути *зареєстрований* і при
 * цьому лишатись чужим системі. Макро-бар роками фарбувався у blue-500 /
 * yellow-500 / green-500 — жодного з цих hue немає в палітрі Sergeant,
 * лінтери мовчали (значення ж не hex у `className`, а токен), і на
 * lime-модулі бар читався як сторонній віджет.
 *
 * Правило: КОЖНЕ значення `chartHex` мусить бути або тиром бренд-палітри
 * (emerald / teal / cyan / cream / coral / lime), або ink-нейтраллю, або
 * статус-кольором. Статус — свідомий виняток: «перевитрата» має бути
 * червоною, і жоден бренд-hue цього не замінить.
 *
 * Last validated: 2026-07-21
 * Status: Active
 */
import { describe, it, expect } from "vitest";
import { brandColors, chartHex, inkTheme, statusColors } from "./tokens.js";

const norm = (v) => String(v).trim().toLowerCase();

/** Усі тири бренд-палітри — плоским списком. */
const BRAND_TIERS = new Set(
  Object.values(brandColors)
    .flatMap((family) => Object.values(family))
    .filter((v) => typeof v === "string" && v.startsWith("#"))
    .map(norm),
);

/** Ink-нейтралі: текстові тири + поверхні «Чорнила». */
const INK_NEUTRALS = new Set(
  [...Object.values(inkTheme.text), ...Object.values(inkTheme.surface)]
    .filter((v) => typeof v === "string" && v.startsWith("#"))
    .map(norm),
);

/**
 * Статус-кольори. Дозволені лише під ключами з семантикою статусу —
 * інакше «це ж статус» стає лазівкою для будь-якого чужого hue.
 */
const STATUS = new Set(
  Object.values(statusColors)
    .filter((v) => typeof v === "string")
    .map(norm),
);
const STATUS_KEYS = new Set(["limit"]);

describe("@sergeant/design-tokens — контракт складу chartHex", () => {
  for (const [key, value] of Object.entries(chartHex)) {
    it(`${key} (${value}) — бренд-hue, ink-нейтраль або дозволений статус`, () => {
      const v = norm(value);
      const allowed =
        BRAND_TIERS.has(v) ||
        INK_NEUTRALS.has(v) ||
        (STATUS_KEYS.has(key) && STATUS.has(v));
      expect(
        allowed,
        `chartHex.${key} = ${value} не належить ні бренд-палітрі, ні ink-нейтралям` +
          (STATUS.has(v)
            ? ` (це статус-колір, але ключ "${key}" не в STATUS_KEYS)`
            : ""),
      ).toBe(true);
    });
  }

  it("макро-шкала зібрана з трьох різних бренд-родин", () => {
    const macro = [chartHex.protein, chartHex.fat, chartHex.carbs].map(norm);
    expect(new Set(macro).size).toBe(3);
    const familyOf = (hex) =>
      Object.entries(brandColors).find(([, tiers]) =>
        Object.values(tiers).some((t) => norm(t) === hex),
      )?.[0];
    expect(macro.map(familyOf)).toEqual(["cyan", "coral", "lime"]);
  });
});
