// @vitest-environment jsdom
/**
 * Extra coverage for AssetsForm — exercises branches left uncovered by the
 * primary test suite: empty-name guards, DebtForm voice input,
 * AssetForm UAH-only behavior and legacy non-UAH messaging, and
 * SubscriptionForm empty-name guard.
 */
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

// ── VoiceMicButton exposes onResult ─────────────────────────────────────────

vi.mock("@shared/components/ui/VoiceMicButton", () => ({
  VoiceMicButton: ({
    onResult,
  }: {
    onResult: (transcript: string) => void;
    size?: string;
    label?: string;
    promptHint?: string;
  }) => (
    <button
      type="button"
      data-testid="voice-mic"
      onClick={() => onResult("борг 50000")}
    >
      Voice
    </button>
  ),
}));

// parseExpenseSpeech mock
vi.mock("@sergeant/shared", async () => {
  const actual =
    await vi.importActual<typeof import("@sergeant/shared")>(
      "@sergeant/shared",
    );
  return {
    ...actual,
    parseExpenseSpeech: vi.fn((transcript: string) => {
      if (transcript.includes("борг")) {
        return { name: "Борг", amount: 50000 };
      }
      return null;
    }),
  };
});

vi.mock("../hubRoutineSync", () => ({
  notifyFinykRoutineCalendarSync: vi.fn(),
}));

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

// ── SubscriptionForm — empty name guard ──────────────────────────────────────

describe("SubscriptionForm (extra) — empty name guard", () => {
  it("does not commit when name is empty even with a valid billingDay", () => {
    const setSubscriptions = vi.fn();
    const setShowSubForm = vi.fn();
    const { container } = render(
      <SubscriptionForm
        newSub={{
          name: "",
          emoji: "",
          keyword: "",
          billingDay: 15,
          currency: "UAH",
        }}
        setNewSub={vi.fn()}
        setSubscriptions={setSubscriptions}
        setShowSubForm={setShowSubForm}
      />,
    );
    fireEvent.click(
      within(container)
        .getAllByRole("button")
        .find((b) => b.textContent?.trim() === "Додати")!,
    );
    expect(setSubscriptions).not.toHaveBeenCalled();
    expect(setShowSubForm).not.toHaveBeenCalled();
  });
});

// ── ReceivableForm — empty name guard ────────────────────────────────────────

describe("ReceivableForm (extra) — empty name guard", () => {
  it("does not commit when name is empty even with a positive amount", () => {
    const setReceivables = vi.fn();
    const { container } = render(
      <ReceivableForm
        newRecv={{ name: "", emoji: "", amount: "500", note: "", dueDate: "" }}
        setNewRecv={vi.fn()}
        setReceivables={setReceivables}
        setShowRecvForm={vi.fn()}
      />,
    );
    fireEvent.click(
      within(container)
        .getAllByRole("button")
        .find((b) => b.textContent?.trim() === "Додати")!,
    );
    expect(setReceivables).not.toHaveBeenCalled();
  });
});

// ── AssetForm — empty name guard ─────────────────────────────────────────────

describe("AssetForm (extra) — empty name guard", () => {
  it("does not commit when name is empty even with a positive amount", () => {
    const setManualAssets = vi.fn();
    const { container } = render(
      withQueryClient(
        <AssetForm
          newAsset={{ name: "", amount: "500", currency: "UAH", emoji: "" }}
          setNewAsset={vi.fn()}
          setManualAssets={setManualAssets}
          setShowAssetForm={vi.fn()}
          assetFormRef={createRef()}
          assetNameInputRef={createRef()}
        />,
      ),
    );
    fireEvent.click(
      within(container)
        .getAllByRole("button")
        .find((b) => b.textContent?.trim() === "Додати")!,
    );
    expect(setManualAssets).not.toHaveBeenCalled();
  });
});

// ── AssetForm — UAH-only + legacy non-UAH hint ──────────────────────────────

describe("AssetForm (extra) — UAH-only", () => {
  it("does not expose a currency selector or a premium gate", () => {
    render(
      withQueryClient(
        <AssetForm
          newAsset={{
            name: "Cash",
            amount: "1000",
            currency: "UAH",
            emoji: "",
          }}
          setNewAsset={vi.fn()}
          setManualAssets={vi.fn()}
          setShowAssetForm={vi.fn()}
          assetFormRef={createRef()}
          assetNameInputRef={createRef()}
        />,
      ),
    );
    expect(screen.getByText("UAH")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /валюта активу/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the non-UAH networth hint when currency is USD", () => {
    render(
      withQueryClient(
        <AssetForm
          newAsset={{
            name: "Cash",
            amount: "1000",
            currency: "USD",
            emoji: "",
          }}
          setNewAsset={vi.fn()}
          setManualAssets={vi.fn()}
          setShowAssetForm={vi.fn()}
          assetFormRef={createRef()}
          assetNameInputRef={createRef()}
        />,
      ),
    );
    expect(screen.getByText(/старий запис у USD/i)).toBeInTheDocument();
  });

  it("hides the legacy-currency hint when currency is UAH", () => {
    render(
      withQueryClient(
        <AssetForm
          newAsset={{
            name: "Cash",
            amount: "1000",
            currency: "UAH",
            emoji: "",
          }}
          setNewAsset={vi.fn()}
          setManualAssets={vi.fn()}
          setShowAssetForm={vi.fn()}
          assetFormRef={createRef()}
          assetNameInputRef={createRef()}
        />,
      ),
    );
    expect(screen.queryByText(/старий запис у/i)).not.toBeInTheDocument();
  });
});

// ── DebtForm — voice input ───────────────────────────────────────────────────

describe("DebtForm (extra) — voice input", () => {
  it("populates name and totalAmount from voice transcript", () => {
    const setNewDebt = vi.fn();
    render(
      <DebtForm
        newDebt={{ name: "", emoji: "", totalAmount: "", dueDate: "" }}
        setNewDebt={setNewDebt}
        setManualDebts={vi.fn()}
        setShowDebtForm={vi.fn()}
        debtFormRef={createRef()}
        debtNameInputRef={createRef()}
      />,
    );
    fireEvent.click(screen.getByTestId("voice-mic"));
    expect(setNewDebt).toHaveBeenCalledWith(expect.any(Function));
    // Execute the updater to verify what it returns
    const updater = vi.mocked(setNewDebt).mock.calls[0]![0] as (prev: {
      name: string;
      emoji: string;
      totalAmount: string;
      dueDate: string;
    }) => unknown;
    const result = updater({
      name: "",
      emoji: "\u{1F4B8}",
      totalAmount: "",
      dueDate: "",
    });
    expect(result).toMatchObject({ name: "Борг", totalAmount: "50000" });
  });

  it("does not update when parseExpenseSpeech returns null", async () => {
    const { parseExpenseSpeech } = await import("@sergeant/shared");
    vi.mocked(parseExpenseSpeech).mockReturnValueOnce(null);

    const setNewDebt = vi.fn();
    render(
      <DebtForm
        newDebt={{
          name: "Existing",
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
    fireEvent.click(screen.getByTestId("voice-mic"));
    expect(setNewDebt).not.toHaveBeenCalled();
  });
});
