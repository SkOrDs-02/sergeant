/**
 * Last validated: 2026-10-01
 * Status: Active
 *
 * Правила «Завжди так для цього магазину» (рішення власника 2026-10-01, «c2»):
 * людина змінює категорію операції й одним тапом закріплює її за мерчантом
 * — `merchantKey → categoryId`.
 *
 * Це ЧИСТІ дані й пошук. Резолв категорії з правилом живе в `categories.ts`
 * (`getExpenseCategoryForTransaction` / `getIncomeCategoryForTransaction`
 * беруть індекс 4-м аргументом), а похідна мапа для агрегаторів — у
 * `merchantRuleOverrides.ts`.
 *
 * ПРІОРИТЕТ (канон, `docs/product/modules/finyk.md` § Журнал, 2026-10-01):
 *
 *   явний override операції  >  правило мерчанта  >  серверний слаг / MCC / слова
 *
 * Явний вибір людини на конкретній операції завжди сильніший за правило:
 * правило — це «за замовчуванням для цього мерчанта», а не наказ. Ручні
 * записи (`manual`) правило НЕ чіпає: їхню категорію людина вибрала сама в
 * момент створення, і це явний факт, не здогадка.
 *
 * Ключ мерчанта — той самий `normalizeMerchantKey`, що в детекторі
 * регулярних платежів і в дельті «топ продавців»: lowercase, без цифр і
 * пунктуації, до трьох значущих слів. Тобто «Сільпо №123» і «СІЛЬПО 45» — один
 * мерчант. Ціна цієї нормалізації відома: довге імʼя, що відрізняється лише
 * після третього слова, склеїться з сусіднім. Для «Поповнення «…»» (імʼя банки в
 * лапках) це означає, що правило береться за початком імені.
 *
 * Правило ніколи не вказує на `internal_transfer`: статистика виключає
 * переказ за мапою `txCategories` через `buildFinykExcludedTxIds`, а він не
 * бачить правил. Тихо виключити з підсумків усі операції мерчанта, не
 * показавши цього ніде, гірше за відмову — переказ підтверджує парний
 * матчер, одна операція за раз.
 */

import { INTERNAL_TRANSFER_ID } from "../constants.js";
import { normalizeMerchantKey } from "./recurringDetect.js";

export type MerchantRuleKind = "expense" | "income";

export interface MerchantRule {
  /**
   * Випадковий id правила (`mr_…`) — для видалення, скасування й
   * детермінованого вибору переможця при гонці. Унікальність за
   * `(kind, merchantKey)` тримає клієнт при записі (`upsertMerchantRule`),
   * а дубль від двох пристроїв, що створили правило одночасно, розвʼязує
   * {@link buildMerchantRuleIndex}.
   */
  id: string;
  kind: MerchantRuleKind;
  /** `normalizeMerchantKey(description)`; ніколи не порожній. */
  merchantKey: string;
  categoryId: string;
  /** Опис операції, як його бачила людина, — підпис у списку правил. */
  label: string;
  createdAt: string;
  updatedAt: string;
}

/** Скільки правил тримаємо; понад це — створення мовчки відхиляється. */
export const MERCHANT_RULES_LIMIT = 200;
/** Довжина підпису мерчанта в правилі. */
export const MERCHANT_RULE_LABEL_MAX = 80;

export type MerchantRuleIndex = ReadonlyMap<string, MerchantRule>;

/** Мінімум, потрібний для пошуку правила за операцією. */
export interface MerchantRuleTxLike {
  id?: string | undefined;
  description?: string | null | undefined;
  amount?: number | undefined;
  manual?: boolean | undefined;
  _manual?: boolean | undefined;
  source?: string | undefined;
}

export function merchantRuleIndexKey(
  kind: MerchantRuleKind,
  merchantKey: string,
): string {
  return `${kind}:${merchantKey}`;
}

/** Ключ мерчанта операції; порожній, якщо в описі немає літер (номер картки). */
export function merchantKeyOfTransaction(tx: MerchantRuleTxLike): string {
  return normalizeMerchantKey(tx.description);
}

/** Витрата/надходження за знаком суми; `null` для нуля й нечислових. */
export function merchantRuleKindOf(
  tx: MerchantRuleTxLike,
): MerchantRuleKind | null {
  const amount = Number(tx.amount);
  if (!Number.isFinite(amount) || amount === 0) return null;
  return amount < 0 ? "expense" : "income";
}

