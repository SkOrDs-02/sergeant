// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import {
  SubscriptionForm,
  AssetForm,
  DebtForm,
  ReceivableForm,
} from "./AssetsForm";
import { createRef, type ReactNode } from "react";

// AssetForm uses `useFeatureGate("multi-currency")` (Phase 7 D2) which calls
// react-query via usePlan; renders of it need a QueryClientProvider. It also
// renders <PaywallModal>, which calls useNavigate() and therefore needs a
// Router in context.
function withQueryClient(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

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
      screen.getByLabelText("Пошук транзакції за описом"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /знайдемо найновішу витрату, опис якої містить цей текст/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("День списання (1-31)"),
    ).toBeInTheDocument();
    const buttons = within(container).getAllByRole("button");
    const buttonLabels = buttons.map((b) => b.textContent?.trim());
    expect(buttonLabels).toContain("Додати");
    expect(buttonLabels).toContain("Скасувати");
    expect(screen.getByRole("button", { name: "Додати" })).toBeDisabled();
    expect(
      screen.getByText("Заповни назву та вкажи день списання від 1 до 31."),
    ).toBeInTheDocument();
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
      withQueryClient(
        <AssetForm
          newAsset={{ name: "", amount: "", currency: "UAH", emoji: "" }}
          setNewAsset={vi.fn()}
          setManualAssets={vi.fn()}
          setShowAssetForm={vi.fn()}
          assetFormRef={createRef()}
          assetNameInputRef={createRef()}
        />,
      ),
    );
    expect(screen.getByText("Новий актив")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Сума")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Додати" })).toBeDisabled();
  });

  it("calls setShowAssetForm(false) on cancel", () => {
    const setShowAssetForm = vi.fn();
    const { container } = render(
      withQueryClient(
        <AssetForm
          newAsset={{ name: "Cash", amount: "100", currency: "UAH", emoji: "" }}
          setNewAsset={vi.fn()}
          setManualAssets={vi.fn()}
          setShowAssetForm={setShowAssetForm}
          assetFormRef={createRef()}
          assetNameInputRef={createRef()}
        />,
      ),
    );
    fireEvent.click(
      within(container)
        .getAllByRole("button")
        .find((b) => b.textContent?.trim() === "Скасувати")!,
    );
    expect(setShowAssetForm).toHaveBeenCalledWith(false);
  });

  it("emits name, amount, and currency field updates", () => {
    const setNewAsset = vi.fn();
    render(
      withQueryClient(
        <AssetForm
          newAsset={{ name: "Cash", amount: "100", currency: "USD", emoji: "" }}
          setNewAsset={setNewAsset}
          setManualAssets={vi.fn()}
          setShowAssetForm={vi.fn()}
          assetFormRef={createRef()}
          assetNameInputRef={createRef()}
        />,
      ),
    );

    fireEvent.change(screen.getByLabelText("Назва активу"), {
      target: { value: "Брокерський рахунок" },
    });
    fireEvent.change(screen.getByLabelText("Сума активу"), {
      target: { value: "2500" },
    });
    fireEvent.change(screen.getByLabelText("Валюта активу"), {
      target: { value: "UAH" },
    });

    const updaters = setNewAsset.mock.calls.map(
      ([updater]) =>
        updater as (asset: {
          name: string;
          amount: string;
          currency: string;
          emoji: string;
        }) => {
          name: string;
          amount: string;
          currency: string;
          emoji: string;
        },
    );
    const base = { name: "Cash", amount: "100", currency: "USD", emoji: "" };
    expect(updaters[0]!(base)).toMatchObject({ name: expect.any(String) });
    expect(updaters[1]!(base)).toMatchObject({ amount: expect.any(String) });
    expect(updaters[2]!(base)).toMatchObject({ currency: "UAH" });
  });

  it("rejects non-positive amounts and saves a positive one", () => {
    const setManualAssets = vi.fn();
    const setShowAssetForm = vi.fn();
    const base = { name: "Cash", currency: "UAH", emoji: "\u{1F4B0}" };

    // -1000 — must NOT be committed
    const { container: c1, unmount: u1 } = render(
      withQueryClient(
        <AssetForm
          newAsset={{ ...base, amount: "-1000" }}
          setNewAsset={vi.fn()}
          setManualAssets={setManualAssets}
          setShowAssetForm={setShowAssetForm}
          assetFormRef={createRef()}
          assetNameInputRef={createRef()}
        />,
      ),
    );
    fireEvent.click(
      within(c1)
        .getAllByRole("button")
        .find((b) => b.textContent?.trim() === "Додати")!,
    );
    expect(setManualAssets).not.toHaveBeenCalled();
    u1();

    // 0 — must NOT be committed (asset of "0" is meaningless)
    const { container: c2, unmount: u2 } = render(
      withQueryClient(
        <AssetForm
          newAsset={{ ...base, amount: "0" }}
          setNewAsset={vi.fn()}
          setManualAssets={setManualAssets}
          setShowAssetForm={setShowAssetForm}
          assetFormRef={createRef()}
          assetNameInputRef={createRef()}
        />,
      ),
    );
    fireEvent.click(
      within(c2)
        .getAllByRole("button")
        .find((b) => b.textContent?.trim() === "Додати")!,
    );
    expect(setManualAssets).not.toHaveBeenCalled();
    u2();

    // 1500 — happy path
    const { container: c3 } = render(
      withQueryClient(
        <AssetForm
          newAsset={{ ...base, amount: "1500" }}
          setNewAsset={vi.fn()}
          setManualAssets={setManualAssets}
          setShowAssetForm={setShowAssetForm}
          assetFormRef={createRef()}
          assetNameInputRef={createRef()}
        />,
      ),
    );
    fireEvent.click(
      within(c3)
        .getAllByRole("button")
        .find((b) => b.textContent?.trim() === "Додати")!,
    );
    expect(setManualAssets).toHaveBeenCalledTimes(1);
    expect(setShowAssetForm).toHaveBeenCalledWith(false);
  });

  it("updates an existing asset when editingId is present", () => {
    const onUpdate = vi.fn();
    const setManualAssets = vi.fn();
    const { container } = render(
      withQueryClient(
        <AssetForm
          newAsset={{
            name: "Депозит",
            amount: "1500",
            currency: "UAH",
            emoji: "",
          }}
          setNewAsset={vi.fn()}
          setManualAssets={setManualAssets}
          setShowAssetForm={vi.fn()}
          assetFormRef={createRef()}
          assetNameInputRef={createRef()}
          editingId="asset-1"
          onUpdate={onUpdate}
        />,
      ),
    );

    fireEvent.click(
      within(container)
        .getAllByRole("button")
        .find((b) => b.textContent?.trim() === "Зберегти")!,
    );

    expect(onUpdate).toHaveBeenCalledWith(
      "asset-1",
      expect.objectContaining({ id: "asset-1", name: "Депозит", amount: 1500 }),
    );
    expect(setManualAssets).not.toHaveBeenCalled();
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
    const dueDate = screen.getByLabelText("Дата повернення");
    expect(dueDate).toHaveClass("w-full");
    expect(screen.getByRole("button", { name: "Додати" })).toBeDisabled();
    expect(
      screen.getByText("Заповни імʼя та вкажи позитивну суму."),
    ).toBeInTheDocument();
  });

  it("calls setShowRecvForm(false) on cancel", () => {
    const setShowRecvForm = vi.fn();
    const { container } = render(
      <ReceivableForm
        newRecv={{
          name: "Alice",
          emoji: "",
          amount: "100",
          note: "",
          dueDate: "",
        }}
        setNewRecv={vi.fn()}
        setReceivables={vi.fn()}
        setShowRecvForm={setShowRecvForm}
      />,
    );
    fireEvent.click(
      within(container)
        .getAllByRole("button")
        .find((b) => b.textContent?.trim() === "Скасувати")!,
    );
    expect(setShowRecvForm).toHaveBeenCalledWith(false);
  });

  it("rejects non-positive amounts and saves a positive one", () => {
    const setReceivables = vi.fn();
    const setShowRecvForm = vi.fn();
    const base = { name: "Alice", emoji: "", note: "", dueDate: "" };

    // -500 — must NOT be committed
    const { container: c1, unmount: u1 } = render(
      <ReceivableForm
        newRecv={{ ...base, amount: "-500" }}
        setNewRecv={vi.fn()}
        setReceivables={setReceivables}
        setShowRecvForm={setShowRecvForm}
      />,
    );
    fireEvent.click(
      within(c1)
        .getAllByRole("button")
        .find((b) => b.textContent?.trim() === "Додати")!,
    );
    expect(setReceivables).not.toHaveBeenCalled();
    u1();

    // 0 — must NOT be committed
    const { container: c2, unmount: u2 } = render(
      <ReceivableForm
        newRecv={{ ...base, amount: "0" }}
        setNewRecv={vi.fn()}
        setReceivables={setReceivables}
        setShowRecvForm={setShowRecvForm}
      />,
    );
    fireEvent.click(
      within(c2)
        .getAllByRole("button")
        .find((b) => b.textContent?.trim() === "Додати")!,
    );
    expect(setReceivables).not.toHaveBeenCalled();
    u2();

    // 500 — happy path
    const { container: c3 } = render(
      <ReceivableForm
        newRecv={{ ...base, amount: "500" }}
        setNewRecv={vi.fn()}
        setReceivables={setReceivables}
        setShowRecvForm={setShowRecvForm}
      />,
    );
    fireEvent.click(
      within(c3)
        .getAllByRole("button")
        .find((b) => b.textContent?.trim() === "Додати")!,
    );
    expect(setReceivables).toHaveBeenCalledTimes(1);
    expect(setShowRecvForm).toHaveBeenCalledWith(false);
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
    const dueDate = screen.getByLabelText("Дата погашення");
    expect(dueDate).toHaveClass("w-full");
    expect(screen.getByRole("button", { name: "Додати" })).toBeDisabled();
    expect(
      screen.getByText("Заповни назву та вкажи позитивну суму пасиву."),
    ).toBeInTheDocument();
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

  it("emits debt name, amount, and due-date updates", () => {
    const setNewDebt = vi.fn();
    render(
      <DebtForm
        newDebt={{
          name: "Кредит",
          emoji: "",
          totalAmount: "1000",
          dueDate: "",
        }}
        setNewDebt={setNewDebt}
        setManualDebts={vi.fn()}
        setShowDebtForm={vi.fn()}
        debtFormRef={createRef()}
        debtNameInputRef={createRef()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Назва пасиву (кредит, борг…)"), {
      target: { value: "Розстрочка" },
    });
    fireEvent.change(screen.getByLabelText("Загальна сума у гривнях"), {
      target: { value: "25000" },
    });
    fireEvent.change(screen.getByLabelText("Дата погашення"), {
      target: { value: "2026-09-15" },
    });

    const updaters = setNewDebt.mock.calls.map(
      ([updater]) =>
        updater as (debt: {
          name: string;
          emoji: string;
          totalAmount: string;
          dueDate: string;
        }) => {
          name: string;
          emoji: string;
          totalAmount: string;
          dueDate: string;
        },
    );
    const base = {
      name: "Кредит",
      emoji: "",
      totalAmount: "1000",
      dueDate: "",
    };
    expect(updaters[0]!(base)).toMatchObject({ name: expect.any(String) });
    expect(updaters[1]!(base)).toMatchObject({
      totalAmount: expect.any(String),
    });
    expect(updaters[2]!(base)).toMatchObject({
      dueDate: expect.any(String),
    });
  });

  it("commits a valid debt (name + totalAmount) and closes the form", () => {
    const setManualDebts = vi.fn();
    const setShowDebtForm = vi.fn();
    const { container } = render(
      <DebtForm
        newDebt={{
          name: "Кредит",
          emoji: "\u{1F4B8}",
          totalAmount: "50000",
          dueDate: "",
        }}
        setNewDebt={vi.fn()}
        setManualDebts={setManualDebts}
        setShowDebtForm={setShowDebtForm}
        debtFormRef={createRef()}
        debtNameInputRef={createRef()}
      />,
    );
    fireEvent.click(
      within(container)
        .getAllByRole("button")
        .find((b) => b.textContent?.trim() === "Додати")!,
    );
    expect(setManualDebts).toHaveBeenCalledTimes(1);
    expect(setShowDebtForm).toHaveBeenCalledWith(false);
  });

  it("updates an existing debt when editingId is present", () => {
    const onUpdate = vi.fn();
    const setManualDebts = vi.fn();
    const { container } = render(
      <DebtForm
        newDebt={{
          name: "Кредит",
          emoji: "\u{1F4B8}",
          totalAmount: "50000",
          dueDate: "2026-10-01",
        }}
        setNewDebt={vi.fn()}
        setManualDebts={setManualDebts}
        setShowDebtForm={vi.fn()}
        debtFormRef={createRef()}
        debtNameInputRef={createRef()}
        editingId="debt-1"
        onUpdate={onUpdate}
      />,
    );

    fireEvent.click(
      within(container)
        .getAllByRole("button")
        .find((b) => b.textContent?.trim() === "Зберегти")!,
    );

    expect(onUpdate).toHaveBeenCalledWith(
      "debt-1",
      expect.objectContaining({
        id: "debt-1",
        name: "Кредит",
        totalAmount: 50000,
      }),
    );
    expect(setManualDebts).not.toHaveBeenCalled();
  });

  it("does not commit a debt when name is empty", () => {
    const setManualDebts = vi.fn();
    const { container } = render(
      <DebtForm
        newDebt={{
          name: "",
          emoji: "\u{1F4B8}",
          totalAmount: "50000",
          dueDate: "",
        }}
        setNewDebt={vi.fn()}
        setManualDebts={setManualDebts}
        setShowDebtForm={vi.fn()}
        debtFormRef={createRef()}
        debtNameInputRef={createRef()}
      />,
    );
    fireEvent.click(
      within(container)
        .getAllByRole("button")
        .find((b) => b.textContent?.trim() === "Додати")!,
    );
    expect(setManualDebts).not.toHaveBeenCalled();
  });
});
