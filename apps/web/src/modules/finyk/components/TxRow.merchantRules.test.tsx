// @vitest-environment jsdom
/**
 * Рядок операції × правила «Завжди так для цього магазину» (рішення власника
 * 2026-10-01): правило змінює категорію банківської операції без явного
 * override-а, а рядок чесно каже «за правилом» замість «визначив Сержант».
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildMerchantRuleIndex,
  type MerchantRule,
} from "@sergeant/finyk-domain/lib/merchantRules";
import { TxRow, type TxRowTx } from "./TxRow";

afterEach(cleanup);

const RULE: MerchantRule = {
  id: "mr_1",
  kind: "expense",
  merchantKey: "сільпо",
  categoryId: "transport",
  label: "Сільпо",
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
};
const INCOME_RULE: MerchantRule = {
  ...RULE,
  id: "mr_2",
  kind: "income",
  merchantKey: "іван петренко",
  categoryId: "freelance",
  label: "Іван Петренко",
};
const INDEX = buildMerchantRuleIndex([RULE, INCOME_RULE]);

function mkTx(overrides: Partial<TxRowTx> = {}): TxRowTx {
  return {
    id: "tx-1",
    amount: -25000,
    description: "Сільпо №123",
    mcc: 5411,
    categoryId: "food",
    time: 1_780_000_000,
    currencyCode: 980,
    ...overrides,
  };
}

describe("TxRow × правила мерчантів", () => {
  it("без правил категорія за серверним слагом, мітка «визначив Сержант»", () => {
    render(<TxRow tx={mkTx()} />);
    expect(screen.getByText("Продукти")).toBeInTheDocument();
    expect(screen.queryByText("за правилом")).not.toBeInTheDocument();
    expect(
      screen.getAllByText(/Категорію визначив Сержант/).length,
    ).toBeGreaterThan(0);
  });

  it("правило перебиває серверний слаг і підписує рядок «за правилом»", () => {
    render(<TxRow tx={mkTx()} merchantRules={INDEX} />);
    expect(screen.getByText("Транспорт")).toBeInTheDocument();
    expect(screen.queryByText("Продукти")).not.toBeInTheDocument();
    expect(screen.getByText("за правилом")).toBeInTheDocument();
    // Рішення людини не маскуємо під здогадку Сержанта.
    expect(
      screen.queryByText(/Категорію визначив Сержант/),
    ).not.toBeInTheDocument();
  });

  it("явний override сильніший за правило: «змін.», а не «за правилом»", () => {
    render(<TxRow tx={mkTx()} merchantRules={INDEX} overrideCatId="food" />);
    expect(screen.getByText("Продукти")).toBeInTheDocument();
    expect(screen.getByText("змін.")).toBeInTheDocument();
    expect(screen.queryByText("за правилом")).not.toBeInTheDocument();
  });

  it("той самий мерчант з іншим номером філії підпадає під правило", () => {
    render(
      <TxRow
        tx={mkTx({ id: "tx-2", description: "СІЛЬПО 45" })}
        merchantRules={INDEX}
      />,
    );
    expect(screen.getByText("Транспорт")).toBeInTheDocument();
  });

  it("інший мерчант правила не чіпає", () => {
    render(
      <TxRow
        tx={mkTx({ id: "tx-3", description: "АТБ маркет" })}
        merchantRules={INDEX}
      />,
    );
    expect(screen.getByText("Продукти")).toBeInTheDocument();
    expect(screen.queryByText("за правилом")).not.toBeInTheDocument();
  });

  it("ручний запис правило не чіпає: його категорію людина вибрала сама", () => {
    render(
      <TxRow
        tx={mkTx({ id: "man-1", categoryId: "food", _manual: true })}
        merchantRules={INDEX}
      />,
    );
    expect(screen.getByText("Продукти")).toBeInTheDocument();
    expect(screen.queryByText("за правилом")).not.toBeInTheDocument();
  });

  it("надходження читає правило боку income", () => {
    render(
      <TxRow
        tx={mkTx({
          id: "in-1",
          amount: 50000,
          description: "Іван Петренко",
          categoryId: "in_other",
        })}
        merchantRules={INDEX}
      />,
    );
    expect(screen.getByText("Фріланс")).toBeInTheDocument();
    expect(screen.getByText("за правилом")).toBeInTheDocument();
  });

  it("правило витрати не чіпає надходження від того самого імені", () => {
    render(
      <TxRow
        tx={mkTx({
          id: "in-2",
          amount: 50000,
          description: "Сільпо повернення",
          categoryId: "in_other",
        })}
        merchantRules={INDEX}
      />,
    );
    expect(screen.queryByText("за правилом")).not.toBeInTheDocument();
  });
});
