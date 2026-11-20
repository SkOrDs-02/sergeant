/**
 * Судді зорового стенду фінʼїка (`scripts/eval/vision.finyk.ts`).
 *
 * Суддя, що пропускає неправду або валить правду, робить замір брехливим
 * у будь-який бік, тому кожен перевіряємо на двох відповідях: «ідеальна» з
 * істини `visionDocs.data.ts` (мусить пройти) і типова помилка, заради якої
 * кейс існує (мусить впасти з причиною).
 */

import { describe, expect, it } from "vitest";

import { VISION_PIPELINES } from "../../scripts/eval/vision.js";
import type { VisionCase } from "../../scripts/eval/visionCase.js";
import {
  RECEIPTS,
  STATEMENTS,
  expectedStatementRows,
  lineSum,
  receiptTotal,
  type ReceiptDoc,
  type StatementDoc,
} from "../../scripts/eval/visionDocs.data.js";

const cases = (key: string): VisionCase[] => {
  const p = VISION_PIPELINES.find((x) => x.key === key);
  if (!p) throw new Error(`пайплайн ${key} зник`);
  return p.cases;
};
const byName = (key: string, part: string): VisionCase => {
  const c = cases(key).find((x) => x.name.includes(part));
  if (!c?.judge) throw new Error(`кейс «${part}» зник із ${key}`);
  return c;
};
const doc = <T extends { key: string }>(list: T[], key: string): T => {
  const d = list.find((x) => x.key === key);
  if (!d) throw new Error(`документ ${key} зник`);
  return d;
};

function idealReceipt(d: ReceiptDoc, patch: Record<string, unknown> = {}) {
  return JSON.stringify({
    store: d.store,
    date: d.date,
    time: d.time,
    total_kopiykas: receiptTotal(d),
    items: d.lines.map((l) => ({
      name: l.name,
      qty: l.qty,
      price_kopiykas: l.price,
      sum_kopiykas: lineSum(l),
    })),
    confidence: 0.9,
    ...patch,
  });
}

function idealStatement(d: StatementDoc, extraRows: unknown[] = []) {
  return JSON.stringify({
    doc_type: "bank_screenshot",
    bank: d.bank,
    rows: [
      ...d.rows
        .filter((r) => !r.amountHidden)
        .map((r) => ({
          date: r.date,
          time: r.time ?? null,
          amount_kopiykas: Math.abs(r.amount),
          direction: r.amount > 0 ? "income" : "expense",
          description: r.description,
          failed: r.failed === true,
          currency: r.currency ?? "UAH",
          confidence: 0.9,
        })),
      ...extraRows,
    ],
  });
}

describe("судді чеків", () => {
  it("кожен звичайний чек проходить на ідеальній відповіді", () => {
    for (const d of RECEIPTS.filter((r) => r.style !== "cut")) {
      const passed = cases("receipt-scan").some(
        (c) => !c.abstain && c.judge?.(idealReceipt(d)) === true,
      );
      expect(passed, `${d.key}: жоден кейс не прийняв ідеальну відповідь`).toBe(
        true,
      );
    }
  });

  it("супермаркет: готівка замість підсумку — провал із причиною", () => {
    const d = doc(RECEIPTS, "supermarket");
    const judge = byName("receipt-scan", "супермаркет").judge!;
    expect(judge(idealReceipt(d))).toBe(true);
    expect(judge(idealReceipt(d, { total_kopiykas: 50000 }))).toMatch(
      /підсумок 50000/,
    );
    expect(judge(idealReceipt(d, { date: "2025-11-14" }))).toMatch(/дата/);
  });

  it("знижку окремим рядком суддя приймає (промпт це дозволяє)", () => {
    const d = doc(RECEIPTS, "supermarket");
    const judge = byName("receipt-scan", "супермаркет").judge!;
    const items = d.lines.map((l) => ({
      name: l.name,
      qty: l.qty,
      price_kopiykas: l.price,
      sum_kopiykas: Math.round(l.qty * l.price),
    }));
    // Позицій тоді більше на кількість знижок — для короткого чека це провал
    // лічильника, тож перевіряємо лише суму контрольної позиції.
    const verdict = judge(idealReceipt(d, { items }));
    expect(String(verdict)).not.toMatch(/Сир твердий» сума/);
  });

  it("вагові: вага як кількість 1 — провал", () => {
    const d = doc(RECEIPTS, "weighted");
    const judge = byName("receipt-scan", "вагові").judge!;
    expect(judge(idealReceipt(d))).toBe(true);
    const items = d.lines.map((l) => ({
      name: l.name,
      qty: 1,
      price_kopiykas: l.price,
      sum_kopiykas: lineSum(l),
    }));
    expect(judge(idealReceipt(d, { items }))).toMatch(/вага/);
  });

  it("обрізаний чек: підсумок = сума видимих — вигадка", () => {
    const d = doc(RECEIPTS, "cut");
    const c = byName("receipt-scan", "обрізаний");
    const visible = d.lines.slice(0, 5).reduce((s, l) => s + lineSum(l), 0);
    const honest = idealReceipt(d, { total_kopiykas: 0 });
    const guessed = idealReceipt(d, { total_kopiykas: visible });
    expect(c.judge!(honest)).toBe(true);
    expect(c.fabricated!(honest)).toBe(false);
    expect(c.judge!(guessed)).toMatch(/сума видимих/);
    expect(c.fabricated!(guessed)).toBe(true);
  });

  it("не чек: порожня відповідь проходить, вигаданий чек — вигадка", () => {
    const c = byName("receipt-scan", "не чек");
    const honest = JSON.stringify({
      store: "",
      items: [],
      total_kopiykas: 0,
      confidence: 0,
    });
    const invented = JSON.stringify({
      store: "Піца",
      items: [
        { name: "Піца", qty: 1, price_kopiykas: 25000, sum_kopiykas: 25000 },
      ],
      total_kopiykas: 25000,
    });
    expect(c.judge!(honest)).toBe(true);
    expect(c.fabricated!(invented)).toBe(true);
    expect(c.judge!("Це не чек.")).toMatch(/бите JSON/);
  });
});

