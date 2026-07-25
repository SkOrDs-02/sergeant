/**
 * Sergeant Finyk — AssetsPage (React Native)
 *
 * Mobile port of `apps/web/src/modules/finyk/pages/Assets.tsx` (~937 LOC).
 * Scope of this cut: three collapsible sections — Рахунки (Mono +
 * manual), Борги (я винен), Дебіторка (мені винні) — stacked below a
 * Networth header that reuses the same math as the Overview hero
 * (`apps/mobile/src/modules/finyk/pages/Overview/NetworthSection.tsx`,
 * merged in PR #460).
 *
 * All aggregations run through
 * `@sergeant/finyk-domain/domain/assets` — the page is a pure view
 * over `computeAssetsSummary`, `calcDebtRemaining`,
 * `calcReceivableRemaining`. Mutations flow through the MMKV-backed
 * `useFinykAssetsStore` hook so state survives app relaunches without
 * a second storage layer.
 *
 * Deferred to follow-up PRs (flagged in the PR body):
 *  - Live Monobank API sync — `accounts` / `transactions` are still
 *    seeded-only; the MMKV slice for both lands with the Monobank
 *    client port.
 *  - Transaction-picker sheet for linking payments to debts /
 *    receivables — depends on #453's `TxListItem`.
 *  - Subscriptions section + recurring-detector suggestions — out of
 *    scope for this PR; the Routine module owns that surface on
 *    mobile now.
 */

import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  computeAssetsSummary,
  type AssetsDebt,
  type AssetsReceivable,
  type ManualAsset,
} from "@sergeant/finyk-domain/domain";

import {
  useFinykAssetsStore,
  type FinykAssetsSeed,
} from "@/modules/finyk/lib/assetsStore";

import { DebtSheet } from "@/modules/finyk/components/assets/DebtSheet";
import { ManualAssetSheet } from "@/modules/finyk/components/assets/ManualAssetSheet";
import { ReceivableSheet } from "@/modules/finyk/components/assets/ReceivableSheet";
import {
  AccountRow,
  DebtRow,
  ManualAssetRow,
  ReceivableRow,
} from "@/modules/finyk/components/assets/rows";

type SheetState =
  | { kind: "closed" }
  | { kind: "asset"; asset: ManualAsset | null }
  | { kind: "debt"; debt: AssetsDebt | null }
  | { kind: "receivable"; receivable: AssetsReceivable | null };

const CLOSED: SheetState = { kind: "closed" };

function fmt(uah: number): string {
  return uah.toLocaleString("uk-UA", { maximumFractionDigits: 0 });
}

// Ukrainian pluralisation — mirrors
// `apps/web/src/core/hub/useHubDashboardState.ts` `pluralize()`.
function pluralizeUk(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

export interface AssetsPageProps {
  /** Test/storybook seed — pre-populates the MMKV slices this page owns. */
  seed?: FinykAssetsSeed;
  testID?: string;
}

interface SectionHeaderProps {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  testID?: string;
}

function SectionHeader({
  title,
  summary,
  open,
  onToggle,
  testID,
}: SectionHeaderProps) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      testID={testID}
      className="flex-row items-center justify-between px-4 py-3 bg-cream-50 border border-cream-300 rounded-2xl"
    >
      <View className="flex-row items-center gap-2 min-w-0 flex-1">
        <Text className="text-sm font-semibold text-fg" numberOfLines={1}>
          {title}
        </Text>
      </View>
      <View className="flex-row items-center gap-3">
        <Text className="text-sm font-medium text-fg">{summary}</Text>
        <Text className="text-xs text-fg-muted">{open ? "▲" : "▼"}</Text>
      </View>
    </Pressable>
  );
}

