import { describe, it, expect } from "vitest";
import { parseDpsCheckXml } from "./dpsXml.js";

// Фікстури тут — РЕКОНСТРУКЦІЯ за задокументованою структурою
// (CHECK/CHECKHEAD/CHECKBODY/ROW), НЕ знятий з реального `chkAll`
// payload (токен ДПС ще не згенеровано — відкритий гейт спеки,
// `docs/90-work/planning/specs/receipt-scan.md` § Ризики). Перший
// smoke-тест на живому чеку — обовʼязковий наступний крок.

// Варіант A: РРО, ROWNUM-атрибути, ціла сума в копійках, <CHECKS>-обгортка.
const RRO_FIXTURE = `<CHECKS>
<CHECK>
<CHECKHEAD>
<ORGNM>ТОВ "СІЛЬПО-ФУД"</ORGNM>
<ORGTIN>30363252</ORGTIN>
<ORDATE>20260115</ORDATE>
<ORTIME>143210</ORTIME>
<ORDERTAXNUM>4000123456</ORDERTAXNUM>
<SUM>15000</SUM>
</CHECKHEAD>
<CHECKBODY>
<ROW ROWNUM="1"><NAME>Молоко 2.5%</NAME><AMOUNT>1.000</AMOUNT><PRICE>3200</PRICE><COST>3200</COST></ROW>
<ROW ROWNUM="2"><NAME>Хліб</NAME><AMOUNT>2</AMOUNT><PRICE>2500</PRICE><COST>5000</COST></ROW>
<ROW ROWNUM="3"><NAME>Яблука</NAME><AMOUNT>0.850</AMOUNT><PRICE>8235</PRICE><COST>6800</COST></ROW>
<CHECKTOTAL><SUM>15000</SUM></CHECKTOTAL>
</CHECKBODY>
</CHECK>
</CHECKS>`;

// Варіант B: ПРРО-стиль — CDATA-назва, entity `&amp;`, кома-десятковий
// SUM/PRICE/COST (гривні, не копійки), DDMMYYYY-дата (не YYYYMMDD), 4-цифр
// час, БЕЗ ROWNUM-атрибута (fallback на порядковий індекс).
const PRRO_FIXTURE = `<CHECK>
<CHECKHEAD>
<ORGNM><![CDATA[ФОП Іваненко І.І.]]></ORGNM>
<ORGTIN>1234567890</ORGTIN>
<ORDATE>15012026</ORDATE>
<ORTIME>0905</ORTIME>
<ORDERTAXNUM>9988776655</ORDERTAXNUM>
<SUM>150,00</SUM>
</CHECKHEAD>
<CHECKBODY>
<ROW><NAME>Кава &amp; чай</NAME><AMOUNT>1</AMOUNT><PRICE>150,00</PRICE><COST>150,00</COST></ROW>
</CHECKBODY>
</CHECK>`;

// Зламаний XML: відсутній закриваючий </CHECKBODY></CHECK>.
const BROKEN_FIXTURE = `<CHECK><CHECKHEAD><ORGNM>Тест</ORGNM><ORDATE>20260115</ORDATE><ORTIME>120000</ORTIME><SUM>100</SUM></CHECKHEAD><CHECKBODY><ROW><NAME>Товар</NAME></ROW>`;

