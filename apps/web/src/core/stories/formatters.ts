import { formatMoney, formatNumberUk } from "@sergeant/shared";

export function fmtUah(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return formatMoney(v);
}

export function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return formatNumberUk(v, { maximumFractionDigits: 0 });
}
