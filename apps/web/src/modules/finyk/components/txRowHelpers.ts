/**
 * Last validated: 2026-08-21
 * Status: Active
 *
 * Pure helpers + types for TxRow. Extracted so TxRow.tsx stays under the
 * Hard Rule #18 `max-lines: 600` ceiling.
 */
import {
  CATEGORY_ICON_NAMES,
  DEFAULT_CATEGORY_ICON,
} from "@sergeant/finyk-domain/lib/categoryIcons";
import type { IconName } from "@shared/components/ui/Icon";
import type { MonoAccount } from "@sergeant/finyk-domain/lib/accounts";

export const SPLIT_INPUT_CLASS =
  "input-focus-finyk flex-1 text-xs h-9 rounded-xl border border-line bg-panelHi px-2 text-text";

/**
 * `categoryId` → імʼя іконки для тонованого чипа категорії.
 *
 * Проєкція спільної мапи домену (`lib/categoryIcons.ts`) у web-тип
 * `IconName`. До 2026-08-21 таблиця жила тут, тож знав про неї лише
 * рядок транзакції — картка ліміту й алерти бюджету малювали замість
 * іконки емодзі-префікс підпису. Звірка «кожне імʼя є в наборі» —
 * `txRowHelpers.test.ts`.
 */
export const CATEGORY_ICON_MAP: Readonly<Record<string, IconName>> =
  CATEGORY_ICON_NAMES satisfies Readonly<Record<string, IconName>>;

/** Гліф для категорії без власного запису (зокрема кастомної). */
export const DEFAULT_CATEGORY_ICON_NAME: IconName = DEFAULT_CATEGORY_ICON;

/**
 * Підпис категорії без провідного емодзі.
 *
 * Вбудовані підписи чисті від 2026-08-21, тож єдине джерело, що ще може
 * принести гліф, — назва КАСТОМНОЇ категорії, яку людина набирає сама.
 * Зрізаємо її на рендері, щоб список категорій лишався однорідним:
 * дані не змінюються, змінюється лише показ.
 */
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
 * втрачав привʼязку до рахунку.
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
