import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import { useLockDraft } from "@shared/hooks/useLockDraft";
import { FORM_DRAFT_IDS } from "@shared/lib/storage/formDrafts";
import type { ManualExpenseKind } from "@sergeant/finyk-domain/domain/transactions";
import type { ManualAccount } from "./ManualExpenseAccountSection";

/**
 * Чернетка ручної витрати під замком застосунку (sec-13, priv-15, рішення
 * власника 2026-10-22). Механізм: `@shared/lib/storage/formDrafts`. Зберігається
 * лише нова витрата з введеним описом чи сумою; редагування запису береться з
 * журналу, а не з чернетки.
 */
export interface ManualExpenseLockDraft {
  description: string;
  amount: string;
  category: string;
  date: string;
  kind: ManualExpenseKind;
  account: ManualAccount;
  tags: readonly string[];
}

interface Options {
  values: ManualExpenseLockDraft;
  restore: {
    reset: (v: {
      description: string;
      amount: string;
      category: string;
      date: string;
    }) => void;
    setKind: (v: ManualExpenseKind) => void;
    setAccount: (v: ManualAccount) => void;
    setDraftTags: Dispatch<SetStateAction<readonly string[]>>;
  };
}

export function useManualExpenseLockDraft(
  enabled: boolean,
  open: boolean,
  isEditing: boolean,
  { values, restore }: Options,
): void {
  const { description, amount, category, date, kind, account, tags } = values;
  const dirty = description.trim() !== "" || amount !== "";
  const snapshot = useMemo(
    () =>
      open && !isEditing && dirty
        ? { description, amount, category, date, kind, account, tags }
        : null,
    [
      open,
      isEditing,
      dirty,
      description,
      amount,
      category,
      date,
      kind,
      account,
      tags,
    ],
  );
  const { take } = useLockDraft<ManualExpenseLockDraft>(
    enabled ? FORM_DRAFT_IDS.finykManualExpense : null,
    snapshot,
  );

  // Ініціалізація аркуша йде в ефекті `ManualExpenseSheet` (мікротаск), а цей
  // хук викликається ПІСЛЯ нього, тож його мікротаск виконується пізніше й
  // перекриває дефолти чернеткою.
  useEffect(() => {
    if (!open || isEditing) return;
    const restored = take();
    if (!restored) return;
    void Promise.resolve().then(() => {
      restore.setKind(restored.kind);
      restore.setAccount(restored.account);
      restore.setDraftTags(restored.tags);
      restore.reset({
        description: restored.description,
        amount: restored.amount,
        category: restored.category,
        date: restored.date,
      });
    });
    // Відновлення рівно раз на відкриття; сеттери стабільні.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEditing]);
}
