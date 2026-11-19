/**
 * Привʼязка банківських операцій до рахунків-активів і пропозиції «Схоже на
 * внесок у …» (спека `docs/work/specs/finyk-savings-assets.md`).
 *
 * - Списання → «Це внесок у…» (подія `contribution`), надходження →
 *   «Повернення з…» (`withdrawal`) або «Дохід з…» (`income`). Внесок і
 *   повернення виходять зі статистики через `assetTransferTxIds`; дохід
 *   отримує категорію `in_assets` і лишається доходом.
 * - Подія несе `txId` і ключ отримувача; одна операція привʼязана щонайбільше
 *   до одного активу (нова привʼязка знімає стару).
 * - Пропозиції: банківські списання поточного списку з тим самим ключем
 *   отримувача, що й попередній внесок, ще не привʼязані й не відхилені.
 *   «Ні» памʼятається на пристрої (`FINYK_ASSET_LINK_SUGGESTION_REJECTED_TX_KEY`).
 *   Як і в `useTransferSuggestions.ts`, відповіді перечитуються, щойно
 *   сховище прогрілось (`useStorageReady`), а до того пропозицій немає.
 */
import { useCallback, useMemo, useState } from "react";
import { useStorageReady } from "../../../../core/db/storageReady";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import {
  assetLinkByTxId,
  contributionMerchantIndex,
  localTodayKey,
  type AssetEvent,
  type AssetEventType,
} from "@sergeant/finyk-domain/domain/assets";
import { normalizeMerchantKey } from "@sergeant/finyk-domain/lib/recurringDetect";
import { ASSET_INCOME_CATEGORY_ID } from "@sergeant/finyk-domain/constants";
import { FINYK_ASSET_LINK_SUGGESTION_REJECTED_TX_KEY } from "@sergeant/finyk-domain/storage-keys";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import type { ManualAsset } from "../../hooks/useStorage";
import { fromDomainAsset, toDomainAsset } from "../../lib/manualAssetAdapter";
import { withCachedAmount } from "../../lib/savingsAssetDraft";

export interface AssetLinkSuggestion {
  tx: Transaction;
  asset: ManualAsset;
  /** Сума внеску у валюті активу. */
  amountMinor: number;
}

export interface AssetLinkApi {
  assets: ManualAsset[];
  current: { assetId: string; type: AssetEventType } | undefined;
  onLink: (
    assetId: string,
    type: AssetEventType,
    amountMinor: number,
    count?: number,
  ) => void;
  onUnlink: () => void;
}

function txDateKey(tx: Transaction): string {
  const ms = Number(tx.time) * 1000;
  return Number.isFinite(ms) && ms > 0
    ? localTodayKey(new Date(ms))
    : localTodayKey();
}

function merchantKeyOf(tx: Transaction): string | undefined {
  const key = normalizeMerchantKey(String(tx.description ?? ""));
  return key || undefined;
}

/** Сума операції (копійки UAH) у валюті активу; `null` без курсу. */
export function txAmountInAsset(
  tx: Transaction,
  asset: ManualAsset,
): number | null {
  const uah = Math.abs(Math.round(Number(tx.amount) || 0));
  if ((asset.currency ?? "UAH") === "UAH") return uah;
  const rate = Number(toDomainAsset(asset).fxRate?.uahPerUnit);
  return Number.isFinite(rate) && rate > 0 ? Math.round(uah / rate) : null;
}

