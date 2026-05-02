// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAssetsState, type AssetsProps } from "./useAssetsState";

type StorageArg = AssetsProps["storage"];
type MonoArg = AssetsProps["mono"];

function makeStorage(overrides: Record<string, unknown> = {}): StorageArg {
  const base = {
    hiddenAccounts: [] as string[],
    manualAssets: [] as Array<Record<string, unknown>>,
    setManualAssets: vi.fn(),
    manualDebts: [] as Array<Record<string, unknown>>,
    setManualDebts: vi.fn(),
    receivables: [] as Array<Record<string, unknown>>,
    setReceivables: vi.fn(),
    toggleLinkedTx: vi.fn(),
    subscriptions: [] as Array<Record<string, unknown>>,
    setSubscriptions: vi.fn(),
    updateSubscription: vi.fn(),
    addSubscriptionFromRecurring: vi.fn(),
    dismissedRecurring: [] as string[],
    dismissRecurring: vi.fn(),
    excludedTxIds: new Set<string>(),
    monoDebtLinkedTxIds: {},
    toggleMonoDebtTx: vi.fn(),
    customCategories: [] as Array<Record<string, unknown>>,
    ...overrides,
  };
  return base as unknown as StorageArg;
}

function makeMono(overrides: Record<string, unknown> = {}): MonoArg {
  const base = {
    accounts: [] as Array<Record<string, unknown>>,
    transactions: [] as Array<Record<string, unknown>>,
    ...overrides,
  };
  return base as unknown as MonoArg;
}

describe("useAssetsState", () => {
  it("returns networth=0 when no data", () => {
    const { result } = renderHook(() =>
      useAssetsState({
        mono: makeMono(),
        storage: makeStorage(),
      }),
    );
    expect(result.current.networth).toBe(0);
    expect(result.current.totalAssets).toBe(0);
    expect(result.current.totalDebt).toBe(0);
  });

  it("computes monoTotal from visible accounts", () => {
    const accounts = [
      { id: "acc1", balance: 500000, currencyCode: 980 },
      { id: "acc2", balance: 200000, currencyCode: 980 },
    ];
    const { result } = renderHook(() =>
      useAssetsState({
        mono: makeMono({ accounts }),
        storage: makeStorage(),
      }),
    );
    expect(result.current.monoTotal).toBe(7000);
    expect(result.current.totalAssets).toBe(7000);
  });

  it("excludes hidden accounts from totals", () => {
    const accounts = [
      { id: "acc1", balance: 500000, currencyCode: 980 },
      { id: "acc2", balance: 200000, currencyCode: 980 },
    ];
    const { result } = renderHook(() =>
      useAssetsState({
        mono: makeMono({ accounts }),
        storage: makeStorage({ hiddenAccounts: ["acc2"] }),
      }),
    );
    expect(result.current.monoTotal).toBe(5000);
  });

  it("computes manualAssetTotal from UAH assets only", () => {
    const manualAssets = [
      { name: "Cash", amount: "1000", currency: "UAH", emoji: "" },
      { name: "USD", amount: "500", currency: "USD", emoji: "" },
    ];
    const { result } = renderHook(() =>
      useAssetsState({
        mono: makeMono(),
        storage: makeStorage({ manualAssets }),
      }),
    );
    expect(result.current.manualAssetTotal).toBe(1000);
  });

  it("initialises section open state from props", () => {
    const { result } = renderHook(() =>
      useAssetsState({
        mono: makeMono(),
        storage: makeStorage(),
        initialOpenDebt: true,
      }),
    );
    expect(result.current.open.liabilities).toBe(true);
    expect(result.current.open.subscriptions).toBe(false);
    expect(result.current.open.assets).toBe(false);
  });

  it("openAssetForm opens assets section and shows form", () => {
    const { result } = renderHook(() =>
      useAssetsState({
        mono: makeMono(),
        storage: makeStorage(),
      }),
    );
    expect(result.current.open.assets).toBe(false);
    expect(result.current.showAssetForm).toBe(false);

    act(() => result.current.openAssetForm());

    expect(result.current.open.assets).toBe(true);
    expect(result.current.showAssetForm).toBe(true);
  });

  it("openDebtForm opens liabilities section and shows form", () => {
    const { result } = renderHook(() =>
      useAssetsState({
        mono: makeMono(),
        storage: makeStorage(),
      }),
    );
    act(() => result.current.openDebtForm());

    expect(result.current.open.liabilities).toBe(true);
    expect(result.current.showDebtForm).toBe(true);
  });

  it("openSubscriptionForm opens subscriptions section and shows form", () => {
    const { result } = renderHook(() =>
      useAssetsState({
        mono: makeMono(),
        storage: makeStorage(),
      }),
    );
    act(() => result.current.openSubscriptionForm());

    expect(result.current.open.subscriptions).toBe(true);
    expect(result.current.showSubForm).toBe(true);
  });

  it("networth = monoTotal + manualAssetTotal + totalReceivable - totalDebt", () => {
    const accounts = [{ id: "a", balance: 1000000, currencyCode: 980 }];
    const manualAssets = [
      { name: "x", amount: "500", currency: "UAH", emoji: "" },
    ];
    const { result } = renderHook(() =>
      useAssetsState({
        mono: makeMono({ accounts }),
        storage: makeStorage({ manualAssets }),
      }),
    );
    expect(result.current.networth).toBe(10000 + 500);
    expect(result.current.totalAssets).toBe(10000 + 500);
  });
});
