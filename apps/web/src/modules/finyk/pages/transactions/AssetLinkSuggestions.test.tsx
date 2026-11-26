// @vitest-environment jsdom
/**
 * Картки пропозицій активів (спека
 * `docs/work/specs/finyk-investment-suggestions.md`): без активу картка
 * відкриває форму, у якій тип, валюта рахунку, курс і назва вже підставлені
 * з операції.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { AssetLinkSuggestions } from "./AssetLinkSuggestions";
import type { AssetLinkSuggestion } from "./useAssetLinks";

const bondBuy = {
  id: "b1",
  amount: -10_292_533,
  description: "Купівля облігацій",
  time: Math.floor(new Date("2026-11-12T23:42:14").getTime() / 1000),
  date: "2026-11-12",
  categoryId: "other",
  type: "expense",
  source: "mono",
  mcc: 4829,
  accountId: "eur",
  manual: false,
  _source: "monobank",
  _accountId: "eur",
  _manual: false,
  accountCurrencyCode: 978,
  accountAmount: -203_884,
  amountUah: -10_292_533,
  fxRate: { uahPerUnit: 50.4823, date: "2026-11-12" },
} as Transaction;

const suggestion: AssetLinkSuggestion = {
  tx: bondBuy,
  type: "contribution",
  assets: [],
  kind: "ovdp",
};

describe("AssetLinkSuggestions", () => {
  it("без активу: «Створити актив» відкриває форму з даними операції", () => {
    const reject = vi.fn();
    render(
      <AssetLinkSuggestions
        suggestions={[suggestion]}
        accept={vi.fn()}
        reject={reject}
        createFrom={vi.fn()}
      />,
    );
    expect(screen.getByText("Схоже на купівлю ОВДП")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Створити актив" }));
    expect(screen.getByText("Новий актив з операції")).toBeInTheDocument();
    expect(screen.getByLabelText("Назва активу")).toHaveValue(
      "Купівля облігацій",
    );
    expect(screen.getByRole("radio", { name: "EUR" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(document.getElementById("savings-asset-fxRate")).toHaveValue(
      "50.4823",
    );
  });

  it("«Ні» відхиляє пропозицію", () => {
    const reject = vi.fn();
    render(
      <AssetLinkSuggestions
        suggestions={[suggestion]}
        accept={vi.fn()}
        reject={reject}
        createFrom={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Ні, «Купівля облігацій» не відкладення",
      }),
    );
    expect(reject).toHaveBeenCalledWith(suggestion);
  });
});
