// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import {
  SubscriptionForm,
  AssetForm,
  DebtForm,
  ReceivableForm,
} from "./AssetsForm";
import { createRef } from "react";

describe("SubscriptionForm", () => {
  it("renders inputs and buttons", () => {
    const { container } = render(
      <SubscriptionForm
        newSub={{
          name: "",
          emoji: "",
          keyword: "",
          billingDay: "",
          currency: "UAH",
        }}
        setNewSub={vi.fn()}
        setSubscriptions={vi.fn()}
        setShowSubForm={vi.fn()}
      />,
    );
    expect(
      screen.getByPlaceholderText("Ключове слово з транзакції"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("День списання (1-31)"),
    ).toBeInTheDocument();
    const buttons = within(container).getAllByRole("button");
    const buttonLabels = buttons.map((b) => b.textContent?.trim());
    expect(buttonLabels).toContain("Додати");
    expect(buttonLabels).toContain("Скасувати");
  });

  it("rejects out-of-range billing days (0, 99) and saves a valid one", () => {
    const setSubscriptions = vi.fn();
    const setShowSubForm = vi.fn();
    const baseSub = {
      name: "Netflix",
      emoji: "\u{1F3AC}",
      keyword: "",
      currency: "UAH" as const,
    };

    // 0 — must NOT call setSubscriptions
    const { container: c0, unmount: u0 } = render(
      <SubscriptionForm
        newSub={{ ...baseSub, billingDay: 0 }}
        setNewSub={vi.fn()}
        setSubscriptions={setSubscriptions}
        setShowSubForm={setShowSubForm}
      />,
    );
    fireEvent.click(
      within(c0)
        .getAllByRole("button")
        .find((b) => b.textContent?.trim() === "Додати")!,
    );
    expect(setSubscriptions).not.toHaveBeenCalled();
    u0();

    // 99 — must NOT call setSubscriptions
    const { container: c99, unmount: u99 } = render(
      <SubscriptionForm
        newSub={{ ...baseSub, billingDay: 99 }}
        setNewSub={vi.fn()}
        setSubscriptions={setSubscriptions}
        setShowSubForm={setShowSubForm}
      />,
    );
    fireEvent.click(
      within(c99)
        .getAllByRole("button")
        .find((b) => b.textContent?.trim() === "Додати")!,
    );
    expect(setSubscriptions).not.toHaveBeenCalled();
    u99();

    // 15 — valid, must commit and close the form
    const { container: c15 } = render(
      <SubscriptionForm
        newSub={{ ...baseSub, billingDay: 15 }}
        setNewSub={vi.fn()}
        setSubscriptions={setSubscriptions}
        setShowSubForm={setShowSubForm}
      />,
    );
    fireEvent.click(
      within(c15)
        .getAllByRole("button")
        .find((b) => b.textContent?.trim() === "Додати")!,
    );
    expect(setSubscriptions).toHaveBeenCalledTimes(1);
    expect(setShowSubForm).toHaveBeenCalledWith(false);
  });

  it("calls setShowSubForm(false) on cancel", () => {
    const onCancel = vi.fn();
    const { container } = render(
      <SubscriptionForm
        newSub={{
          name: "",
          emoji: "",
          keyword: "",
          billingDay: "",
          currency: "UAH",
        }}
        setNewSub={vi.fn()}
        setSubscriptions={vi.fn()}
        setShowSubForm={onCancel}
      />,
    );
    const cancelBtn = within(container)
      .getAllByRole("button")
      .find((b) => b.textContent?.trim() === "Скасувати");
    fireEvent.click(cancelBtn!);
    expect(onCancel).toHaveBeenCalledWith(false);
  });
});

describe("AssetForm", () => {
  it("renders the form title and currency select", () => {
    render(
      <AssetForm
        newAsset={{ name: "", amount: "", currency: "UAH", emoji: "" }}
        setNewAsset={vi.fn()}
        setManualAssets={vi.fn()}
        setShowAssetForm={vi.fn()}
        assetFormRef={createRef()}
        assetNameInputRef={createRef()}
      />,
    );
    expect(screen.getByText("Новий актив")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Сума")).toBeInTheDocument();
  });
});

describe("ReceivableForm", () => {
  it("renders the receivable inputs", () => {
    render(
      <ReceivableForm
        newRecv={{ name: "", emoji: "", amount: "", note: "", dueDate: "" }}
        setNewRecv={vi.fn()}
        setReceivables={vi.fn()}
        setShowRecvForm={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText("Сума ₴")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Нотатка (необов'язково)"),
    ).toBeInTheDocument();
  });
});

describe("DebtForm", () => {
  it("renders the debt form title and inputs", () => {
    render(
      <DebtForm
        newDebt={{ name: "", emoji: "", totalAmount: "", dueDate: "" }}
        setNewDebt={vi.fn()}
        setManualDebts={vi.fn()}
        setShowDebtForm={vi.fn()}
        debtFormRef={createRef()}
        debtNameInputRef={createRef()}
      />,
    );
    expect(screen.getByText("Новий пасив")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Загальна сума ₴")).toBeInTheDocument();
  });

  it("calls setShowDebtForm(false) on cancel", () => {
    const onCancel = vi.fn();
    const { container } = render(
      <DebtForm
        newDebt={{ name: "", emoji: "", totalAmount: "", dueDate: "" }}
        setNewDebt={vi.fn()}
        setManualDebts={vi.fn()}
        setShowDebtForm={onCancel}
        debtFormRef={createRef()}
        debtNameInputRef={createRef()}
      />,
    );
    const cancelBtn = within(container)
      .getAllByRole("button")
      .find((b) => b.textContent?.trim() === "Скасувати");
    fireEvent.click(cancelBtn!);
    expect(onCancel).toHaveBeenCalledWith(false);
  });
});
