// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// `GroupedVirtuoso` needs ResizeObserver / a real layout to render its
// items. For the DataState routing test we only care which slot is
// rendered (skeleton / empty / list) — a trivial mock that surfaces
// children via `groupContent` + `itemContent` is enough.
vi.mock("react-virtuoso", () => ({
  GroupedVirtuoso: ({
    groupCounts,
    groupContent,
    itemContent,
  }: {
    groupCounts: number[];
    groupContent: (i: number) => React.ReactNode;
    itemContent: (i: number) => React.ReactNode;
  }) => {
    const total = groupCounts.reduce((s, n) => s + n, 0);
    return (
      <div data-testid="grouped-virtuoso">
        {groupCounts.map((_, gi) => (
          <div key={`g-${gi}`}>{groupContent(gi)}</div>
        ))}
        {Array.from({ length: total }).map((_, i) => (
          <div key={`i-${i}`}>{itemContent(i)}</div>
        ))}
      </div>
    );
  },
}));

import { TransactionList } from "./TransactionList";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

/**
 * Common no-op handlers + maps that every render needs but we don't
 * exercise in DataState routing tests. Hoisted so each test stays
 * focused on the props that change branch.
 */
const NOOP = (): void => undefined;
const baseProps = {
  groupedByDate: [] as { key: string; items: Transaction[] }[],
  groupCounts: [] as number[],
  flatItems: [] as Transaction[],
  collapsedKeys: new Set<string>(),
  daySummaries: {},
  showBalance: true,
  toggleDay: NOOP,
  selectMode: false,
  selectedIds: new Set<string>(),
  hiddenTxIdSet: new Set<string>(),
  txCategories: {},
  txSplits: {},
  accounts: undefined,
  customCategories: undefined,
  onToggleSelect: NOOP,
  onSwipeHideTx: NOOP,
  onSwipeDeleteManual: NOOP,
  onEditManual: NOOP,
  onHideTx: NOOP,
  onCatChange: NOOP,
  onSplitChange: NOOP,
};

const SAMPLE_TX: Transaction = {
  id: "tx-1",
  date: "2026-05-04",
  description: "Сільпо",
  amount: -250,
  account: "mono-1",
} as unknown as Transaction;

describe("TransactionList — DataState routing", () => {
  // The shared web vitest setup (`src/test/setup.ts`) does not auto-run
  // `cleanup()` between tests — it stays focused on MSW lifecycle.
  // Each render here mounts the same scrollable shell, so without
  // explicit cleanup test N leaks DOM into test N+1 and the assertions
  // matching by text/testid see duplicates from the previous case.
  afterEach(() => cleanup());

  it("renders the skeleton slot when first-paint loading and activeTx is empty", () => {
    render(
      <TransactionList
        {...baseProps}
        loading={true}
        activeTx={[]}
        filtered={[]}
      />,
    );

    // The skeleton block is the only rendered branch — the live region
    // we attach is the most stable assertion target.
    const skeletons = document.querySelectorAll('[aria-busy="true"]');
    expect(skeletons.length).toBeGreaterThan(0);

    // The empty-state title and the virtualized list must NOT be
    // rendered while skeleton is on.
    expect(screen.queryByText("Немає транзакцій")).not.toBeInTheDocument();
    expect(screen.queryByTestId("grouped-virtuoso")).not.toBeInTheDocument();
  });

  it("renders the empty slot when not loading and filtered list is empty (with activeTx present)", () => {
    render(
      <TransactionList
        {...baseProps}
        loading={false}
        activeTx={[SAMPLE_TX]}
        filtered={[]}
      />,
    );

    expect(screen.getByText("Немає транзакцій")).toBeInTheDocument();
    expect(screen.queryByTestId("grouped-virtuoso")).not.toBeInTheDocument();
  });

  it("renders the virtualized list when filtered has rows", () => {
    render(
      <TransactionList
        {...baseProps}
        loading={false}
        activeTx={[SAMPLE_TX]}
        filtered={[SAMPLE_TX]}
        groupedByDate={[{ key: "2026-05-04", items: [SAMPLE_TX] }]}
        groupCounts={[1]}
        flatItems={[SAMPLE_TX]}
      />,
    );

    expect(screen.getByTestId("grouped-virtuoso")).toBeInTheDocument();
    expect(screen.queryByText("Немає транзакцій")).not.toBeInTheDocument();
  });

  it("keeps the list visible during a background refetch (loading=true with prior activeTx)", () => {
    // Stale-revalidate: a refetch is in flight but we already have a
    // payload from the previous tick. The list must NOT collapse to
    // the skeleton slot — that's the core of the DataState contract
    // (`data` stays defined while `isLoading` is true).
    render(
      <TransactionList
        {...baseProps}
        loading={true}
        activeTx={[SAMPLE_TX]}
        filtered={[SAMPLE_TX]}
        groupedByDate={[{ key: "2026-05-04", items: [SAMPLE_TX] }]}
        groupCounts={[1]}
        flatItems={[SAMPLE_TX]}
      />,
    );

    expect(screen.getByTestId("grouped-virtuoso")).toBeInTheDocument();
    expect(document.querySelectorAll('[aria-busy="true"]')).toHaveLength(0);
  });
});
