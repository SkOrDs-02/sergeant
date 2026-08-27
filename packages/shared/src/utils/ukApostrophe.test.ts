/**
 * Last validated: 2026-08-26
 * Status: Active
 *
 * Канон `docs/01-product/copy/style-guide.uk.md` §1.10.
 */
import { describe, it, expect } from "vitest";
import { UA_APOSTROPHE, foldApostrophes } from "./ukApostrophe";

describe("foldApostrophes", () => {
  it("зводить усі вхідні форми до канонічної", () => {
    // Три форми, які реально трапляються: ASCII з клавіатури, типографська
    // з автозаміни, канонічна з нашого коду.
    const forms = ["'", "’", "ʼ"];
    expect(new Set(forms).size).toBe(3);
    for (const a of forms) {
      expect(foldApostrophes(`здоров${a}я`)).toBe("здоровʼя");
    }
  });

  it("ловить і ліву типографську лапку (деякі мобільні клавіатури)", () => {
    expect(foldApostrophes("здоров‘я")).toBe("здоровʼя");
  });

  it("канонічна форма проходить незмінною — операція ідемпотентна", () => {
    const once = foldApostrophes("імʼя та мʼязи");
    expect(foldApostrophes(once)).toBe(once);
    expect(once).toBe("імʼя та мʼязи");
  });

  it("не чіпає текст без апострофів", () => {
    expect(foldApostrophes("Продукти")).toBe("Продукти");
    expect(foldApostrophes("")).toBe("");
  });

  it("згортає ВСІ входження, не лише перше", () => {
    // Регресія на `String.replace` без прапорця `g`: він мовчки лишає
    // другий апостроф у формі, яка ключа вже не збігає.
    expect(foldApostrophes("зв'язок і пам'ять")).toBe("звʼязок і памʼять");
  });

  it("константа збігається з тим, у що згортає функція", () => {
    // Без цієї перевірки константу можна змінити окремо від регулярки, і
    // розʼїзд помітить лише той, хто дебажитиме пошук, що «раптом» не
    // знаходить.
    expect(foldApostrophes("'")).toBe(UA_APOSTROPHE);
  });
});
