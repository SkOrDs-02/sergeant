/** @vitest-environment jsdom */
/**
 * Coverage tests for AssetsSubscriptionsSection.
 *
 * The section has 0% coverage. We mock SubCard and SubscriptionForm to keep
 * tests isolated from their own complexity, then focus on the section's own
 * logic: rendering subscriptions vs. empty state, the routine-calendar link,
 * the delete + undo path, the edit path, and linking transactions.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Subscription } from "../hooks/useStorage.types";

// Mock the heavy sub-components so we can test the section in isolation.
vi.mock("../components/SubCard", () => ({
  SubCard: ({
    sub,
    onDelete,
    onEdit,
    onLinkTransactions,
  }: {
    sub: { id: string; name: string };
    onDelete: () => void;
    onEdit: (p: object) => void;
    onLinkTransactions: () => void;
  }) => (
    <div data-testid={`sub-card-${sub.id}`}>
      <span>{sub.name}</span>
      <button onClick={onDelete}>delete-{sub.id}</button>
      <button onClick={() => onEdit({ name: "edited" })}>edit-{sub.id}</button>
      <button onClick={onLinkTransactions}>link-{sub.id}</button>
    </div>
  ),
}));

vi.mock("./AssetsForm", () => ({
  SubscriptionForm: () => <div data-testid="subscription-form" />,
}));

vi.mock("../hubRoutineSync", () => ({
  notifyFinykRoutineCalendarSync: vi.fn(),
}));

vi.mock("@shared/lib/modules/hubNav", () => ({
  openHubModule: vi.fn(),
}));

vi.mock("@shared/lib/ui/undoToast", () => ({
  showUndoToast: vi.fn((_toast, opts) => {
    // Expose the undo callback via a DOM button so tests can invoke it.
    const btn = document.createElement("button");
    btn.setAttribute("data-testid", "undo-btn");
    btn.textContent = "undo";
    btn.addEventListener("click", opts.onUndo);
    document.body.appendChild(btn);
  }),
}));

vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => vi.fn(),
}));

import { AssetsSubscriptionsSection } from "./AssetsSubscriptionsSection";
import { openHubModule } from "@shared/lib/modules/hubNav";
import { notifyFinykRoutineCalendarSync } from "../hubRoutineSync";

const openHubModuleMock = openHubModule as unknown as ReturnType<typeof vi.fn>;
const notifySyncMock = notifyFinykRoutineCalendarSync as unknown as ReturnType<
  typeof vi.fn
>;

function makeSub(id: string, name = `Sub ${id}`): Subscription {
  return { id, name } as unknown as Subscription;
}

function makeState(overrides: Partial<Parameters<typeof buildState>[0]> = {}) {
  return buildState(overrides);
}

function buildState(
  opts: {
    subscriptions?: Subscription[];
    showSubForm?: boolean;
  } = {},
) {
  const setSubscriptions = vi.fn();
  const setShowSubForm = vi.fn();
  const setNewSub = vi.fn();
  const setTxPicker = vi.fn();

  return {
    subscriptions: opts.subscriptions ?? [],
    setSubscriptions,
    transactions: [],
    showSubForm: opts.showSubForm ?? false,
    setShowSubForm,
    newSub: null,
    setNewSub,
    setTxPicker,
    showBalance: true,
    subsMonthly: 1250,
    // unused fields required by the state type
    manualAssets: [],
    setManualAssets: vi.fn(),
    manualDebts: [],
    setManualDebts: vi.fn(),
    receivables: [],
    setReceivables: vi.fn(),
    accounts: [],
    hiddenAccounts: [],
    toggleHideAccount: vi.fn(),
    txPicker: null,
    editingAssetId: null,
    setEditingAssetId: vi.fn(),
    newAsset: null,
    setNewAsset: vi.fn(),
    showAssetForm: false,
    setShowAssetForm: vi.fn(),
    sortedAccounts: [],
    networthData: { current: 0, delta: 0, pct: 0 },
    upcomingSchedule: [],
    toggleLinkedTx: vi.fn(),
    monoDebtLinkedTxIds: new Set(),
    toggleMonoDebtTx: vi.fn(),
    excludedTxIds: new Set(),
    updateSubscription: vi.fn(),
    addSubscriptionFromRecurring: vi.fn(),
    dismissedRecurring: [],
    dismissRecurring: vi.fn(),
  } as unknown as ReturnType<typeof import("./useAssetsState").useAssetsState>;
}

describe("AssetsSubscriptionsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Remove any undo buttons injected by prior test
    document
      .querySelectorAll('[data-testid="undo-btn"]')
      .forEach((el) => el.remove());
  });

  it("does not render its own add button — the quick-action row owns it", () => {
    render(<AssetsSubscriptionsSection state={makeState()} />);
    expect(screen.queryByText("+ Додати підписку")).toBeNull();
    expect(screen.queryByTestId("subscription-form")).toBeNull();
  });

  it("shows the canonical monthly subscription total", () => {
    render(<AssetsSubscriptionsSection state={makeState()} />);
    expect(
      screen.getByText("Витрати на підписки за місяць"),
    ).toBeInTheDocument();
    expect(
      Array.from(document.querySelectorAll("span")).some((el) =>
        /^1\u00a0250\u202f₴$/.test(el.textContent ?? ""),
      ),
    ).toBe(true);
  });

  it("uses the theme-aware finyk foreground on the monthly total plaque", () => {
    const { container } = render(
      <AssetsSubscriptionsSection state={makeState()} />,
    );
    const plaque = container.querySelector(".bg-finyk-soft");
    expect(plaque).not.toBeNull();
    expect(plaque!.querySelectorAll(".text-finyk-soft-fg")).toHaveLength(2);
    expect(plaque!.querySelector(".text-finyk-strong")).toBeNull();
  });

  it("does NOT show the calendar link when there are no subscriptions", () => {
    render(<AssetsSubscriptionsSection state={makeState()} />);
    expect(screen.queryByText(/Побачити у календарі Рутини/)).toBeNull();
  });

  it("shows the calendar link when there are subscriptions", () => {
    const state = makeState({ subscriptions: [makeSub("s1")] });
    render(<AssetsSubscriptionsSection state={state} />);
    expect(screen.getByText("Побачити у календарі Рутини")).toBeInTheDocument();
  });

  it("calls openHubModule on calendar link click", () => {
    const state = makeState({ subscriptions: [makeSub("s1")] });
    render(<AssetsSubscriptionsSection state={state} />);
    fireEvent.click(screen.getByText("Побачити у календарі Рутини"));
    expect(openHubModuleMock).toHaveBeenCalledWith("routine", "");
  });

  it("shows SubscriptionForm when showSubForm is true", () => {
    render(
      <AssetsSubscriptionsSection state={makeState({ showSubForm: true })} />,
    );
    expect(screen.getByTestId("subscription-form")).toBeInTheDocument();
  });

  it("renders a SubCard per subscription", () => {
    const state = makeState({
      subscriptions: [makeSub("a"), makeSub("b")],
    });
    render(<AssetsSubscriptionsSection state={state} />);
    expect(screen.getByTestId("sub-card-a")).toBeInTheDocument();
    expect(screen.getByTestId("sub-card-b")).toBeInTheDocument();
  });

  it("deletes a subscription and notifies routine sync", () => {
    const state = makeState({ subscriptions: [makeSub("s1")] });
    const setSubscriptions = state.setSubscriptions as unknown as ReturnType<
      typeof vi.fn
    >;
    render(<AssetsSubscriptionsSection state={state} />);
    fireEvent.click(screen.getByText("delete-s1"));
    expect(setSubscriptions).toHaveBeenCalled();
    const updater = setSubscriptions.mock.calls[0]![0] as (
      subscriptions: Subscription[],
    ) => Subscription[];
    expect(updater([makeSub("s1"), makeSub("s2")])).toEqual([makeSub("s2")]);
    expect(notifySyncMock).toHaveBeenCalled();
  });

  it("undo after delete restores the subscription and notifies sync", () => {
    const state = makeState({ subscriptions: [makeSub("s1")] });
    const setSubscriptions = state.setSubscriptions as unknown as ReturnType<
      typeof vi.fn
    >;
    render(<AssetsSubscriptionsSection state={state} />);
    fireEvent.click(screen.getByText("delete-s1"));

    // Trigger the undo callback that showUndoToast captured
    const undoBtn = document.querySelector('[data-testid="undo-btn"]');
    expect(undoBtn).not.toBeNull();
    fireEvent.click(undoBtn!);

    // setSubscriptions is called again for the undo splice
    expect(setSubscriptions).toHaveBeenCalledTimes(2);
    const undoUpdater = setSubscriptions.mock.calls[1]![0] as (
      subscriptions: Subscription[],
    ) => Subscription[];
    expect(undoUpdater([])).toEqual([makeSub("s1")]);
    expect(notifySyncMock).toHaveBeenCalledTimes(2);
  });

  it("edits a subscription and notifies routine sync", () => {
    const state = makeState({ subscriptions: [makeSub("s1")] });
    const setSubscriptions = state.setSubscriptions as unknown as ReturnType<
      typeof vi.fn
    >;
    render(<AssetsSubscriptionsSection state={state} />);
    fireEvent.click(screen.getByText("edit-s1"));
    expect(setSubscriptions).toHaveBeenCalled();
    const updater = setSubscriptions.mock.calls[0]![0] as (
      subscriptions: Subscription[],
    ) => Subscription[];
    expect(updater([makeSub("s1")])).toEqual([makeSub("s1", "edited")]);
    expect(notifySyncMock).toHaveBeenCalled();
  });

  it("links transactions by calling setTxPicker with correct args", () => {
    const state = makeState({ subscriptions: [makeSub("s1")] });
    render(<AssetsSubscriptionsSection state={state} />);
    fireEvent.click(screen.getByText("link-s1"));
    expect(state.setTxPicker).toHaveBeenCalledWith({
      type: "sub",
      subId: "s1",
    });
  });
});
