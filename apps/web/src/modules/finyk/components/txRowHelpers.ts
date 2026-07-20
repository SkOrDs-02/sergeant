/**
 * Last validated: 2026-07-20
 * Status: Active
 *
 * Pure helpers + types for TxRow. Extracted so TxRow.tsx stays under the
 * Hard Rule #18 `max-lines: 600` ceiling.
 */
import { INTERNAL_TRANSFER_ID } from "../constants";
import type { IconName } from "@shared/components/ui/Icon";
import type { MonoAccount } from "@sergeant/finyk-domain/lib/accounts";

export const SPLIT_INPUT_CLASS =
  "input-focus-finyk flex-1 text-xs h-9 rounded-xl border border-line bg-panelHi px-2 text-text";

/**
 * Maps category IDs to Icon names for the tinted pill.
 * Falls back to "tag" for any unknown or custom category.
 * Phase 6.1 — Expensa-inspired category-tinted icon pill.
 */
export const CATEGORY_ICON_MAP: Record<string, IconName> = {
  food: "shopping-cart",
  restaurant: "coffee",
  transport: "truck",
  subscriptions: "bell",
  health: "droplet",
  shopping: "tag",
  entertainment: "play",
  sport: "dumbbell",
  beauty: "tag",
  smoking: "tag",
  education: "package",
  travel: "trending-up",
  debt: "credit-card",
  charity: "hand-coins",
  [INTERNAL_TRANSFER_ID]: "trending-down",
  // income
  in_salary: "briefcase",
  in_freelance: "briefcase",
  in_cashback: "tag",
  in_pension: "briefcase",
  in_other: "trending-up",
};

export function stripLeadingEmoji(label: string): string {
  const firstLetterOrDigit = [...label].findIndex((char) =>
    /[\p{L}\p{N}]/u.test(char),
  );
  return firstLetterOrDigit >= 0
    ? [...label].slice(firstLetterOrDigit).join("").trim()
    : label;
}

export function getAccountShortName(
  acc: MonoAccount | undefined,
): string | null {
  if (!acc) return null;
  const typeMap: Record<string, string> = {
    black: "Чорна",
    white: "Біла",
    platinum: "Platinum",
    iron: "Iron",
    fop: "ФОП",
    yellow: "Жовта",
  };
  const key = acc.type ?? "";
  return typeMap[key] || acc.type || "Рахунок";
}

/**
 * Мінімальна форма транзакції, яку рендерить рядок. Свідомо НЕ імпортуємо
 * повний `Transaction` з finyk-domain — рядок бачить і нормалізовані, і
 * сирі monobank-записи (різні точки виклику persist різні shape-и: Mono
 * statement entries, manual-expenses, merged splits), тому лишаємо тільки
 * реально читані поля. Typing-guard тут важливий не для uniqueness схеми,
 * а щоб запобігти "silent-new-field" регресіям — як тоді, коли
 * `tx._accountId` раптом перейменували у `.accountId` і рядок тихо
 * втрачав прив'язку до рахунку.
 */
export interface TxRowTx {
  id: string;
  amount: number;
  description?: string | undefined;
  mcc?: number | undefined;
  time?: number | undefined;
  currencyCode?: number | undefined;
  operationAmount?: number | undefined;
  _accountId?: string | null | undefined;
  _source?: string | undefined;
  _manual?: boolean | undefined;
  _manualId?: string | undefined;
  [k: string]: unknown;
}
