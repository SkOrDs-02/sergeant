import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  brandColors,
  inkTheme,
  moduleColors,
} from "@sergeant/design-tokens/tokens";

/**
 * Лендінг живе на Tailwind 4 з `@theme`, а `packages/design-tokens` віддає
 * Tailwind-3 preset для apps/web – спільного рантайму немає. Тому синхронність
 * тримає не імпорт, а цей тест.
 *
 * Він не гіпотетичний: до нього лендінг малював finyk кольором emerald-500,
 * хоча дизайн-система пішла на teal-700 ще в 2026-07, і показував nutrition
 * відтінком, якого взагалі немає в жодній шкалі.
 */
const css = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "index.css"),
  "utf8",
);

/** Значення з `index.css`. `undefined` – токена немає, і це теж провал. */
function tokenHex(name: string): string | undefined {
  const m = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{3,8})`).exec(css);
  return m?.[1]?.toLowerCase();
}

/**
 * Очікуване значення з пакета токенів. Кидає, якщо токен зник upstream –
 * інакше `noUncheckedIndexedAccess` дав би `undefined`, і тест мовчки
 * порівнював би відсутність з відсутністю.
 */
function canonical(value: string | undefined, label: string): string {
  if (!value) throw new Error(`токен ${label} зник із @sergeant/design-tokens`);
  return value.toLowerCase();
}

describe("токени лендінга не розходяться з @sergeant/design-tokens", () => {
  it("бренд-акцент – emerald-700 / -800 / -50", () => {
    expect(tokenHex("accent")).toBe(
      canonical(brandColors.emerald[700], "emerald.700"),
    );
    expect(tokenHex("accent-hover")).toBe(
      canonical(brandColors.emerald[800], "emerald.800"),
    );
    expect(tokenHex("accent-soft")).toBe(
      canonical(brandColors.emerald[50], "emerald.50"),
    );
  });

  it.each([
    ["finyk", moduleColors.finyk.primary],
    ["fizruk", moduleColors.fizruk.primary],
    ["routine", moduleColors.routine.primary],
  ])("модульний акцент %s = moduleColors.primary", (name, primary) => {
    expect(tokenHex(name)).toBe(canonical(primary, `${name}.primary`));
  });

  it.each([
    ["finyk", moduleColors.finyk.surface],
    ["fizruk", moduleColors.fizruk.surface],
    ["routine", moduleColors.routine.surface],
    ["nutrition", moduleColors.nutrition.surface],
  ])("модульна поверхня %s = moduleColors.surface", (name, surface) => {
    expect(tokenHex(`${name}-soft`)).toBe(
      canonical(surface, `${name}.surface`),
    );
  });

  it("nutrition бере -strong companion, бо lime-500 не тримає контраст як текст", () => {
    // `moduleAccentRgb.nutrition.strong` = "70 98 18" = lime-800 #466212.
    expect(tokenHex("nutrition")).toBe("#466212");
    expect(tokenHex("nutrition")).not.toBe(
      canonical(moduleColors.nutrition.primary, "nutrition.primary"),
    );
  });

  it("«Чорнило» дзеркалить inkTheme, а не власну темну палітру", () => {
    // Темна секція звʼязків – це канонічний напрям продукту, а не вигаданий
    // для лендінга градієнт. Якщо inkTheme зрушить, тест впаде.
    expect(tokenHex("ink")).toBe(canonical(inkTheme.surface.bg, "ink.bg"));
    expect(tokenHex("ink-surface")).toBe(
      canonical(inkTheme.surface.surface, "ink.surface"),
    );
    expect(tokenHex("ink-text")).toBe(
      canonical(inkTheme.text.strong, "ink.text.strong"),
    );
    expect(tokenHex("ink-muted")).toBe(
      canonical(inkTheme.text.muted, "ink.text.muted"),
    );
  });

  it.each([
    ["finyk", inkTheme.accent.finyk],
    ["fizruk", inkTheme.accent.fizruk],
    ["routine", inkTheme.accent.routine],
    ["nutrition", inkTheme.accent.nutrition],
  ])("світіння %s на чорнилі = inkTheme.accent", (name, accent) => {
    // Тир-400 навмисно: тир-700, який працює на кремовому, на чорнилі
    // провалюється в фон.
    expect(tokenHex(`${name}-glow`)).toBe(canonical(accent, `ink.${name}`));
  });

  it("помилки мають власний семантичний токен, а не модульний акцент", () => {
    // Модульний accent у ролі кольору стану – той самий смелл, що ловить
    // module-accent containment в apps/web. `#c23a3a` історично був
    // coral-700, тобто той самий хекс, що й акцент Рутини; після переходу
    // рампи на rose (2026-08-07) цього збігу вже немає, але тест лишається
    // чинним і тепер ловить ширше: помилка не має ділити колір із жодним
    // модульним акцентом.
    expect(tokenHex("danger")).toBe("#c23a3a");
    expect(tokenHex("danger")).not.toBe(tokenHex("routine"));
  });
});
