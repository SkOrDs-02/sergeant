/**
 * Last validated: 2026-08-08
 * Status: Active
 */
import { describe, it, expect } from "vitest";
import { SETTINGS_SECTIONS_CATALOG } from "./settingsSectionsCatalog";

// Токен, у якому кирилична й латинська літери стоять впритул одна до одної —
// такий рядок не збігається байт-у-байт ні з чисто кириличним запитом, ні з
// чисто латинською транслітерацією, тож стає непошуковним для обох.
const MIXED_ALPHABET_TOKEN_RE = /[a-z][а-яіїєґ]|[а-яіїєґ][a-z]/i;

describe("SETTINGS_SECTIONS_CATALOG — keywords hygiene", () => {
  // Дефект #6 (CodeRabbit post-merge review PR #756): keywords секції
  // "nutrition" містили `kбжу` — латинська `k` + кирилиця `бжу`. Запит
  // «кбжу» (те, що людина реально набирає) не матчив нічого, бо жоден
  // whitespace-токен у keywords не дорівнював чисто кириличному «кбжу».
  it("does not contain mixed-alphabet tokens in any section's keywords (regression guard)", () => {
    for (const section of SETTINGS_SECTIONS_CATALOG) {
      const tokens = section.keywords.split(/\s+/);
      for (const token of tokens) {
        expect(
          MIXED_ALPHABET_TOKEN_RE.test(token),
          `section "${section.id}" keyword token "${token}" mixes Latin and Cyrillic letters`,
        ).toBe(false);
      }
    }
  });

  it("nutrition section matches the Cyrillic query «кбжу» and the Latin transliteration «kbzhu»", () => {
    const nutrition = SETTINGS_SECTIONS_CATALOG.find(
      (section) => section.id === "nutrition",
    );
    expect(nutrition).toBeDefined();
    const tokens = nutrition?.keywords.split(/\s+/) ?? [];
    expect(tokens).toContain("кбжу");
    expect(tokens).toContain("kbzhu");
  });
});