describe("parseDpsCheckXml — валідні варіанти", () => {
  it("парсить РРО-варіант (ROWNUM-атрибути, цілі копійки, <CHECKS>-обгортка)", () => {
    const parsed = parseDpsCheckXml(RRO_FIXTURE);
    expect(parsed).not.toBeNull();
    expect(parsed?.store).toBe('ТОВ "СІЛЬПО-ФУД"');
    expect(parsed?.storeTaxId).toBe("30363252");
    expect(parsed?.fiscalNum).toBe("4000123456");
    expect(parsed?.totalKopiykas).toBe(15000);
    expect(parsed?.purchasedAt.toISOString()).toBe("2026-01-15T12:32:10.000Z");
    expect(parsed?.items).toHaveLength(3);
    expect(parsed?.items[0]).toEqual({
      position: 1,
      name: "Молоко 2.5%",
      qty: 1,
      priceKopiykas: 3200,
      sumKopiykas: 3200,
    });
    expect(parsed?.items[2]).toEqual({
      position: 3,
      name: "Яблука",
      qty: 0.85,
      priceKopiykas: 8235,
      sumKopiykas: 6800,
    });
  });

  it("парсить ПРРО-варіант (CDATA, entity, кома-десяткова сума, DDMMYYYY-дата, без ROWNUM)", () => {
    const parsed = parseDpsCheckXml(PRRO_FIXTURE);
    expect(parsed).not.toBeNull();
    expect(parsed?.store).toBe("ФОП Іваненко І.І.");
    expect(parsed?.fiscalNum).toBe("9988776655");
    // "150,00" → гривні → 15000 копійок.
    expect(parsed?.totalKopiykas).toBe(15000);
    // DDMMYYYY (15.01.2026), 09:05 Kyiv (EET, UTC+2) → 07:05 UTC.
    expect(parsed?.purchasedAt.toISOString()).toBe("2026-01-15T07:05:00.000Z");
    expect(parsed?.items).toHaveLength(1);
    expect(parsed?.items[0]).toEqual({
      position: 1, // fallback на індекс — атрибута ROWNUM нема
      name: "Кава & чай", // &amp; декодовано
      qty: 1,
      priceKopiykas: 15000,
      sumKopiykas: 15000,
    });
  });

  it("пропускає нерозбірливий рядок (без NAME), не валить увесь чек", () => {
    const withBadRow = RRO_FIXTURE.replace(
      "<CHECKTOTAL>",
      '<ROW ROWNUM="4"><AMOUNT>1</AMOUNT><PRICE>100</PRICE><COST>100</COST></ROW><CHECKTOTAL>',
    );
    const parsed = parseDpsCheckXml(withBadRow);
    expect(parsed?.items).toHaveLength(3); // 4-й рядок без NAME пропущено
  });
});

describe("parseDpsCheckXml — зламаний / неповний вхід", () => {
  it("повертає null для порожнього рядка", () => {
    expect(parseDpsCheckXml("")).toBeNull();
  });

  it("повертає null, коли немає закриваючого </CHECK>", () => {
    expect(parseDpsCheckXml(BROKEN_FIXTURE)).toBeNull();
  });

  it("повертає null, коли немає <CHECK> взагалі", () => {
    expect(parseDpsCheckXml("<html><body>404</body></html>")).toBeNull();
  });

  it("повертає null, коли CHECKHEAD відсутній", () => {
    const xml =
      "<CHECK><CHECKBODY><ROW><NAME>x</NAME></ROW></CHECKBODY></CHECK>";
    expect(parseDpsCheckXml(xml)).toBeNull();
  });

  it("повертає null, коли ORGNM (назва магазину) відсутній", () => {
    const xml =
      "<CHECK><CHECKHEAD><ORDATE>20260115</ORDATE><ORTIME>120000</ORTIME><SUM>100</SUM></CHECKHEAD><CHECKBODY></CHECKBODY></CHECK>";
    expect(parseDpsCheckXml(xml)).toBeNull();
  });

  it("повертає null, коли SUM (сума) відсутня", () => {
    const xml =
      "<CHECK><CHECKHEAD><ORGNM>Тест</ORGNM><ORDATE>20260115</ORDATE><ORTIME>120000</ORTIME></CHECKHEAD><CHECKBODY></CHECKBODY></CHECK>";
    expect(parseDpsCheckXml(xml)).toBeNull();
  });

  it("повертає null, коли ORDATE не 8-значний чи неправдоподібний", () => {
    const xml =
      "<CHECK><CHECKHEAD><ORGNM>Тест</ORGNM><ORDATE>99999999</ORDATE><ORTIME>120000</ORTIME><SUM>100</SUM></CHECKHEAD><CHECKBODY></CHECKBODY></CHECK>";
    expect(parseDpsCheckXml(xml)).toBeNull();
  });

  it("повертає null для вхідного XML понад 512 KB", () => {
    const huge = `<CHECK>${"x".repeat(600 * 1024)}</CHECK>`;
    expect(parseDpsCheckXml(huge)).toBeNull();
  });
});

