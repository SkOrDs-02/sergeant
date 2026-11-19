/**
 * Чернетка форми рахунку-активу (депозит, ОВДП, фонд) → `ManualAsset` для
 * `finyk_assets`. Спека: `docs/work/specs/finyk-savings-assets.md`.
 *
 * Чиста функція: UI (`SavingsAssetForm.tsx`) лише тримає рядки полів, а
 * перевірку й побудову робить тут, тож їх видно в тестах без React.
 */
import {
  DEFAULT_DEPOSIT_TAX_PCT,
  DEFAULT_OVDP_COUPONS_PER_YEAR,
  DEFAULT_OVDP_TAX_PCT,
  dayNumber,
  valueAsset,
  type AssetEvent,
  type DepositCapitalization,
  type ManualAsset,
} from "@sergeant/finyk-domain/domain/assets";
import { parseAmountToMinor } from "@shared/lib/format/amount";

export type SavingsKind = "deposit" | "ovdp" | "fund";
export type SavingsCurrency = "UAH" | "USD" | "EUR";

export interface SavingsAssetDraft {
  kind: SavingsKind;
  name: string;
  currency: SavingsCurrency;
  /** Гривень за одиницю валюти, рядок поля («41,5»). */
  fxRate: string;
  /** Внесок в основних одиницях валюти активу. */
  invested: string;
  /** `YYYY-MM-DD` внеску (для депозиту — і старт нарахування). */
  date: string;
  ratePct: string;
  endDate: string;
  capitalization: DepositCapitalization;
  taxPct: string;
  nominal: string;
  count: string;
  couponRatePct: string;
  couponsPerYear: string;
  maturityDate: string;
  currentValue: string;
}

export function emptySavingsDraft(
  kind: SavingsKind,
  today: string,
): SavingsAssetDraft {
  return {
    kind,
    name: "",
    currency: "UAH",
    fxRate: "",
    invested: "",
    date: today,
    ratePct: "",
    endDate: "",
    capitalization: "monthly",
    taxPct: String(
      kind === "ovdp" ? DEFAULT_OVDP_TAX_PCT : DEFAULT_DEPOSIT_TAX_PCT,
    ),
    nominal: "1000",
    count: "",
    couponRatePct: "",
    couponsPerYear: String(DEFAULT_OVDP_COUPONS_PER_YEAR),
    maturityDate: "",
    currentValue: "",
  };
}

/** Число з поля: кома як роздільник, порожнє → `null`. */
export function parseDecimal(raw: string): number | null {
  const s = String(raw ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function moneyMinor(raw: string): number | null {
  const parsed = parseAmountToMinor(raw);
  return parsed.ok ? parsed.minor : null;
}

function percent(raw: string): number | null {
  const n = parseDecimal(raw);
  return n !== null && n >= 0 && n <= 100 ? n : null;
}

/** Курс, якщо його ввели і він додатний; `undefined` — поле порожнє. */
function fxRateOf(draft: SavingsAssetDraft): number | null | undefined {
  if (draft.currency === "UAH" || !draft.fxRate.trim()) return undefined;
  const n = parseDecimal(draft.fxRate);
  return n !== null && n > 0 ? n : null;
}

/** Чи можна зберегти чернетку. */
export function isSavingsDraftValid(draft: SavingsAssetDraft): boolean {
  if (!draft.name.trim()) return false;
  if (moneyMinor(draft.invested) === null) return false;
  if (dayNumber(draft.date) === null) return false;
  if (fxRateOf(draft) === null) return false;
  if (draft.kind === "deposit") {
    const rate = parseDecimal(draft.ratePct);
    if (rate === null || rate < 0) return false;
    if (percent(draft.taxPct) === null) return false;
    if (draft.endDate) {
      const end = dayNumber(draft.endDate);
      if (end === null || end <= (dayNumber(draft.date) as number))
        return false;
    }
  }
  if (draft.kind === "ovdp") {
    if (moneyMinor(draft.nominal) === null) return false;
    const count = Number(draft.count);
    if (!Number.isInteger(count) || count < 1) return false;
    const coupon = parseDecimal(draft.couponRatePct);
    if (coupon === null || coupon < 0) return false;
    const perYear = Number(draft.couponsPerYear);
    if (!Number.isInteger(perYear) || perYear < 1 || 12 % perYear !== 0) {
      return false;
    }
    const maturity = dayNumber(draft.maturityDate);
    if (maturity === null || maturity <= (dayNumber(draft.date) as number)) {
      return false;
    }
    if (percent(draft.taxPct) === null) return false;
  }
  if (draft.kind === "fund" && draft.currentValue.trim()) {
    if (moneyMinor(draft.currentValue) === null) return false;
  }
  return true;
}

/**
 * Новий актив із чернетки або `null`, коли вона невалідна. `amount` —
 * вартість на сьогодні в основних одиницях (для старих клієнтів).
 */
export function buildSavingsAsset(
  draft: SavingsAssetDraft,
  opts: { today: string; newId: () => string },
): ManualAsset | null {
  if (!isSavingsDraftValid(draft)) return null;
  const invested = moneyMinor(draft.invested) as number;
  const contribution: AssetEvent = {
    id: opts.newId(),
    type: "contribution",
    date: draft.date,
    amountMinor: invested,
    ...(draft.kind === "ovdp" ? { count: Number(draft.count) } : {}),
  };
  const events: AssetEvent[] = [contribution];
  if (draft.kind === "fund" && draft.currentValue.trim()) {
    events.push({
      id: opts.newId(),
      type: "valuation",
      date: draft.date > opts.today ? draft.date : opts.today,
      amountMinor: moneyMinor(draft.currentValue) as number,
    });
  }
  const rate = fxRateOf(draft);
  const asset: ManualAsset = {
    id: opts.newId(),
    name: draft.name.trim(),
    emoji: draft.kind === "fund" ? "\u{1F4C8}" : "\u{1F3E6}",
    amount: 0,
    currency: draft.currency,
    kind: draft.kind,
    status: "active",
    events,
    ...(rate ? { fxRate: { uahPerUnit: rate, asOf: opts.today } } : {}),
    ...(draft.kind === "deposit"
      ? {
          deposit: {
            ratePct: parseDecimal(draft.ratePct) as number,
            startDate: draft.date,
            endDate: draft.endDate || null,
            capitalization: draft.capitalization,
            taxPct: percent(draft.taxPct) as number,
          },
        }
      : {}),
    ...(draft.kind === "ovdp"
      ? {
          ovdp: {
            nominalMinor: moneyMinor(draft.nominal) as number,
            couponRatePct: parseDecimal(draft.couponRatePct) as number,
            couponsPerYear: Number(draft.couponsPerYear),
            maturityDate: draft.maturityDate,
            taxPct: percent(draft.taxPct) as number,
          },
        }
      : {}),
  };
  return withCachedAmount(asset, opts.today);
}

/**
 * Тримає `amount` рівним вартості на сьогодні (основні одиниці валюти
 * активу): старий клієнт без підтримки типів покаже осмислене число.
 */
export function withCachedAmount(
  asset: ManualAsset,
  today: string,
): ManualAsset {
  if (!asset.kind || asset.kind === "other") return asset;
  return { ...asset, amount: valueAsset(asset, today).valueMinor / 100 };
}
