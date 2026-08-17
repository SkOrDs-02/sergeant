import { describe, it, expect } from "vitest";
import { parseDpsCheckXml } from "./dpsXml.js";

// Фікстури тут — РЕКОНСТРУКЦІЯ за задокументованою структурою
// (CHECK/CHECKHEAD/CHECKBODY/ROW), НЕ знятий з реального `chkAll`
// payload (токен ДПС ще не згенеровано — відкритий гейт спеки,
// `docs/90-work/planning/specs/receipt-scan.md` § Ризики). Перший
// smoke-тест на живому чеку — обов'язковий наступний крок.

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