// Review-фікси (CRITICAL double-decode/injection + MAJOR sum-фолбек +
// Trivial numeric entities) — фікстури нижче навмисно ІЗОЛЬОВАНІ від
// RRO/PRRO-варіантів вище: кожна бʼє РІВНО в один патч.

describe("parseDpsCheckXml — sumKopiykas-фолбек (COST відсутній)", () => {
  it("округлює ДОБУТОК price*qty, не price*round(qty) — ваговий рядок (0.850 кг)", () => {
    const xml = `<CHECK><CHECKHEAD><ORGNM>Тест</ORGNM><ORDATE>20260115</ORDATE><ORTIME>120000</ORTIME><SUM>100</SUM></CHECKHEAD><CHECKBODY><ROW ROWNUM="1"><NAME>Яблука вагові</NAME><AMOUNT>0.850</AMOUNT><PRICE>8235</PRICE></ROW></CHECKBODY></CHECK>`;
    const parsed = parseDpsCheckXml(xml);
    expect(parsed?.items).toHaveLength(1);
    expect(parsed?.items[0]).toEqual({
      position: 1,
      name: "Яблука вагові",
      qty: 0.85,
      priceKopiykas: 8235,
      // Math.round(8235 * 0.85) = Math.round(6999.75) = 7000. СТАРИЙ баг:
      // price * Math.round(qty) = 8235 * Math.round(0.85) = 8235 * 1 = 8235.
      sumKopiykas: 7000,
    });
  });

  it("AMOUNT відсутній/нульовий/відʼємний → qty=1 фолбек (не 0, не відʼємне)", () => {
    const xml = `<CHECK><CHECKHEAD><ORGNM>Тест</ORGNM><ORDATE>20260115</ORDATE><ORTIME>120000</ORTIME><SUM>100</SUM></CHECKHEAD><CHECKBODY><ROW ROWNUM="1"><NAME>Товар А</NAME><AMOUNT>0</AMOUNT><PRICE>500</PRICE></ROW><ROW ROWNUM="2"><NAME>Товар Б</NAME><AMOUNT>-3</AMOUNT><PRICE>500</PRICE></ROW></CHECKBODY></CHECK>`;
    const parsed = parseDpsCheckXml(xml);
    expect(parsed?.items[0]).toMatchObject({ qty: 1, sumKopiykas: 500 });
    expect(parsed?.items[1]).toMatchObject({ qty: 1, sumKopiykas: 500 });
  });
});

