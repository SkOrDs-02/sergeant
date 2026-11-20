/**
 * Вартість рахунків-активів поза Моно: депозит (нарахування за ставкою),
 * ОВДП (амортизація до номіналу + накопичений купон), фонд («вклав /
 * коштує»). Спека: `docs/work/specs/finyk-savings-assets.md`.
 *
 * Усе — чисті функції над `YYYY-MM-DD` (день пристрою, ADR-0078) і сумами в
 * копійках/центах валюти активу. Дати рахуються як календарні дні (UTC-день
 * для ключа), тож часовий пояс не впливає. Ринкових котирувань немає
 * (канон Фініку §7).
 */
import type {
  AssetEvent,
  AssetKind,
  ManualAsset,
  OvdpParams,
} from "./types.js";

const DAY_MS = 86_400_000;

/**
 * Дефолтний податок на відсотки депозиту: ПДФО 18% (ПКУ ст. 170.4) +
 * військовий збір 5% (з 2025 року). Користувач може змінити в активі.
 */
export const DEFAULT_DEPOSIT_TAX_PCT = 23;

/**
 * Дефолтний податок на купон ОВДП: ПДФО не утримується (ПКУ 165.1.2), а
 * купони, за словами власника (2026-11-19), приходять повністю.
 */
export const DEFAULT_OVDP_TAX_PCT = 0;

/** Купони ОВДП зазвичай двічі на рік; редагується в активі. */
export const DEFAULT_OVDP_COUPONS_PER_YEAR = 2;

