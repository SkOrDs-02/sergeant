/**
 * Звʼязок рахунків-активів з операціями й «Відкладено за місяць»
 * (спека `docs/work/specs/finyk-savings-assets.md`).
 *
 * - Операція, привʼязана до активу як `contribution` чи `withdrawal`, — це
 *   переказ у відкладення: вона виходить зі статистики витрат і доходів
 *   (`assetTransferTxIds` → `buildFinykExcludedTxIds`).
 * - Привʼязана як `income` (купон, відсотки на картку) лишається доходом;
 *   її категорію ставить писач (`in_assets`), тут вона лише перелічується.
 * - «Відкладено за місяць» = внески − повернення в усіх активах (у гривнях
 *   за курсом активу) + чисте поповнення власних банок Monobank.
 */
import type { AssetEvent, ManualAsset } from "./types.js";
import { dayNumber, toUahMinor } from "./valuation.js";

/**
 * Сирі записи активів: доменні `ManualAsset` або рядки сховища, де поля
 * рахунку-активу лежать як невідомі ключі. Події перевіряються тут, тож
 * викликачам не треба приводити тип.
 */
type AssetsLike =
  | readonly (ManualAsset | Record<string, unknown> | null | undefined)[]
  | null
  | undefined;

const EVENT_TYPES = new Set<AssetEvent["type"]>([
  "contribution",
  "withdrawal",
  "income",
  "valuation",
]);

function asEvent(raw: unknown): AssetEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (typeof e["id"] !== "string" || typeof e["date"] !== "string") return null;
  if (!EVENT_TYPES.has(e["type"] as AssetEvent["type"])) return null;
  return raw as AssetEvent;
}

function eachEvent(
  assets: AssetsLike,
  fn: (asset: ManualAsset, event: AssetEvent) => void,
): void {
  for (const raw of assets ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const asset = raw as ManualAsset;
    const events = (raw as { events?: unknown }).events;
    if (!Array.isArray(events)) continue;
    for (const item of events) {
      const event = asEvent(item);
      if (event) fn(asset, event);
    }
  }
}

/** Операції-перекази в активи й назад: виходять зі статистики. */
export function assetTransferTxIds(assets: AssetsLike): Set<string> {
  const out = new Set<string>();
  eachEvent(assets, (_asset, e) => {
    if (e.txId && (e.type === "contribution" || e.type === "withdrawal")) {
      out.add(String(e.txId));
    }
  });
  return out;
}

/** Операції-виплати доходу з активів (лишаються доходом). */
export function assetIncomeTxIds(assets: AssetsLike): Set<string> {
  const out = new Set<string>();
  eachEvent(assets, (_asset, e) => {
    if (e.txId && e.type === "income") out.add(String(e.txId));
  });
  return out;
}

/** Будь-яка привʼязана операція → id активу і тип події. */
export function assetLinkByTxId(
  assets: AssetsLike,
): Map<string, { assetId: string; type: AssetEvent["type"] }> {
  const out = new Map<string, { assetId: string; type: AssetEvent["type"] }>();
  eachEvent(assets, (asset, e) => {
    if (e.txId) out.set(String(e.txId), { assetId: asset.id, type: e.type });
  });
  return out;
}

export interface JarTxLike {
  accountId?: string | null | undefined;
  /** Копійки; поповнення банки додатне, зняття відʼємне. */
  amount?: number | null | undefined;
  /** Unix-секунди (як у Monobank). */
  time?: number | null | undefined;
}

/** Початок дня `YYYY-MM-DD` за годинником пристрою, мс. */
function localDayStartMs(key: string): number | null {
  if (dayNumber(key) === null) return null;
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d).getTime();
}