describe("parseDpsCheckXml — контейнер-decode CRITICAL фікс (double-decode/injection)", () => {
  it("екранована розмітка в NAME НЕ породжує синтетичний ROW — лишається літеральним текстом", () => {
    const xml = `<CHECK>
<CHECKHEAD>
<ORGNM>Тест</ORGNM>
<ORDATE>20260115</ORDATE>
<ORTIME>120000</ORTIME>
<SUM>100</SUM>
</CHECKHEAD>
<CHECKBODY>
<ROW ROWNUM="1"><NAME>Знижка &lt;ROW ROWNUM=&quot;99&quot;&gt;&lt;NAME&gt;X&lt;/NAME&gt;&lt;COST&gt;-9999&lt;/COST&gt;&lt;/ROW&gt;</NAME><AMOUNT>1</AMOUNT><PRICE>100</PRICE><COST>100</COST></ROW>
</CHECKBODY>
</CHECK>`;
    const parsed = parseDpsCheckXml(xml);
    expect(parsed).not.toBeNull();
    // РІВНО 1 рядок — інжектований "ROW" у тексті НЕ став другим items[1].
    expect(parsed?.items).toHaveLength(1);
    expect(parsed?.items[0]?.name).toBe(
      'Знижка <ROW ROWNUM="99"><NAME>X</NAME><COST>-9999</COST></ROW>',
    );
    // COST справжнього (єдиного) рядка — не інжектована "-9999".
    expect(parsed?.items[0]?.sumKopiykas).toBe(100);
    expect(parsed?.totalKopiykas).toBe(100); // header SUM неушкоджений
  });

  it("декодує &amp;amp; РІВНО один раз — 'Кава &amp; чай', не подвійно-розкодоване 'Кава & чай'", () => {
    const xml = `<CHECK><CHECKHEAD><ORGNM>Тест</ORGNM><ORDATE>20260115</ORDATE><ORTIME>120000</ORTIME><SUM>100</SUM></CHECKHEAD><CHECKBODY><ROW ROWNUM="1"><NAME>Кава &amp;amp; чай</NAME><AMOUNT>1</AMOUNT><PRICE>100</PRICE><COST>100</COST></ROW></CHECKBODY></CHECK>`;
    const parsed = parseDpsCheckXml(xml);
    expect(parsed?.items[0]?.name).toBe("Кава &amp; чай");
  });

  it("ORGNM з екранованою лапкою/дужками через CHECKHEAD-контейнер декодується РІВНО один раз", () => {
    const xml = `<CHECK><CHECKHEAD><ORGNM>ТОВ &quot;Знак &lt;b&gt;&quot;</ORGNM><ORDATE>20260115</ORDATE><ORTIME>120000</ORTIME><SUM>100</SUM></CHECKHEAD><CHECKBODY></CHECKBODY></CHECK>`;
    const parsed = parseDpsCheckXml(xml);
    expect(parsed?.store).toBe('ТОВ "Знак <b>"');
  });
});

describe("parseDpsCheckXml — числові character references (Trivial фікс)", () => {
  it("декодує hex (&#x421;) і decimal (&#1057;) — обидва Cyrillic С (U+0421)", () => {
    const xml = `<CHECK><CHECKHEAD><ORGNM>Тест</ORGNM><ORDATE>20260115</ORDATE><ORTIME>120000</ORTIME><SUM>100</SUM></CHECKHEAD><CHECKBODY><ROW ROWNUM="1"><NAME>&#x421;&#1057;&#X421;</NAME><AMOUNT>1</AMOUNT><PRICE>100</PRICE><COST>100</COST></ROW></CHECKBODY></CHECK>`;
    const parsed = parseDpsCheckXml(xml);
    expect(parsed?.items[0]?.name).toBe("ССС");
  });

  it("декодує астральну (>0xFFFF) числову сутність через fromCodePoint, не обрізає fromCharCode-ом", () => {
    const xml = `<CHECK><CHECKHEAD><ORGNM>Тест</ORGNM><ORDATE>20260115</ORDATE><ORTIME>120000</ORTIME><SUM>100</SUM></CHECKHEAD><CHECKBODY><ROW ROWNUM="1"><NAME>Чек &#x1F600;</NAME><AMOUNT>1</AMOUNT><PRICE>100</PRICE><COST>100</COST></ROW></CHECKBODY></CHECK>`;
    const parsed = parseDpsCheckXml(xml);
    expect(parsed?.items[0]?.name).toBe("Чек \u{1F600}");
  });

  it("сурогатний код-поінт (&#xD800;) лишається буквальним текстом — fromCodePoint дав би самотній сурогат", () => {
    const xml = `<CHECK><CHECKHEAD><ORGNM>Тест &#xD800; магазин</ORGNM><ORDATE>20260115</ORDATE><ORTIME>120000</ORTIME><SUM>100</SUM></CHECKHEAD><CHECKBODY><ROW><NAME>Товар</NAME><PRICE>100</PRICE><COST>100</COST></ROW></CHECKBODY></CHECK>`;
    const parsed = parseDpsCheckXml(xml);
    expect(parsed?.store).toBe("Тест &#xD800; магазин");
  });

  it("невалідний код-поінт (поза 0..0x10FFFF) лишається буквальним текстом, не кидає", () => {
    const xml = `<CHECK><CHECKHEAD><ORGNM>Тест</ORGNM><ORDATE>20260115</ORDATE><ORTIME>120000</ORTIME><SUM>100</SUM></CHECKHEAD><CHECKBODY><ROW ROWNUM="1"><NAME>x&#99999999;y</NAME><AMOUNT>1</AMOUNT><PRICE>100</PRICE><COST>100</COST></ROW></CHECKBODY></CHECK>`;
    const parsed = parseDpsCheckXml(xml);
    expect(parsed?.items[0]?.name).toBe("x&#99999999;y");
  });
});

