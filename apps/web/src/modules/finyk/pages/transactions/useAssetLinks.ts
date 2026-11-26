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
 * - Пропозиції (ще не привʼязані, не відхилені, не в парі переказу):
 *   операції з тим самим ключем отримувача, що й попередній внесок (списання
 *   → внесок, надходження → повернення), і операції, які `investmentSignalOf`
 *   впізнає як купівлю ОВДП, відкриття депозиту чи дохід з облігацій (спека
 *   `docs/work/specs/finyk-investment-suggestions.md`). Без активу потрібного
 *   типу внесок пропонує створити актив з операції.
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
  investmentSignalOf,
  localTodayKey,
  type InvestmentKind,
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
  type: AssetEventType;
  /** Активи, до яких можна привʼязати; порожньо — лише «Створити актив». */
  assets: ManualAsset[];
  /** Тип активу за сигналом операції: для «Створити актив». */
  kind: InvestmentKind | null;
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
const CURRENCY_BY_CODE: Readonly<Record<number, string>> = {
  840: "USD",
  978: "EUR",
};

/**
 * Валюта рахунку операції, перерахованої за курсом НБУ (`accountCurrencyCode`
 * + `accountAmount`, спека finyk-fx-nbu), або `null` для гривневої.
 */
export function txAccountCurrency(
  tx: Transaction,
): { currency: string; amountMinor: number; uahPerUnit: number | null } | null {
  const code = tx["accountCurrencyCode"];
  const amount = tx["accountAmount"];
  const currency = typeof code === "number" ? CURRENCY_BY_CODE[code] : null;
  if (!currency || typeof amount !== "number") return null;
  const rate = (tx["fxRate"] as { uahPerUnit?: unknown } | null | undefined)
    ?.uahPerUnit;
  return {
    currency,
    amountMinor: Math.abs(Math.round(amount)),
    uahPerUnit: typeof rate === "number" && rate > 0 ? rate : null,
  };
}

export function txAmountInAsset(
  tx: Transaction,
  asset: ManualAsset,
): number | null {
  const uah = Math.abs(Math.round(Number(tx.amount) || 0));
  if ((asset.currency ?? "UAH") === "UAH") return uah;
  // Операція з картки у валюті активу: сума рахунку точна, курс не потрібен.
  const account = txAccountCurrency(tx);
  if (account && account.currency === asset.currency)
    return account.amountMinor;
  const rate = Number(toDomainAsset(asset).fxRate?.uahPerUnit);
  return Number.isFinite(rate) && rate > 0 ? Math.round(uah / rate) : null;
}

export function useAssetLinks({
  storageReady,
  activeTx,
  hiddenTxIds,
  excludedTxIds,
  transferTxIds,
  manualAssets,
  setManualAssets,
  overrideCategory,
}: {
  storageReady: boolean;
  activeTx: readonly Transaction[];
  hiddenTxIds: readonly string[];
  excludedTxIds: ReadonlySet<string>;
  /** Ноги ще не підтверджених пар «схоже на переказ»: їх веде та картка. */
  transferTxIds?: ReadonlySet<string> | undefined;
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
    const hidden = new Set(hiddenTxIds);
    const ofKind = (kind: InvestmentKind) =>
      activeAssets.filter((a) => toDomainAsset(a).kind === kind);
    const out: AssetLinkSuggestion[] = [];
    for (const tx of activeTx) {
      const amount = Number(tx.amount);
      if (tx.manual || !amount) continue;
      if (hidden.has(tx.id) || excludedTxIds.has(tx.id)) continue;
      if (transferTxIds?.has(tx.id)) continue;
      if (linkIndex.has(tx.id) || rejected.has(tx.id)) continue;
      const key = merchantKeyOf(tx);
      const assetId = key ? byMerchant.get(key) : undefined;
      const known = assetId
        ? activeAssets.find((a) => a.id === assetId)
        : undefined;
      if (known && txAmountInAsset(tx, known)) {
        out.push({
          tx,
          type: amount < 0 ? "contribution" : "withdrawal",
          assets: [known],
          kind: null,
        });
        continue;
      }
      const signal = investmentSignalOf(tx);
      if (!signal) continue;
      const candidates = ofKind(signal.kind).filter(
        (a) => txAmountInAsset(tx, a) !== null,
      );
      // Дохід без активу лишається доходом: привʼязати його нема куди.
      if (signal.direction === "income" && candidates.length === 0) continue;
      out.push({
        tx,
        type: signal.direction,
        assets: candidates,
        kind: signal.kind,
      });
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
    transferTxIds,
    linkIndex,
    rejected,
  ]);

  const accept = (s: AssetLinkSuggestion, assetId?: string) => {
    const asset = s.assets.find((a) => a.id === assetId) ?? s.assets[0];
    if (!asset) return;
    const amountMinor = txAmountInAsset(s.tx, asset);
    if (amountMinor) link(s.tx, asset.id, s.type, amountMinor);
  };
  const reject = (s: AssetLinkSuggestion) => {
    const next = new Set(rejected);
    next.add(s.tx.id);
    setRejected(next);
    safeWriteLS(FINYK_ASSET_LINK_SUGGESTION_REJECTED_TX_KEY, [...next]);
  };
  /**
   * Актив, створений з операції: його перший внесок і є цією операцією
   * (`txId` і ключ отримувача, щоб наступні списання тому ж отримувачу
   * пропонувались уже до нього).
   */
  const createFrom = (s: AssetLinkSuggestion, asset: ManualAsset) => {
    if (!setManualAssets) return;
    const d = toDomainAsset(asset);
    const [first, ...rest] = d.events ?? [];
    const key = merchantKeyOf(s.tx);
    const events = first
      ? [
          { ...first, txId: s.tx.id, ...(key ? { merchantKey: key } : {}) },
          ...rest,
        ]
      : [];
    const linked = fromDomainAsset(
      withCachedAmount({ ...d, events }, localTodayKey()),
      asset,
    );
    setManualAssets((list) => [...list, linked]);
  };

  return { linkFor, suggestions, accept, reject, createFrom };
}
