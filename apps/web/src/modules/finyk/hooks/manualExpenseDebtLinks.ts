/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Привʼязки платежів до боргу при видаленні та undo РУЧНОГО запису
 * (аудит 2026-10-01, `data-24`; канон `docs/product/modules/finyk.md`
 * § 4a та Журнал рішень).
 *
 * Чисті функції над `manualDebts` / `receivables`, без React і сховища:
 * `useFinykStorageMutations` лише викликає їх усередині updater-ів.
 *
 * AI-CONTEXT: видалення запису знімає з боргу обидві форми ключа
 * (`<id>` і `manual_<id>`, див. `debtLinkKeys`), а знімок зняттих
 * привʼязок їде в тост «Скасувати». Undo створює запис з НОВИМ id
 * (рішення з `restoreManualExpense` лишається), тож привʼязки
 * повертаються під `manual_<newId>` — інакше борг назавжди втрачав би
 * платіж після випадкового видалення.
 */
import {
  linkKeyAliases,
  manualLinkKey,
} from "@sergeant/finyk-domain/domain/debtLinkKeys";
import type { LinkedTxMeta } from "@sergeant/finyk-domain/domain/debtEngine";

type Linkable = {
  id: string;
  linkedTxIds?: string[] | undefined;
  txLinks?: Record<string, LinkedTxMeta> | undefined;
};

/** Знімок однієї привʼязки ручного запису до пасиву чи дебіторки. */
export interface ManualExpenseLinkSnapshot {
  type: "debt" | "receivable";
  /** Id пасиву / дебіторки, до якої був привʼязаний запис. */
  itemId: string;
  role: LinkedTxMeta["role"];
  amount: number;
  auto?: boolean;
}

function aliasesOf(rawId: string): string[] {
  return linkKeyAliases(manualLinkKey(rawId));
}

function isTouched(item: Linkable, aliases: readonly string[]): boolean {
  return aliases.some(
    (k) => (item.linkedTxIds ?? []).includes(k) || item.txLinks?.[k] != null,
  );
}

/** Знімки привʼязок запису `rawId` у списку пасивів або дебіторок. */
export function collectManualExpenseLinks(
  items: readonly Linkable[],
  type: ManualExpenseLinkSnapshot["type"],
  rawId: string,
): ManualExpenseLinkSnapshot[] {
  const aliases = aliasesOf(rawId);
  const out: ManualExpenseLinkSnapshot[] = [];
  for (const item of items) {
    // Канонічна форма першою: при парі `X` + `manual_X` береться вона.
    const meta = aliases
      .map((k) => item.txLinks?.[k])
      .find((m): m is LinkedTxMeta => m != null);
    if (!meta) continue;
    out.push({
      type,
      itemId: item.id,
      role: meta.role,
      amount: meta.amount,
      ...(meta.auto ? { auto: true } : {}),
    });
  }
  return out;
}

/** Прибрати з пасивів/дебіторок обидві форми ключа запису `rawId`. */
export function stripManualExpenseLinks<T extends Linkable>(
  items: readonly T[],
  rawId: string,
): T[] {
  const aliases = aliasesOf(rawId);
  if (!items.some((item) => isTouched(item, aliases))) return items as T[];
  return items.map((item) => {
    if (!isTouched(item, aliases)) return item;
    const txLinks = { ...(item.txLinks ?? {}) };
    for (const k of aliases) delete txLinks[k];
    return {
      ...item,
      linkedTxIds: (item.linkedTxIds ?? []).filter((x) => !aliases.includes(x)),
      txLinks,
    };
  });
}

/** Повернути знімки привʼязок під канонічним ключем нового запису. */
export function restoreManualExpenseLinks<T extends Linkable>(
  items: readonly T[],
  links: readonly ManualExpenseLinkSnapshot[],
  newRawId: string,
): T[] {
  if (links.length === 0) return items as T[];
  const key = manualLinkKey(newRawId);
  return items.map((item) => {
    const link = links.find((l) => l.itemId === item.id);
    if (!link) return item;
    const linked = item.linkedTxIds ?? [];
    return {
      ...item,
      linkedTxIds: linked.includes(key) ? linked : [...linked, key],
      txLinks: {
        ...(item.txLinks ?? {}),
        [key]: {
          role: link.role,
          amount: link.amount,
          ...(link.auto ? { auto: true } : {}),
        },
      },
    };
  });
}