describe("parseDpsCheckXml — згруповані тисячні суми (MAJOR фікс)", () => {
  it("пробіл+кома (укр. групування) і кома+крапка (US-style) дають той самий kopiykas-результат", () => {
    const xml = `<CHECK><CHECKHEAD><ORGNM>Тест</ORGNM><ORDATE>20260115</ORDATE><ORTIME>120000</ORTIME><SUM>1 500,00</SUM></CHECKHEAD><CHECKBODY><ROW ROWNUM="1"><NAME>Товар</NAME><AMOUNT>1</AMOUNT><PRICE>1,500.00</PRICE><COST>1,500.00</COST></ROW></CHECKBODY></CHECK>`;
    const parsed = parseDpsCheckXml(xml);
    expect(parsed?.totalKopiykas).toBe(150000); // "1 500,00" (укр.) → 1500 ₴
    expect(parsed?.items[0]?.priceKopiykas).toBe(150000); // "1,500.00" (US) → 1500 ₴
    expect(parsed?.items[0]?.sumKopiykas).toBe(150000); // COST пріоритетний, той самий формат
  });
});

// Ревʼю PR #818: жодне грошове значення парсера не сміє покидати safe-int /
// ±AMOUNT_MINOR_MAX (1e9 копійок) межі схеми draft-у — інакше lookup валив
// би `.parse()` ВЛАСНОЇ відповіді 500-кою замість керованого 502/фолбеку.
describe("parseDpsCheckXml — safe-int та ±AMOUNT_MINOR_MAX межі грошей", () => {
  const checkWith = (sum: string, rows: string): string =>
    `<CHECK><CHECKHEAD><ORGNM>Тест</ORGNM><ORDATE>20260115</ORDATE><ORTIME>120000</ORTIME><SUM>${sum}</SUM></CHECKHEAD><CHECKBODY>${rows}</CHECKBODY></CHECK>`;
  const ROW_OK = `<ROW><NAME>Товар</NAME><AMOUNT>1</AMOUNT><PRICE>100</PRICE><COST>100</COST></ROW>`;

  it("SUM поза safe integer (цілі копійки «1e307») → null, не Infinity далі", () => {
    expect(parseDpsCheckXml(checkWith("1e307", ROW_OK))).toBeNull();
  });

  it("SUM-гривні, чиї копійки переповнюють safe integer («99999999999999999.99») → null", () => {
    expect(
      parseDpsCheckXml(checkWith("99999999999999999.99", ROW_OK)),
    ).toBeNull();
  });

  it("SUM safe, але понад AMOUNT_MINOR_MAX («2000000000» копійок > 1e9) → null", () => {
    expect(parseDpsCheckXml(checkWith("2000000000", ROW_OK))).toBeNull();
  });

  it("відʼємний загальний SUM → null (схема: totalKopiykas ≥ 0)", () => {
    expect(parseDpsCheckXml(checkWith("-100", ROW_OK))).toBeNull();
  });

  it("PRICE поза межею → 0-фолбек рядка; COST відсутній → sum теж 0", () => {
    const parsed = parseDpsCheckXml(
      checkWith(
        "100",
        `<ROW><NAME>Товар</NAME><AMOUNT>1</AMOUNT><PRICE>1e307</PRICE></ROW>`,
      ),
    );
    expect(parsed?.items[0]).toMatchObject({
      priceKopiykas: 0,
      sumKopiykas: 0,
    });
  });

  it("добуток price*qty понад AMOUNT_MINOR_MAX (COST відсутній) → sum 0, не 500-подібний overflow", () => {
    // 1e8 копійок × 1000 шт = 1e11 > 1e9: кожен множник у межах, добуток — ні.
    const parsed = parseDpsCheckXml(
      checkWith(
        "100",
        `<ROW><NAME>Опт</NAME><AMOUNT>1000</AMOUNT><PRICE>100000000</PRICE></ROW>`,
      ),
    );
    expect(parsed?.items[0]?.priceKopiykas).toBe(100000000);
    expect(parsed?.items[0]?.sumKopiykas).toBe(0);
  });

  it("AMOUNT понад RECEIPT_ITEM_QTY_ABS_MAX (2e6 > 1e6) → qty=1 фолбек", () => {
    const parsed = parseDpsCheckXml(
      checkWith(
        "100",
        `<ROW><NAME>Товар</NAME><AMOUNT>2000000</AMOUNT><PRICE>100</PRICE></ROW>`,
      ),
    );
    expect(parsed?.items[0]?.qty).toBe(1);
    expect(parsed?.items[0]?.sumKopiykas).toBe(100); // 100 × 1
  });
});