export function useAssetLinks({
  storageReady,
  activeTx,
  hiddenTxIds,
  excludedTxIds,
  manualAssets,
  setManualAssets,
  overrideCategory,
}: {
  storageReady: boolean;
  activeTx: readonly Transaction[];
  hiddenTxIds: readonly string[];
  excludedTxIds: ReadonlySet<string>;
  manualAssets: readonly ManualAsset[] | undefined;
  setManualAssets:
    ((updater: (assets: ManualAsset[]) => ManualAsset[]) => void) | undefined;
  overrideCategory: (id: string, catId: string | null) => void;
}) {
  const kvReady = useStorageReady();
  const readRejected = () =>
    new Set(
      safeReadLS<string[]>(FINYK_ASSET_LINK_SUGGESTION_REJECTED_TX_KEY, []) ??
        [],
    );
  const [rejected, setRejected] = useState<Set<string>>(readRejected);
  const [readWithKv, setReadWithKv] = useState(kvReady);
  if (kvReady && !readWithKv) {
    setReadWithKv(true);
    setRejected(readRejected());
  }

  const assets = useMemo(() => manualAssets ?? [], [manualAssets]);
  const linkIndex = useMemo(() => assetLinkByTxId(assets), [assets]);
  const activeAssets = useMemo(
    () => assets.filter((a) => a["status"] !== "closed"),
    [assets],
  );

  const link = useCallback(
    (
      tx: Transaction,
      assetId: string,
      type: AssetEventType,
      amountMinor: number,
      count?: number,
    ) => {
      if (!setManualAssets) return;
      const prev = linkIndex.get(tx.id);
      const today = localTodayKey();
      const event: AssetEvent = {
        id: crypto.randomUUID(),
        type,
        date: txDateKey(tx),
        amountMinor,
        txId: tx.id,
        ...(merchantKeyOf(tx) ? { merchantKey: merchantKeyOf(tx) } : {}),
        ...(count && count > 0 ? { count } : {}),
      };
      setManualAssets((list) =>
        list.map((item) => {
          const d = toDomainAsset(item);
          const kept = (d.events ?? []).filter((e) => e.txId !== tx.id);
          const events = item.id === assetId ? [...kept, event] : kept;
          if (events.length === (d.events ?? []).length && item.id !== assetId)
            return item;
          return fromDomainAsset(
            withCachedAmount({ ...d, events }, today),
            item,
          );
        }),
      );
      if (type === "income") overrideCategory(tx.id, ASSET_INCOME_CATEGORY_ID);
      else if (prev?.type === "income") overrideCategory(tx.id, null);
    },
    [linkIndex, setManualAssets, overrideCategory],
  );

  const unlink = useCallback(
    (tx: Transaction) => {
      if (!setManualAssets) return;
      const prev = linkIndex.get(tx.id);
      const today = localTodayKey();
      setManualAssets((list) =>
        list.map((item) => {
          const d = toDomainAsset(item);
          const events = (d.events ?? []).filter((e) => e.txId !== tx.id);
          return events.length === (d.events ?? []).length
            ? item
            : fromDomainAsset(withCachedAmount({ ...d, events }, today), item);
        }),
      );
      if (prev?.type === "income") overrideCategory(tx.id, null);
    },
    [linkIndex, setManualAssets, overrideCategory],
  );

  const linkFor = (tx: Transaction): AssetLinkApi | undefined => {
    const current = linkIndex.get(tx.id);
    if (!setManualAssets || (activeAssets.length === 0 && !current)) {
      return undefined;
    }
    return {
      assets: activeAssets,
      current,
      onLink: (assetId, type, amountMinor, count) =>
        link(tx, assetId, type, amountMinor, count),
      onUnlink: () => unlink(tx),
    };
  };

  const suggestions = useMemo<AssetLinkSuggestion[]>(() => {
    if (!storageReady || !readWithKv || !setManualAssets) return [];
    const byMerchant = contributionMerchantIndex(assets);
    if (byMerchant.size === 0) return [];
    const hidden = new Set(hiddenTxIds);
    const out: AssetLinkSuggestion[] = [];
    for (const tx of activeTx) {
      if (tx.manual || Number(tx.amount) >= 0) continue;
      if (hidden.has(tx.id) || excludedTxIds.has(tx.id)) continue;
      if (linkIndex.has(tx.id) || rejected.has(tx.id)) continue;
      const key = merchantKeyOf(tx);
      const assetId = key ? byMerchant.get(key) : undefined;
      const asset = assetId
        ? activeAssets.find((a) => a.id === assetId)
        : undefined;
      if (!asset) continue;
      const amountMinor = txAmountInAsset(tx, asset);
      if (amountMinor) out.push({ tx, asset, amountMinor });
    }
    return out;
  }, [
    storageReady,
    readWithKv,
    setManualAssets,
    assets,
    activeAssets,
    activeTx,
    hiddenTxIds,
    excludedTxIds,
    linkIndex,
    rejected,
  ]);

  const accept = (s: AssetLinkSuggestion) =>
    link(s.tx, s.asset.id, "contribution", s.amountMinor);
  const reject = (s: AssetLinkSuggestion) => {
    const next = new Set(rejected);
    next.add(s.tx.id);
    setRejected(next);
    safeWriteLS(FINYK_ASSET_LINK_SUGGESTION_REJECTED_TX_KEY, [...next]);
  };

  return { linkFor, suggestions, accept, reject };
}
