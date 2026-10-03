/**
 * Last validated: 2026-08-21
 * Status: Active
 */
import { describe, it, expect } from "vitest";
import { ICON_NAMES } from "@shared/components/ui/Icon";
import { CATEGORY_ICON_SLUGS } from "@sergeant/finyk-domain/lib/categoryIcons";
import {
  CATEGORY_ICON_MAP,
  DEFAULT_CATEGORY_ICON_NAME,
  stripLeadingEmoji,
} from "./txRowHelpers";

describe("гліфи категорій ↔ каталог Icon", () => {
  // Домен тримає імена гліфів рядками (пакет не може імпортувати
  // web-тип `IconName`), тож розсинхрон «домен назвав гліф, якого в
  // наборі немає» ловиться тут. Без цієї перевірки `<Icon>` мовчки
  // нічого не намалює — і поверхня знову виглядатиме порожньою, як
  // виглядав слот категорії в `TransactionsBatchToolbar`.
  it("кожен доменний слаг існує в каталозі Icon", () => {
    for (const slug of CATEGORY_ICON_SLUGS) {
      expect(ICON_NAMES.includes(slug), slug).toBe(true);
    }
  });

  it("дефолтний гліф теж зареєстрований", () => {
    // `IconName` — це `keyof typeof PATHS`, тобто `string | number`
    // (індексна сигнатура каталогу). `ICON_NAMES` — `string[]`, тож
    // звужуємо явно, а не розширюємо тип масиву.
    expect(ICON_NAMES.includes(String(DEFAULT_CATEGORY_ICON_NAME))).toBe(true);
  });

  it("мапа не порожня і віддає гліф для базових категорій", () => {
    expect(CATEGORY_ICON_MAP["food"]).toBe("shopping-cart");
    expect(CATEGORY_ICON_MAP["restaurant"]).toBe("coffee");
  });
});

describe("stripLeadingEmoji", () => {
  // Вбудовані підписи чисті з 2026-08-21; функція лишається рівно для
  // назв КАСТОМНИХ категорій, які людина набирає сама.
  it("зрізає провідне емодзі й пробіл", () => {
    expect(stripLeadingEmoji("🍕 Піца з друзями")).toBe("Піца з друзями");
    expect(stripLeadingEmoji("🏠")).toBe("🏠");
  });

  it("чистий підпис не змінює", () => {
    expect(stripLeadingEmoji("Продукти")).toBe("Продукти");
  });
});
