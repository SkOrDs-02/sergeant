/**
 * Last validated: 2026-08-08
 * Status: Active
 */
import { describe, it, expect } from "vitest";
import { SETTINGS_SECTIONS_CATALOG } from "./settingsSectionsCatalog";

// CodeRabbit post-merge review PR #757 (зауваження #2): попередня версія
// цього гейту (`/[a-z][а-яіїєґ]|[а-яіїєґ][a-z]/i`) ловила лише СУСІДНІ
// латинську й кириличну літери без жодного символу між ними (регрес
// `kбжу` — дефект #6, PR #756). Назва тесту обіцяє ширше — «no
// mixed-alphabet tokens» узагалі, а токен, де два алфавіти розділені
// НЕ-літерним роздільником (дефіс, слеш, апостроф, цифра), під той регекс
// не підпадав.
//
// Виміряно вручну (2026-08-08) перед фіксом: жоден keyword-токен у
// каталозі НЕ містить обох алфавітів через роздільник — усі "складені на
// вигляд" токени (`kbzhu`, `кбжу`, `dataExport`-подібні тощо) насправді
// чисто одноалфавітні. Тобто наївне посилення гейту («чи токен містить
// БОДАЙ ОДНУ латинську ТА ОДНУ кириличну літеру будь-де в рядку», без
// урахування роздільників) зараз нічого б legit не зламало — але це
// випадковість поточного стану каталогу, а не гарантія на майбутнє: такий
// наївний гейт спалахнув би червоним на першому ж легітимному складеному
// токені штибу "sms-нагадування" чи "iOS/андроїд".
//
// Рішення: розбиваємо кожен whitespace-токен ще й на "атоми" — по БУДЬ-якому
// НЕ-літерному символу (пробіл уже знятий зовнішнім split, лишаються дефіс,
// слеш, апостроф, цифри, розділові знаки) — і перевіряємо змішаність
// алфавітів У МЕЖАХ КОЖНОГО АТОМА окремо. Це ловить справжню ваду (одне
// СЛОВО, зліплене з двох алфавітів впритул, як `kбжу` — атом сам собою
// мішаний) і не чіпає складені токени, де кожна половина — чистий
// одноалфавітний атом.
const LATIN_LETTER_RE = /[a-z]/i;
const CYRILLIC_LETTER_RE = /[а-яіїєґ]/i;
const NON_LETTER_ATOM_SPLIT_RE = /[^a-zа-яіїєґ]+/i;

function splitIntoAtoms(token: string): string[] {
  return token.split(NON_LETTER_ATOM_SPLIT_RE).filter(Boolean);
}

function hasMixedAlphabetAtom(token: string): boolean {
  return splitIntoAtoms(token).some(
    (atom) => LATIN_LETTER_RE.test(atom) && CYRILLIC_LETTER_RE.test(atom),
  );
}

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
          hasMixedAlphabetAtom(token),
          `section "${section.id}" keyword token "${token}" mixes Latin and Cyrillic letters within a single atom`,
        ).toBe(false);
      }
    }
  });

  // Синтетичне покриття самого гейту (незалежне від поточного вмісту
  // каталогу — документує гарантію, а не лише повторює вимір вище).
  describe("hasMixedAlphabetAtom — atom-splitting guarantee", () => {
    it("still catches the historical regression: alphabets glued with no delimiter", () => {
      expect(hasMixedAlphabetAtom("kбжу")).toBe(true);
    });

    it("does not flag a delimiter-joined compound where each atom is single-alphabet", () => {
      expect(hasMixedAlphabetAtom("sms-нагадування")).toBe(false);
      expect(hasMixedAlphabetAtom("iOS/андроїд")).toBe(false);
      expect(hasMixedAlphabetAtom("kbzhu")).toBe(false);
      expect(hasMixedAlphabetAtom("кбжу")).toBe(false);
    });
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
