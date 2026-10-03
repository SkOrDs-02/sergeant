// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Debt } from "@sergeant/finyk-domain/domain/debtEngine";
import { DebtAutoLinkField } from "./DebtAutoLinkField";

afterEach(cleanup);

const TRANSACTIONS = [
  { id: "tx1", amount: -50000, description: "Кредит Приват" },
  { id: "tx2", amount: -30000, description: "Кредит Приват" },
];

describe("DebtAutoLinkField — live-превʼю збігів (CodeRabbit finding #3, PR #1103)", () => {
  it("нового пасиву виключати нічого — лічильник рахує всі збіги", () => {
    render(
      <DebtAutoLinkField
        keyword="кредит"
        onKeywordChange={() => undefined}
        transactions={TRANSACTIONS}
      />,
    );
    expect(screen.getByText("Знайдено збігів: 2")).toBeInTheDocument();
  });

  it("превʼю виключає linkedTxIds і autoLinkDismissedTxIds пасиву, що редагується", () => {
    const editingDebt: Debt = {
      id: "debt-1",
      amount: 5000,
      autoLinkKeyword: "кредит",
      linkedTxIds: ["tx1"],
      autoLinkDismissedTxIds: ["tx2"],
    };

    render(
      <DebtAutoLinkField
        keyword="кредит"
        onKeywordChange={() => undefined}
        transactions={TRANSACTIONS}
        editingDebt={editingDebt}
      />,
    );

    // Обидві транзакції реально збігаються словом, але одна вже привʼязана,
    // а друга відхилена людиною — авто-привʼязка не зробить жодного нового
    // запису, тож превʼю мусить показати те саме: нуль, а не два.
    expect(screen.getByText("Збігів не знайдено")).toBeInTheDocument();
  });
});
