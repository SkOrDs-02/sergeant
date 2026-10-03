/**
 * Last validated: 2026-08-21
 * Status: Active
 *
 * Інваріанти спільної мапи гліфів категорій.
 *
 * Тест існує замість ESLint-правила: `no-emoji-icon` retired разом з
 * рештою естетичних AST-правил (ADR-0081), тож заборону «жодного емодзі
 * в підписі» тримає перевірка ПОРУЧ ІЗ ДАНИМИ, яку не обійти імпортом.
 */
import { describe, it, expect } from "vitest";
import { MCC_CATEGORIES, INCOME_CATEGORIES, PAGES } from "../constants.js";
import {
  CATEGORY_ICON_NAMES,
  CATEGORY_ICON_SLUGS,
  DEFAULT_CATEGORY_ICON,
  categoryIconName,
} from "./categoryIcons.js";
import { MANUAL_EXPENSE_TAXONOMY } from "./manualTaxonomy.js";

const EMOJI = /\p{Extended_Pictographic}/u;

describe("підписи каталогів чисті від емодзі", () => {
  // Регресія на репорт тестувальника 2026-08-21. Доти резолвер віддавав
  // `"🛒 Продукти"`, і поверхні розходились: рядок транзакції зрізав
  // префікс і малював SVG, картка ліміту показувала емодзі як «іконку».
  it.each([
    ["MCC_CATEGORIES", MCC_CATEGORIES],
    ["INCOME_CATEGORIES", INCOME_CATEGORIES],
    ["PAGES", PAGES],
  ])("%s", (_name, list) => {
    for (const c of list as readonly { id: string; label: string }[]) {
      expect(EMOJI.test(c.label), `"${c.id}" → "${c.label}"`).toBe(false);
    }
  });
});

describe("CATEGORY_ICON_NAMES", () => {
  it("кожне значення належить закритому набору слагів", () => {
    const allowed = new Set<string>(CATEGORY_ICON_SLUGS);
    for (const [id, glyph] of Object.entries(CATEGORY_ICON_NAMES)) {
      expect(allowed.has(glyph), `"${id}" → "${glyph}"`).toBe(true);
    }
  });

  it("кожна MCC-категорія і кожен ручний слаг мають гліф", () => {
    for (const c of MCC_CATEGORIES) {
      expect(CATEGORY_ICON_NAMES[c.id], c.id).toBeDefined();
    }
    for (const d of MANUAL_EXPENSE_TAXONOMY) {
      expect(CATEGORY_ICON_NAMES[d.id], d.id).toBeDefined();
    }
  });

  // Кастомна категорія за визначенням поза каталогом — вона мусить
  // діставати гліф, а не порожній слот: саме порожнеча колись і
  // спонукала повернути емодзі «щоб хоч щось було».
  it("невідомий, кастомний і порожній id падають у дефолт", () => {
    expect(categoryIconName("cus_kava_z_druzyamy")).toBe(DEFAULT_CATEGORY_ICON);
    expect(categoryIconName(null)).toBe(DEFAULT_CATEGORY_ICON);
    expect(categoryIconName("")).toBe(DEFAULT_CATEGORY_ICON);
  });

  // Ручна таксономія спредиться ПЕРШОЮ саме щоб MCC-літерали нижче
  // лишились сильнішими на збіжних id. Порядок мовчазний — фіксуємо.
  it("MCC-літерал перекриває збіжний слаг ручної таксономії", () => {
    expect(categoryIconName("health")).toBe("droplet");
    expect(categoryIconName("entertainment")).toBe("play");
    // А те, чого в MCC немає, лишається за ручною таблицею.
    expect(categoryIconName("cafe")).toBe("coffee");
    expect(categoryIconName("utilities")).toBe("home");
  });
});