// ── Дати ────────────────────────────────────────────────────────────────

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` → номер дня від епохи; `null` для некоректного ключа. */
export function dayNumber(key: string | null | undefined): number | null {
  if (!key) return null;
  const m = KEY_RE.exec(key);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? Math.round(ms / DAY_MS) : null;
}

/** Номер дня → `YYYY-MM-DD`. */
export function dateKeyFromDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Сьогодні за годинником пристрою, `YYYY-MM-DD`. */
export function localTodayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Зсув на `months` місяців із прив'язкою до числа `anchorDay`; місяць без
 * такого числа бере останній день («31 січня + 1 міс.» = 28/29 лютого).
 */
export function addMonthsKey(
  key: string,
  months: number,
  anchorDay?: number,
): string | null {
  const m = KEY_RE.exec(key);
  if (!m) return null;
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(anchorDay ?? Number(m[3]), lastDay);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ── Журнал ──────────────────────────────────────────────────────────────

/** Події з коректною датою, за датою (стабільно щодо порядку запису). */
export function sortedAssetEvents(
  asset: Pick<ManualAsset, "events">,
): AssetEvent[] {
  return (asset.events ?? [])
    .map((e, i) => ({ e, i, day: dayNumber(e.date) }))
    .filter((x) => x.day !== null)
    .sort((a, b) => (a.day as number) - (b.day as number) || a.i - b.i)
    .map((x) => x.e);
}

function amountOf(e: AssetEvent): number {
  const v = Number(e.amountMinor);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Вкладено на дату: Σ внесків − Σ повернень (у валюті активу). */
export function assetInvestedMinor(
  asset: Pick<ManualAsset, "events">,
  today: string,
): number {
  const todayDay = dayNumber(today) ?? Number.POSITIVE_INFINITY;
  let sum = 0;
  for (const e of sortedAssetEvents(asset)) {
    if ((dayNumber(e.date) as number) > todayDay) break;
    if (e.type === "contribution") sum += amountOf(e);
    else if (e.type === "withdrawal") sum -= amountOf(e);
  }
  return sum;
}

// ── Фонд ────────────────────────────────────────────────────────────────

/**
 * Фонд «вклав / коштує»: остання оцінка на дату плюс внески й повернення
 * після неї; без оцінки — вкладено.
 */
export function fundValueMinor(
  asset: Pick<ManualAsset, "events">,
  today: string,
): number {
  const todayDay = dayNumber(today) ?? Number.POSITIVE_INFINITY;
  let value = 0;
  for (const e of sortedAssetEvents(asset)) {
    if ((dayNumber(e.date) as number) > todayDay) break;
    if (e.type === "valuation") value = amountOf(e);
    else if (e.type === "contribution") value += amountOf(e);
    else if (e.type === "withdrawal") value = Math.max(0, value - amountOf(e));
  }
  return value;
}

// ── Депозит ─────────────────────────────────────────────────────────────

type DepositPoint =
  | { day: number; kind: "capitalize" }
  | { day: number; kind: "event"; event: AssetEvent };

/**
 * Депозит за ставкою: щоденне нарахування `тіло × ставка / 365`, мінус
 * податок; `monthly` додає нараховане до тіла в щомісячну дату старту,
 * `end` — у кінці строку, `payout` не додає (виплати приходять подіями
 * `income`, вартість = тіло). Подія `valuation` (залишок зі звіту банку)
 * перебиває розрахунок: тіло = оцінка, нараховане з нуля. Капіталізована
 * сума округлюється до копійки в день капіталізації.
 */
export function depositValueMinor(
  asset: Pick<ManualAsset, "events" | "deposit">,
  today: string,
): number {
  const params = asset.deposit;
  const todayDay = dayNumber(today);
  if (!params || todayDay === null)
    return Math.max(0, assetInvestedMinor(asset, today));
  const startDay = dayNumber(params.startDate);
  const endDay = dayNumber(params.endDate ?? null);
  const rate = Number(params.ratePct) / 100;
  const net = 1 - (Number(params.taxPct) || 0) / 100;
  const accrualEnd = endDay !== null ? Math.min(todayDay, endDay) : todayDay;

  const points: DepositPoint[] = [];
  for (const event of sortedAssetEvents(asset)) {
    const day = dayNumber(event.date) as number;
    if (day <= todayDay) points.push({ day, kind: "event", event });
  }
  if (startDay !== null && params.capitalization === "monthly") {
    const anchor = Number(params.startDate.slice(8, 10));
    for (let k = 1; ; k += 1) {
      const key = addMonthsKey(params.startDate, k, anchor);
      const day = dayNumber(key);
      if (day === null || day > accrualEnd) break;
      points.push({ day, kind: "capitalize" });
    }
  }
  if (
    endDay !== null &&
    endDay <= todayDay &&
    params.capitalization !== "payout"
  ) {
    points.push({ day: endDay, kind: "capitalize" });
  }
  // У той самий день спершу капіталізація, потім рух грошей.
  points.sort(
    (a, b) =>
      a.day - b.day ||
      (a.kind === "capitalize" ? -1 : 0) - (b.kind === "capitalize" ? -1 : 0),
  );

  let body = 0;
  let accrued = 0;
  let lastDay: number | null = null;
  const accrue = (to: number) => {
    if (lastDay === null || !Number.isFinite(rate) || rate <= 0) return;
    const from = Math.max(lastDay, startDay ?? lastDay);
    const until = Math.min(to, accrualEnd);
    if (until > from) accrued += (body * rate * (until - from) * net) / 365;
  };

  for (const p of points) {
    accrue(p.day);
    lastDay = lastDay === null ? p.day : Math.max(lastDay, p.day);
    if (p.kind === "capitalize") {
      body += Math.round(accrued);
      accrued = 0;
      continue;
    }
    const e = p.event;
    if (e.type === "contribution") body += amountOf(e);
    else if (e.type === "withdrawal") body = Math.max(0, body - amountOf(e));
    else if (e.type === "valuation") {
      body = amountOf(e);
      accrued = 0;
    }
  }
  accrue(todayDay);

  return params.capitalization === "payout" ? body : body + Math.round(accrued);
}

// ── ОВДП ────────────────────────────────────────────────────────────────

function couponStepMonths(params: OvdpParams): number {
  const perYear =
    Number(params.couponsPerYear) || DEFAULT_OVDP_COUPONS_PER_YEAR;
  return Math.max(1, Math.round(12 / perYear));
}

/**
 * Купонні дати навколо `today`: останню ≤ `today` і наступну > `today`,
 * відраховуючи від погашення кроками `12 / couponsPerYear` місяців.
 */
export function ovdpCouponWindow(
  params: OvdpParams,
  today: string,
): { last: string; next: string } | null {
  const maturityDay = dayNumber(params.maturityDate);
  const todayDay = dayNumber(today);
  if (maturityDay === null || todayDay === null || todayDay >= maturityDay) {
    return null;
  }
  const step = couponStepMonths(params);
  const anchor = Number(params.maturityDate.slice(8, 10));
  let next = params.maturityDate;
  for (let k = 1; k < 1200; k += 1) {
    const key = addMonthsKey(params.maturityDate, -k * step, anchor);
    const day = dayNumber(key);
    if (key === null || day === null) return null;
    if (day <= todayDay) return { last: key, next };
    next = key;
  }
  return null;
}

/** Майбутні купонні дати (після `today`) до погашення включно. */
export function ovdpUpcomingCoupons(
  params: OvdpParams,
  today: string,
): string[] {
  const todayDay = dayNumber(today);
  const maturityDay = dayNumber(params.maturityDate);
  if (todayDay === null || maturityDay === null || todayDay >= maturityDay) {
    return [];
  }
  const step = couponStepMonths(params);
  const anchor = Number(params.maturityDate.slice(8, 10));
  const out: string[] = [];
  for (let k = 0; k < 1200; k += 1) {
    const key = addMonthsKey(params.maturityDate, -k * step, anchor);
    const day = dayNumber(key);
    if (key === null || day === null || day <= todayDay) break;
    out.push(key);
  }
  return out.reverse();
}

interface OvdpLot {
  day: number;
  count: number;
  cost: number;
}

/** Лоти облігацій на дату: купівлі мінус продажі (FIFO, з пропорційною ціною). */
export function ovdpLots(
  asset: Pick<ManualAsset, "events" | "ovdp">,
  today: string,
): OvdpLot[] {
  const nominal = Number(asset.ovdp?.nominalMinor) || 0;
  const todayDay = dayNumber(today) ?? Number.POSITIVE_INFINITY;
  const lots: OvdpLot[] = [];
  for (const e of sortedAssetEvents(asset)) {
    const day = dayNumber(e.date) as number;
    if (day > todayDay) break;
    if (e.type === "contribution") {
      const cost = amountOf(e);
      const count =
        Number(e.count) > 0
          ? Math.floor(Number(e.count))
          : nominal > 0
            ? Math.max(1, Math.round(cost / nominal))
            : 0;
      if (count > 0) lots.push({ day, count, cost });
    } else if (e.type === "withdrawal" && Number(e.count) > 0) {
      let left = Math.floor(Number(e.count));
      for (const lot of lots) {
        if (left <= 0) break;
        const take = Math.min(left, lot.count);
        lot.cost -= (lot.cost * take) / lot.count;
        lot.count -= take;
        left -= take;
      }
    }
  }
  return lots.filter((l) => l.count > 0);
}

/**
 * ОВДП за амортизованою вартістю: ціна купівлі кожного лота лінійно
 * наближається до номіналу до дати погашення, плюс купон, накопичений з
 * останньої купонної дати (мінус податок). Після погашення — номінал.
 */
export function ovdpValueMinor(
  asset: Pick<ManualAsset, "events" | "ovdp">,
  today: string,
): number {
  const params = asset.ovdp;
  const todayDay = dayNumber(today);
  const maturityDay = dayNumber(params?.maturityDate ?? null);
  if (!params || todayDay === null || maturityDay === null) {
    return Math.max(0, assetInvestedMinor(asset, today));
  }
  const nominal = Number(params.nominalMinor) || 0;
  const lots = ovdpLots(asset, today);
  let value = 0;
  let count = 0;
  for (const lot of lots) {
    count += lot.count;
    const face = nominal * lot.count;
    if (todayDay >= maturityDay || maturityDay <= lot.day) value += face;
    else
      value +=
        lot.cost +
        ((face - lot.cost) * (todayDay - lot.day)) / (maturityDay - lot.day);
  }
  const window = ovdpCouponWindow(params, today);
  if (window && count > 0) {
    const last = dayNumber(window.last) as number;
    const next = dayNumber(window.next) as number;
    const perYear =
      Number(params.couponsPerYear) || DEFAULT_OVDP_COUPONS_PER_YEAR;
    const coupon =
      (count * nominal * (Number(params.couponRatePct) / 100)) / perYear;
    const net = 1 - (Number(params.taxPct) || 0) / 100;
    if (next > last)
      value += (coupon * (todayDay - last) * net) / (next - last);
  }
  return Math.round(value);
}

// ── Узагальнення ────────────────────────────────────────────────────────

/** Тип активу з урахуванням старих записів без `kind`. */
export function assetKindOf(asset: Pick<ManualAsset, "kind">): AssetKind {
  const k = asset.kind;
  return k === "deposit" || k === "ovdp" || k === "fund" ? k : "other";
}

export function isAssetClosed(asset: Pick<ManualAsset, "status">): boolean {
  return asset.status === "closed";
}

/** Строк депозиту чи ОВДП минув, а актив ще не закрито. */
export function isAssetMatured(
  asset: Pick<ManualAsset, "kind" | "deposit" | "ovdp" | "status">,
  today: string,
): boolean {
  if (isAssetClosed(asset)) return false;
  const todayDay = dayNumber(today);
  if (todayDay === null) return false;
  const kind = assetKindOf(asset);
  const end =
    kind === "deposit"
      ? dayNumber(asset.deposit?.endDate ?? null)
      : kind === "ovdp"
        ? dayNumber(asset.ovdp?.maturityDate ?? null)
        : null;
  return end !== null && todayDay >= end;
}

/** Вартість у валюті активу, копійки/центи. Старий актив — `amount`. */
export function assetValueMinor(asset: ManualAsset, today: string): number {
  switch (assetKindOf(asset)) {
    case "deposit":
      return depositValueMinor(asset, today);
    case "ovdp":
      return ovdpValueMinor(asset, today);
    case "fund":
      return fundValueMinor(asset, today);
    default:
      return Math.round((Number(asset.amount) || 0) * 100);
  }
}

/**
 * Сума в гривнях (копійки): гривневий актив як є, інший — за курсом,
 * який ввів користувач; `null`, коли курсу немає (актив не входить у
 * капітал і має бути названий як виключений).
 */
export function toUahMinor(
  asset: Pick<ManualAsset, "currency" | "fxRate">,
  minor: number,
): number | null {
  if (asset.currency === "UAH") return minor;
  const rate = Number(asset.fxRate?.uahPerUnit);
  return Number.isFinite(rate) && rate > 0 ? Math.round(minor * rate) : null;
}

export interface AssetValuation {
  kind: AssetKind;
  /** Вартість у валюті активу. */
  valueMinor: number;
  /** Вкладено у валюті активу; `null` для старого активу без журналу. */
  investedMinor: number | null;
  /** Вартість − вкладено; `null`, коли вкладеного немає. */
  resultMinor: number | null;
  /** Результат у % від вкладеного. */
  resultPct: number | null;
  /** Вартість у гривнях або `null` без курсу. */
  uahMinor: number | null;
}

export function valueAsset(asset: ManualAsset, today: string): AssetValuation {
  const kind = assetKindOf(asset);
  const valueMinor = assetValueMinor(asset, today);
  const hasJournal = kind !== "other" || (asset.events?.length ?? 0) > 0;
  const investedMinor = hasJournal ? assetInvestedMinor(asset, today) : null;
  const resultMinor =
    investedMinor !== null && investedMinor > 0
      ? valueMinor - investedMinor
      : null;
  return {
    kind,
    valueMinor,
    investedMinor,
    resultMinor,
    resultPct:
      resultMinor !== null && investedMinor
        ? (resultMinor / investedMinor) * 100
        : null,
    uahMinor: toUahMinor(asset, valueMinor),
  };
}