describe("судді виписок", () => {
  it("кожна виписка проходить на ідеальній відповіді", () => {
    for (const d of STATEMENTS) {
      const passed = cases("statement-import").some(
        (c) => c.judge?.(idealStatement(d)) === true,
      );
      expect(passed, d.key).toBe(true);
    }
  });

  it("баланс як операція — зайвий рядок", () => {
    const d = doc(STATEMENTS, "app-light");
    const judge = byName("statement-import", "світла").judge!;
    const balance = {
      date: "2026-11-19",
      amount_kopiykas: 2345678,
      direction: "income",
      description: "Баланс",
      currency: "UAH",
    };
    expect(judge(idealStatement(d, [balance]))).toMatch(/зайвий рядок/);
  });

  it("€ як гривні — зайвий рядок, а не тихий успіх", () => {
    const d = doc(STATEMENTS, "two-currency");
    const judge = byName("statement-import", "дві валюти").judge!;
    const asUah = JSON.parse(idealStatement(d)) as {
      rows: Array<Record<string, unknown>>;
    };
    for (const r of asUah.rows) r["currency"] = "UAH";
    expect(judge(JSON.stringify(asUah))).toMatch(/зайвий рядок/);
  });

  it("рік у майбутньому для «4 січня» — провал дати", () => {
    const d = doc(STATEMENTS, "app-dark");
    const judge = byName("statement-import", "темна").judge!;
    const wrongYear = idealStatement(d).replace("2026-01-04", "2027-01-04");
    // 2027 поза вікном схеми → прод відкидає рядок як нечитабельний.
    expect(judge(wrongYear)).not.toBe(true);
  });

  it("перекритий рядок: вигадана сума — вигадка", () => {
    const d = doc(STATEMENTS, "cut-row");
    const c = byName("statement-import", "перекритий");
    expect(c.judge!(idealStatement(d))).toBe(true);
    const invented = idealStatement(d, [
      {
        date: "2026-11-18",
        amount_kopiykas: 99900,
        direction: "expense",
        description: "Електроніка «Дріт-Демо»",
        currency: "UAH",
      },
    ]);
    expect(c.fabricated!(invented)).toBe(true);
    expect(c.judge!(invented)).toMatch(/зайвий рядок/);
  });

  it("перекази між своїми: переписаний опис ламає детектор", () => {
    const d = doc(STATEMENTS, "own-transfers");
    const judge = byName("statement-import", "власними").judge!;
    expect(expectedStatementRows(d).filter((r) => r.ownTransfer)).toHaveLength(
      3,
    );
    const rewritten = idealStatement(d).replace(
      "Поповнення «На відпустку»",
      "Поповнення банки на відпустку",
    );
    expect(judge(rewritten)).toMatch(/переказ між своїми/);
  });
});
