// @vitest-environment jsdom
/**
 * Операція з не-гривневої картки (спека finyk-fx-nbu.md): з курсом НБУ
 * показується в гривні з валютною сумою підписом і курсом у підказці; без
 * курсу - у валюті рахунку, не з ₴ на тому самому числі, з позначкою
 * «Курс ще не підтягнувся».
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
  it("без курсу: −100,00 $ без знака гривні й з поясненням", () => {
    const { container } = render(<TxRow tx={mkTx()} />);
    expect(container.textContent).toContain("$");
    expect(container.textContent).not.toContain("₴");
    expect(screen.getByText(/Курс ще не підтягнувся/)).toBeTruthy();
  });

  it("з курсом НБУ: гривня в сумі, долари підписом, курс у підказці", () => {
    const { container } = render(
      <TxRow
        tx={mkTx({
          amount: -415_000,
          accountAmount: -10_000,
          accountCurrencyCode: 840,
          amountUah: -415_000,
          fxRate: { uahPerUnit: 41.5, date: "2026-11-24" },
        })}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("₴");
    expect(text).toContain("$");
    expect(text.replace(/\s/g, "")).toContain("4150,00");
    expect(screen.queryByText(/Курс ще не підтягнувся/)).toBeNull();
    expect(
      container.querySelector('[title="за курсом НБУ 41,50 ₴ на 24.11.2026"]'),
    ).toBeTruthy();
  });

  it("злотова картка з курсом називає валюту, а не ¤", () => {
    const { container } = render(
      <TxRow
        tx={mkTx({
          amount: -105_000,
          accountAmount: -10_000,
          accountCurrencyCode: 985,
          currencyCode: 985,
          amountUah: -105_000,
          fxRate: { uahPerUnit: 10.5, date: "2026-11-24" },
        })}
      />,
    );
    expect(container.textContent).toContain("zł");
    expect(container.textContent).not.toContain("¤");
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
    expect(screen.queryByText(/Курс ще не підтягнувся/)).toBeNull();
  });
});
