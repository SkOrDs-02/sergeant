// Тонкі ре-експорти `lib/debt.ts` на `domain/debtEngine`. Деталі поведінки
// engine-у вже покриті в `domain/debtEngine.test.ts`; цей файл фіксує тільки
// сам wrapper-контракт: що ре-експорти вказують на ті ж самі функції і що
// `getDebtPaid`/`getRecvPaid` фільтрують транзакції за знаком (sign-gating).
import { describe, expect, it } from "vitest";

import {
  calcDebtRemaining,
  calcReceivableRemaining,
  getDebtEffectiveTotal,
  getDebtPaid,
  getReceivableEffectiveTotal,
  getRecvPaid,
} from "./debt.js";
import * as debtEngine from "../domain/debtEngine.js";

describe("re-exports", () => {
  it("calcDebtRemaining, calcReceivableRemaining, getDebtEffectiveTotal, getReceivableEffectiveTotal — same identity as debtEngine", () => {
    expect(calcDebtRemaining).toBe(debtEngine.calcDebtRemaining);
    expect(calcReceivableRemaining).toBe(debtEngine.calcReceivableRemaining);
    expect(getDebtEffectiveTotal).toBe(debtEngine.getDebtEffectiveTotal);
    expect(getReceivableEffectiveTotal).toBe(
      debtEngine.getReceivableEffectiveTotal,
    );
  });
});

describe("getDebtPaid (wrapper)", () => {
  it("делегує до debtEngine.getDebtPaid: погашення = лише amount<0", () => {
    const debt = { id: "d1", amount: 0, linkedTxIds: ["a", "b", "c"] };
    const transactions = [
      { id: "a", amount: -100_00 }, // 100 UAH погашення
      { id: "b", amount: 50_00 }, // надходження (origin) — НЕ враховується
      { id: "c", amount: -25_00 }, // 25 UAH погашення
    ];
    expect(getDebtPaid(debt, transactions)).toBe(125);
  });

  it("повертає 0 коли немає прив'язаних транзакцій", () => {
    expect(getDebtPaid({ id: "d", amount: 0 })).toBe(0);
  });

  it("повертає 0 коли всі лінк-tx > 0 (тільки виникнення)", () => {
    const debt = { id: "d", amount: 0, linkedTxIds: ["o"] };
    expect(getDebtPaid(debt, [{ id: "o", amount: 100_00 }])).toBe(0);
  });
});

describe("getRecvPaid (wrapper)", () => {
  it("делегує до debtEngine.getReceivablePaid: надходження = лише amount>0", () => {
    const recv = { id: "r1", amount: 0, linkedTxIds: ["a", "b", "c"] };
    const transactions = [
      { id: "a", amount: 80_00 }, // 80 UAH повернено
      { id: "b", amount: -30_00 }, // виникнення дебіторки — НЕ враховується
      { id: "c", amount: 20_00 }, // 20 UAH повернено
    ];
    expect(getRecvPaid(recv, transactions)).toBe(100);
  });

  it("повертає 0 коли transactions дефолтний (порожній)", () => {
    expect(getRecvPaid({ id: "r", amount: 0, linkedTxIds: ["x"] })).toBe(0);
  });

  it("ігнорує id-и без відповідних транзакцій (findLinkedTx відфільтрує)", () => {
    const recv = { id: "r", amount: 0, linkedTxIds: ["missing", "a"] };
    expect(getRecvPaid(recv, [{ id: "a", amount: 40_00 }])).toBe(40);
  });
});
