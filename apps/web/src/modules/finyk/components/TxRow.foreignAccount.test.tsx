// @vitest-environment jsdom
/**
 * Операція з не-гривневої картки показується у валюті рахунку, а не з ₴ на
 * тому самому числі, і має позначку «не враховано» (Журнал рішень finyk
 * 2026-11-25).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TxRow, type TxRowTx } from "./TxRow";

function mkTx(overrides: Partial<TxRowTx> = {}): TxRowTx {
  return {
    id: "tx-usd",
    amount: -10_000,
    operationAmount: -10_000,
    currencyCode: 840,
    description: "Переказ",
    mcc: 4829,
    time: 1_780_000_000,
    ...overrides,
  };
}

describe("TxRow: картка не в гривні", () => {
  it("−100,00 $ без знака гривні й з поясненням", () => {
    const { container } = render(<TxRow tx={mkTx()} />);
    expect(container.textContent).toContain("$");
    expect(container.textContent).not.toContain("₴");
    expect(screen.getByText(/Не враховано: картка не в гривні/)).toBeTruthy();
  });

  it("гривнева картка лишається в ₴ без пояснення", () => {
    const { container } = render(
      <TxRow
        tx={mkTx({
          amount: -25_000,
          operationAmount: -25_000,
          currencyCode: 980,
        })}
      />,
    );
    expect(container.textContent).toContain("₴");
    expect(screen.queryByText(/Не враховано: картка/)).toBeNull();
  });
});