// Ревʼю PR #818 (та сама категорія «парсер не сміє ламати власну схему»):
// position ≤ 10 000 і унікальний, items ≤ 200 — сміттєвий XML деградує
// graceful-но, а не 400/500 на `.parse()` відповіді.
describe("parseDpsCheckXml — межі position/кількості рядків", () => {
  const checkWithRows = (rows: string): string =>
    `<CHECK><CHECKHEAD><ORGNM>Тест</ORGNM><ORDATE>20260115</ORDATE><ORTIME>120000</ORTIME><SUM>100</SUM></CHECKHEAD><CHECKBODY>${rows}</CHECKBODY></CHECK>`;

  it("нецілий ROWNUM («2.5») → фолбек на порядковий індекс", () => {
    const parsed = parseDpsCheckXml(
      checkWithRows(
        `<ROW ROWNUM="2.5"><NAME>Товар</NAME><AMOUNT>1</AMOUNT><PRICE>100</PRICE><COST>100</COST></ROW>`,
      ),
    );
    expect(parsed?.items[0]?.position).toBe(1);
  });

  it("ROWNUM понад 10 000 → фолбек на порядковий індекс", () => {
    const parsed = parseDpsCheckXml(
      checkWithRows(
        `<ROW ROWNUM="99999"><NAME>Товар</NAME><AMOUNT>1</AMOUNT><PRICE>100</PRICE><COST>100</COST></ROW>`,
      ),
    );
    expect(parsed?.items[0]?.position).toBe(1);
  });

  it("дубльовані ROWNUM → усі позиції перенумеровано послідовно 1..n у порядку джерела", () => {
    const parsed = parseDpsCheckXml(
      checkWithRows(
        `<ROW ROWNUM="7"><NAME>А</NAME><AMOUNT>1</AMOUNT><PRICE>100</PRICE><COST>100</COST></ROW>` +
          `<ROW ROWNUM="7"><NAME>Б</NAME><AMOUNT>1</AMOUNT><PRICE>200</PRICE><COST>200</COST></ROW>`,
      ),
    );
    expect(parsed?.items.map((i) => i.position)).toEqual([1, 2]);
    expect(parsed?.items.map((i) => i.name)).toEqual(["А", "Б"]);
  });

  it("понад 200 ROW → рівно 200 items (хвіст відкинуто, чек не валиться)", () => {
    const rows = Array.from(
      { length: 205 },
      (_, i) =>
        `<ROW ROWNUM="${i + 1}"><NAME>Т${i + 1}</NAME><AMOUNT>1</AMOUNT><PRICE>10</PRICE><COST>10</COST></ROW>`,
    ).join("");
    const parsed = parseDpsCheckXml(checkWithRows(rows));
    expect(parsed?.items).toHaveLength(200);
    expect(parsed?.items[199]?.name).toBe("Т200");
  });
});