function isManualTransaction(tx: MerchantRuleTxLike): boolean {
  return tx.manual === true || tx._manual === true || tx.source === "manual";
}

/** Підпис мерчанта для правила: опис без зайвих пробілів, не довший за ліміт. */
export function merchantRuleLabelOf(tx: MerchantRuleTxLike): string {
  const raw = String(tx.description ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return raw.length > MERCHANT_RULE_LABEL_MAX
    ? `${raw.slice(0, MERCHANT_RULE_LABEL_MAX - 1).trimEnd()}…`
    : raw;
}

/** Одне збережене значення → правило, або `null`, якщо воно зіпсоване. */
export function sanitizeMerchantRule(raw: unknown): MerchantRule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r["id"] === "string" ? r["id"].trim() : "";
  const merchantKey =
    typeof r["merchantKey"] === "string" ? r["merchantKey"].trim() : "";
  const categoryId =
    typeof r["categoryId"] === "string" ? r["categoryId"].trim() : "";
  if (!id || !merchantKey || !categoryId) return null;
  if (categoryId === INTERNAL_TRANSFER_ID) return null;
  const kind: MerchantRuleKind = r["kind"] === "income" ? "income" : "expense";
  const label =
    typeof r["label"] === "string" && r["label"].trim()
      ? r["label"].trim().slice(0, MERCHANT_RULE_LABEL_MAX)
      : merchantKey;
  const createdAt = typeof r["createdAt"] === "string" ? r["createdAt"] : "";
  const updatedAt =
    typeof r["updatedAt"] === "string" && r["updatedAt"]
      ? r["updatedAt"]
      : createdAt;
  return { id, kind, merchantKey, categoryId, label, createdAt, updatedAt };
}

/** Масив збережених значень → лише валідні правила, без дублів `id`. */
export function sanitizeMerchantRules(raw: unknown): MerchantRule[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: MerchantRule[] = [];
  for (const item of raw) {
    const rule = sanitizeMerchantRule(item);
    if (!rule || seen.has(rule.id)) continue;
    seen.add(rule.id);
    out.push(rule);
  }
  return out;
}

/** Правило `a` сильніше за `b`: пізніший `updatedAt`, за рівності — менший id. */
function outranks(a: MerchantRule, b: MerchantRule): boolean {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt;
  return a.id < b.id;
}

/**
 * Індекс для пошуку: `kind:merchantKey → правило`.
 *
 * Дубль за ключем можливий лише при гонці двох пристроїв (обидва створили
 * правило для того самого мерчанта, ідентифікатори різні). Переможець
 * детермінований — пізніший `updatedAt`, за рівності менший `id` — тож усі
 * пристрої сходяться на одному й тому ж без координації.
 */
export function buildMerchantRuleIndex(
  rules: readonly unknown[] | null | undefined,
): MerchantRuleIndex {
  const index = new Map<string, MerchantRule>();
  if (!Array.isArray(rules)) return index;
  for (const raw of rules) {
    const rule = sanitizeMerchantRule(raw);
    if (!rule) continue;
    const key = merchantRuleIndexKey(rule.kind, rule.merchantKey);
    const prev = index.get(key);
    if (!prev || outranks(rule, prev)) index.set(key, rule);
  }
  return index;
}

/**
 * Правило операції. `null`: індекс порожній, операція ручна (її категорія —
 * явний факт), нульова сума, порожній ключ або правила для мерчанта немає.
 *
 * `kind` примусовий для резолверів витрат/надходжень: їх викликають
 * по-своєму, і знак суми там не завжди збігається з очікуваним боком.
 */
export function findMerchantRule(
  index: MerchantRuleIndex | null | undefined,
  tx: MerchantRuleTxLike,
  kind: MerchantRuleKind | null = merchantRuleKindOf(tx),
): MerchantRule | null {
  if (!index || index.size === 0 || !kind) return null;
  if (isManualTransaction(tx)) return null;
  const merchantKey = merchantKeyOfTransaction(tx);
  if (!merchantKey) return null;
  return index.get(merchantRuleIndexKey(kind, merchantKey)) ?? null;
}
