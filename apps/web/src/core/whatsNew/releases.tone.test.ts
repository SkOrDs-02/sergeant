/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * Гейт тону нотаток релізу (PR-C8).
 *
 * Канон звертання — 2-а особа однини, «ти»; формальне «Ви» названо в
 * `docs/product/copy/style-guide.uk.md:95` серед «Ніколи» прямим текстом:
 * воно «створює офіційну дистанцію, недоречну для daily-use tool».
 *
 * Чому саме тут потрібен пін, а не вичитка. Нотатки релізу пише людина
 * поспіхом, у момент поставки, і вони єдина поверхня продукту, де текст
 * дописують НАПРИКІНЦІ роботи, а не разом із фічею. Аудит 2026-09-13
 * знайшов тут шість формальних форм при 27 «ти»-формах у тому ж файлі —
 * тобто дрейф стався не через незгоду з правилом, а через те, що правило
 * ніхто не перевіряв.
 *
 * Сканується ЛИШЕ дані `RELEASES`, не файл: докстрінги легітимно цитують
 * і обговорюють копію, і гейт по тексту файлу червонів би на розмові про
 * саме правило.
 */
import { describe, it, expect } from "vitest";
import { RELEASES } from "./releases";

// Кирилична «межа слова»: у JS `\b` кирилицю не бачить, тож межу задаємо
// явно — інакше «страви», «умови», «новини» читались би як звертання.
const CYR = "А-Яа-яЇїІіЄєҐґ'’";
const FORMAL_YOU = new RegExp(
  `(?<![${CYR}])(ви|вам|вас|вами|ваш[${CYR}]*)(?![${CYR}])`,
  "gi",
);

/** Усі рядки, які людина справді читає на екрані. */
function userFacingStrings(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  for (const r of RELEASES) {
    out.push({ where: `${r.id}.title`, text: r.title });
    out.push({ where: `${r.id}.summary`, text: r.summary });
    r.items.forEach((item, i) => {
      out.push({ where: `${r.id}.items[${i}].text`, text: item.text });
    });
  }
  return out;
}

describe("нотатки релізу — тон звертання", () => {
  it("жодного формального «Ви» у видимому тексті", () => {
    const hits = userFacingStrings().flatMap(({ where, text }) => {
      const m = text.match(FORMAL_YOU);
      return m ? [`${where}: ${m.join(", ")}`] : [];
    });
    expect(hits).toEqual([]);
  });

  it("сканер справді щось бачить — інакше гейт порожній", () => {
    // Самоперевірка. Без неї помилка в регулярці (наприклад, хибний
    // lookbehind) зробила б тест вище вічнозеленим, і він виглядав би як
    // захист, нічого не захищаючи.
    expect(userFacingStrings().length).toBeGreaterThan(20);
    expect("за вашими репортами".match(FORMAL_YOU)).not.toBeNull();
    expect("Полагодив те, що ви наловили".match(FORMAL_YOU)).not.toBeNull();
    // І не спрацьовує на словах, усередині яких є ті самі літери.
    expect(
      "Фото страви, обидві умови, свіжі новини".match(FORMAL_YOU),
    ).toBeNull();
  });
});