export function AssetsPage({ seed, testID }: AssetsPageProps) {
  const store = useFinykAssetsStore(seed);

  const [sheet, setSheet] = useState<SheetState>(CLOSED);
  const [open, setOpen] = useState({
    accounts: true,
    debts: true,
    receivables: true,
  });

  const summary = useMemo(
    () =>
      computeAssetsSummary({
        accounts: store.accounts,
        hiddenAccounts: store.hiddenAccounts,
        manualAssets: store.manualAssets,
        manualDebts: store.manualDebts,
        receivables: store.receivables,
        transactions: store.transactions,
      }),
    [
      store.accounts,
      store.hiddenAccounts,
      store.manualAssets,
      store.manualDebts,
      store.receivables,
      store.transactions,
    ],
  );

  // Non-UAH manual assets are excluded from networth (see
  // `sumManualAssetsUAH` in `@sergeant/finyk-domain`) — surface the count
  // so the exclusion isn't silent. Mirrors the web banner in
  // `apps/web/src/modules/finyk/pages/Overview.tsx`.
  const nonUahManualAssetCount = useMemo(
    () =>
      store.manualAssets.filter((a) => (a.currency ?? "UAH") !== "UAH").length,
    [store.manualAssets],
  );

  const visibleAccounts = useMemo(() => {
    const hidden = new Set(store.hiddenAccounts);
    return store.accounts.filter(
      (a) => !(a.id !== undefined && hidden.has(a.id)),
    );
  }, [store.accounts, store.hiddenAccounts]);

  const closeSheet = useCallback(() => setSheet(CLOSED), []);

  const submitAsset = useCallback(
    (next: ManualAsset) => {
      const existing = store.manualAssets.findIndex((a) => a.id === next.id);
      if (existing === -1) {
        store.setManualAssets([...store.manualAssets, next]);
      } else {
        store.setManualAssets(
          store.manualAssets.map((a) => (a.id === next.id ? next : a)),
        );
      }
    },
    [store],
  );
  const deleteAsset = useCallback(
    (id: string) => {
      store.setManualAssets(store.manualAssets.filter((a) => a.id !== id));
    },
    [store],
  );

  const submitDebt = useCallback(
    (next: AssetsDebt) => {
      const existing = store.manualDebts.findIndex((d) => d.id === next.id);
      if (existing === -1) {
        store.setManualDebts([...store.manualDebts, next]);
      } else {
        store.setManualDebts(
          store.manualDebts.map((d) => (d.id === next.id ? next : d)),
        );
      }
    },
    [store],
  );
  const deleteDebt = useCallback(
    (id: string) => {
      store.setManualDebts(store.manualDebts.filter((d) => d.id !== id));
    },
    [store],
  );

  const submitReceivable = useCallback(
    (next: AssetsReceivable) => {
      const existing = store.receivables.findIndex((r) => r.id === next.id);
      if (existing === -1) {
        store.setReceivables([...store.receivables, next]);
      } else {
        store.setReceivables(
          store.receivables.map((r) => (r.id === next.id ? next : r)),
        );
      }
    },
    [store],
  );
  const deleteReceivable = useCallback(
    (id: string) => {
      store.setReceivables(store.receivables.filter((r) => r.id !== id));
    },
    [store],
  );

  return (
    <SafeAreaView
      className="flex-1 bg-cream-50"
      edges={["top"]}
      testID={testID}
    >
      <View className="flex-row items-center gap-2 px-4 pt-4 pb-1">
        <Text className="text-[22px]">🏦</Text>
        <Text className="text-[22px] font-bold text-fg flex-1">Активи</Text>
      </View>
      <Text className="px-4 text-sm text-fg-muted leading-snug mb-2">
        Рахунки, борги і дебіторка в одному місці.
      </Text>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 96, gap: 12 }}
      >
        {/* Networth hero */}
        <View
          className="rounded-2xl bg-teal-700 p-4"
          testID={testID ? `${testID}-networth` : undefined}
        >
          <Text className="text-xs font-medium uppercase text-teal-100/80">
            Чисті активи
          </Text>
          <Text
            className="text-3xl font-extrabold text-white mt-1"
            testID={testID ? `${testID}-networth-value` : undefined}
          >
            {fmt(summary.networth)} ₴
          </Text>
          <Text className="text-xs text-teal-100/85 mt-1">
            Активи: {fmt(summary.totalAssets)} ₴ · Пасиви: −
            {fmt(summary.totalLiabilities)} ₴
          </Text>
        </View>

        {nonUahManualAssetCount > 0 && (
          <View
            className="rounded-2xl px-4 py-3 border border-warning/20 bg-warning/8"
            testID={testID ? `${testID}-non-uah-banner` : undefined}
          >
            <Text className="text-xs text-warning-strong">
              {nonUahManualAssetCount}{" "}
              {pluralizeUk(
                nonUahManualAssetCount,
                "актив в іноземній валюті не враховую в нетворсі",
                "активи в іноземній валюті не враховую в нетворсі",
                "активів в іноземній валюті не враховую в нетворсі",
              )}
            </Text>
          </View>
        )}

        {/* Accounts section */}
        <View className="gap-2">
          <SectionHeader
            title="💳 Рахунки"
            summary={`${fmt(summary.monoBalance + summary.manualAssetTotal)} ₴`}
            open={open.accounts}
            onToggle={() => setOpen((v) => ({ ...v, accounts: !v.accounts }))}
            testID={testID ? `${testID}-accounts-toggle` : undefined}
          />
          {open.accounts ? (
            <View className="rounded-2xl border border-cream-300 bg-white px-3 py-1">
              {visibleAccounts.length === 0 &&
              store.manualAssets.length === 0 ? (
                <Text
                  className="text-sm text-fg-muted py-4 text-center"
                  testID={testID ? `${testID}-accounts-empty` : undefined}
                >
                  Ще немає рахунків
                </Text>
              ) : (
                <>
                  {visibleAccounts.map((a, i) => (
                    <AccountRow
                      key={a.id ?? `acc-${i}`}
                      account={a}
                      testID={
                        testID ? `${testID}-account-${a.id ?? i}` : undefined
                      }
                    />
                  ))}
                  {store.manualAssets.map((a) => (
                    <ManualAssetRow
                      key={a.id}
                      asset={a}
                      onPress={() => setSheet({ kind: "asset", asset: a })}
                      testID={testID ? `${testID}-asset-${a.id}` : undefined}
                    />
                  ))}
                </>
              )}
              <Pressable
                onPress={() => setSheet({ kind: "asset", asset: null })}
                accessibilityRole="button"
                accessibilityLabel="Додати актив"
                testID={testID ? `${testID}-accounts-add` : undefined}
                className="py-2.5 items-center justify-center border-t border-cream-200 mt-1"
              >
                <Text className="text-sm font-medium text-brand-600">
                  + Додати актив
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* Debts section */}
        <View className="gap-2">
          <SectionHeader
            title="💸 Борги"
            summary={`−${fmt(summary.manualDebtTotal + summary.monoDebt)} ₴`}
            open={open.debts}
            onToggle={() => setOpen((v) => ({ ...v, debts: !v.debts }))}
            testID={testID ? `${testID}-debts-toggle` : undefined}
          />
          {open.debts ? (
            <View className="rounded-2xl border border-cream-300 bg-white px-3 py-1">
              {store.manualDebts.length === 0 ? (
                <Text
                  className="text-sm text-fg-muted py-4 text-center"
                  testID={testID ? `${testID}-debts-empty` : undefined}
                >
                  Ще немає боргів
                </Text>
              ) : (
                store.manualDebts.map((d) => (
                  <DebtRow
                    key={d.id}
                    debt={d}
                    transactions={store.transactions}
                    onPress={() => setSheet({ kind: "debt", debt: d })}
                    testID={testID ? `${testID}-debt-${d.id}` : undefined}
                  />
                ))
              )}
              <Pressable
                onPress={() => setSheet({ kind: "debt", debt: null })}
                accessibilityRole="button"
                accessibilityLabel="Додати борг"
                testID={testID ? `${testID}-debts-add` : undefined}
                className="py-2.5 items-center justify-center border-t border-cream-200 mt-1"
              >
                <Text className="text-sm font-medium text-brand-600">
                  + Додати борг
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* Receivables section */}
        <View className="gap-2">
          <SectionHeader
            title="🤝 Дебіторка"
            summary={`+${fmt(summary.receivableTotal)} ₴`}
            open={open.receivables}
            onToggle={() =>
              setOpen((v) => ({ ...v, receivables: !v.receivables }))
            }
            testID={testID ? `${testID}-receivables-toggle` : undefined}
          />
          {open.receivables ? (
            <View className="rounded-2xl border border-cream-300 bg-white px-3 py-1">
              {store.receivables.length === 0 ? (
                <Text
                  className="text-sm text-fg-muted py-4 text-center"
                  testID={testID ? `${testID}-receivables-empty` : undefined}
                >
                  Ще немає дебіторки
                </Text>
              ) : (
                store.receivables.map((r) => (
                  <ReceivableRow
                    key={r.id}
                    receivable={r}
                    transactions={store.transactions}
                    onPress={() =>
                      setSheet({ kind: "receivable", receivable: r })
                    }
                    testID={testID ? `${testID}-receivable-${r.id}` : undefined}
                  />
                ))
              )}
              <Pressable
                onPress={() =>
                  setSheet({ kind: "receivable", receivable: null })
                }
                accessibilityRole="button"
                accessibilityLabel="Додати дебіторку"
                testID={testID ? `${testID}-receivables-add` : undefined}
                className="py-2.5 items-center justify-center border-t border-cream-200 mt-1"
              >
                <Text className="text-sm font-medium text-brand-600">
                  + Додати дебіторку
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <ManualAssetSheet
        open={sheet.kind === "asset"}
        onClose={closeSheet}
        asset={sheet.kind === "asset" ? sheet.asset : null}
        onSubmit={submitAsset}
        onDelete={deleteAsset}
        testID={testID ? `${testID}-asset-sheet` : undefined}
      />
      <DebtSheet
        open={sheet.kind === "debt"}
        onClose={closeSheet}
        debt={sheet.kind === "debt" ? sheet.debt : null}
        onSubmit={submitDebt}
        onDelete={deleteDebt}
        testID={testID ? `${testID}-debt-sheet` : undefined}
      />
      <ReceivableSheet
        open={sheet.kind === "receivable"}
        onClose={closeSheet}
        receivable={sheet.kind === "receivable" ? sheet.receivable : null}
        onSubmit={submitReceivable}
        onDelete={deleteReceivable}
        testID={testID ? `${testID}-receivable-sheet` : undefined}
      />
    </SafeAreaView>
  );
}

export default AssetsPage;