/** Чисте поповнення власних банок у вікні `[from, to)` (дні пристрою). */
export function jarNetMinor(
  transactions: readonly (JarTxLike | null | undefined)[] | null | undefined,
  jarAccountIds: Iterable<string> | null | undefined,
  from: string,
  to: string,
): number {
  const ids = new Set(jarAccountIds ?? []);
  const fromMs = localDayStartMs(from);
  const toMs = localDayStartMs(to);
  if (ids.size === 0 || fromMs === null || toMs === null) return 0;
  let sum = 0;
  for (const tx of transactions ?? []) {
    if (!tx?.accountId || !ids.has(tx.accountId)) continue;
    const ms = Number(tx.time) * 1000;
    if (!Number.isFinite(ms) || ms < fromMs || ms >= toMs) continue;
    sum += Number(tx.amount) || 0;
  }
  return sum;
}

export interface MonthlySavedInput {
  assets: AssetsLike;
  /** `YYYY-MM-DD`, включно. */
  from: string;
  /** `YYYY-MM-DD`, виключно. */
  to: string;
  /** Операції рахунків-банок Monobank (за `accountId`). */
  jarTransactions?:
    readonly (JarTxLike | null | undefined)[] | null | undefined;
  /** Id гривневих банок. */
  jarAccountIds?: Iterable<string> | null | undefined;
}

export interface MonthlySaved {
  /** Разом, копійки UAH. */
  totalMinor: number;
  /** Внески − повернення в активах, копійки UAH. */
  assetsMinor: number;
  /** Чисте поповнення банок, копійки UAH. */
  jarsMinor: number;
  /** По активах, лише ненульові. */
  byAsset: { assetId: string; name: string; minor: number }[];
  /** Негривневі активи з рухом за місяць, але без курсу — не пораховані. */
  unconvertedCount: number;
}

/**
 * «Відкладено за місяць». Події рахуються за датою незалежно від статусу:
 * повернення, яким закрито депозит, зменшує суму свого місяця.
 */
export function computeMonthlySaved(input: MonthlySavedInput): MonthlySaved {
  const fromDay = dayNumber(input.from);
  const toDay = dayNumber(input.to);
  const byAsset = new Map<string, { name: string; minor: number }>();
  const unconverted = new Set<string>();
  if (fromDay !== null && toDay !== null) {
    eachEvent(input.assets, (asset, e) => {
      if (e.type !== "contribution" && e.type !== "withdrawal") return;
      const day = dayNumber(e.date);
      if (day === null || day < fromDay || day >= toDay) return;
      const amount = Number(e.amountMinor) || 0;
      const signed = e.type === "contribution" ? amount : -amount;
      const uah = toUahMinor(asset, signed);
      if (uah === null) {
        unconverted.add(asset.id);
        return;
      }
      const prev = byAsset.get(asset.id) ?? { name: asset.name, minor: 0 };
      prev.minor += uah;
      byAsset.set(asset.id, prev);
    });
  }
  let assetsMinor = 0;
  const list: MonthlySaved["byAsset"] = [];
  for (const [assetId, v] of byAsset) {
    assetsMinor += v.minor;
    if (v.minor !== 0) list.push({ assetId, name: v.name, minor: v.minor });
  }
  const jarsMinor = jarNetMinor(
    input.jarTransactions,
    input.jarAccountIds,
    input.from,
    input.to,
  );
  return {
    totalMinor: assetsMinor + jarsMinor,
    assetsMinor,
    jarsMinor,
    byAsset: list,
    unconvertedCount: unconverted.size,
  };
}

/**
 * Ключ отримувача → актив, куди туди востаннє вносили (лише активні
 * активи): основа пропозицій «Схоже на внесок у …».
 */
export function contributionMerchantIndex(
  assets: AssetsLike,
): Map<string, string> {
  const latest = new Map<string, { assetId: string; date: string }>();
  eachEvent(assets, (asset, e) => {
    if (e.type !== "contribution" || !e.merchantKey) return;
    if ((asset as { status?: unknown }).status === "closed") return;
    const prev = latest.get(e.merchantKey);
    if (!prev || e.date >= prev.date) {
      latest.set(e.merchantKey, { assetId: asset.id, date: e.date });
    }
  });
  return new Map([...latest].map(([k, v]) => [k, v.assetId]));
}
