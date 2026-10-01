/**
 * Last validated: 2026-10-01
 * Status: Active
 *
 * Дії над правилами «Завжди так для цього магазину» з боку UI: створити з
 * аркуша операції і прибрати правило. Кожна дія показує 5-секундний тост із
 * відкатом (`showUndoToast`): правило міняє категорію ВСІХ операцій мерчанта,
 * тож помилковий тап не можна лишати без шляху назад.
 *
 * Сам запис іде крізь `useStorage` (слот → dual-write → `finyk_prefs`); цей
 * хук лише формулює тексти й викликає мутатори.
 */
import { useCallback } from "react";
import type { ToastApi } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n/uk";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import {
  MERCHANT_RULES_LIMIT,
  merchantKeyOfTransaction,
  merchantRuleKindOf,
  merchantRuleLabelOf,
  type MerchantRule,
  type MerchantRuleChange,
  type MerchantRuleInput,
  type MerchantRuleTxLike,
} from "@sergeant/finyk-domain/lib/merchantRules";
import {
  fillRuleCopy,
  merchantRuleCategoryName,
} from "../lib/merchantRuleCopy";

export interface MerchantRuleActionsDeps {
  upsertMerchantRule?:
    ((input: MerchantRuleInput) => MerchantRuleChange | null) | undefined;
  undoMerchantRule?: ((change: MerchantRuleChange) => void) | undefined;
  deleteMerchantRule?: ((id: string) => MerchantRule[]) | undefined;
  restoreMerchantRules?: ((rules: readonly MerchantRule[]) => void) | undefined;
  customCategories?: readonly unknown[] | undefined;
  toast: ToastApi;
}

export interface MerchantRuleActions {
  /** Робить із категорії операції правило мерчанта; `false`, якщо правило не створено. */
  createRule: (transaction: MerchantRuleTxLike, categoryId: string) => boolean;
  /** Прибирає правило з можливістю повернути. */
  removeRule: (rule: MerchantRule) => void;
}

export function useMerchantRuleActions({
  upsertMerchantRule,
  undoMerchantRule,
  deleteMerchantRule,
  restoreMerchantRules,
  customCategories = [],
  toast,
}: MerchantRuleActionsDeps): MerchantRuleActions {
  const copy = messages.finyk.merchantRules;

  const createRule = useCallback(
    (transaction: MerchantRuleTxLike, categoryId: string): boolean => {
      const kind = merchantRuleKindOf(transaction);
      const merchantKey = merchantKeyOfTransaction(transaction);
      if (!upsertMerchantRule || !kind || !merchantKey) return false;
      const label = merchantRuleLabelOf(transaction);
      const change = upsertMerchantRule({
        kind,
        merchantKey,
        categoryId,
        label,
      });
      if (!change) {
        // Порожній ключ і «Внутрішній переказ» аркуш не пропонує, тож
        // відмова тут — майже напевно ліміт кількості правил.
        // `warning`, а не `error`: збою немає, це межа. Що робити далі, каже
        // сама копія (прибрати зайві правила), а дії-повтору тут не буде.
        toast.warning(
          fillRuleCopy(copy.limitReached, { limit: MERCHANT_RULES_LIMIT }),
        );
        return false;
      }
      const categoryName =
        merchantRuleCategoryName(kind, categoryId, customCategories) ?? "";
      showUndoToast(toast, {
        msg: fillRuleCopy(change.previous ? copy.updated : copy.created, {
          merchant: change.rule.label,
          category: categoryName,
        }),
        undoLabel: copy.undo,
        onUndo: () => undoMerchantRule?.(change),
      });
      return true;
    },
    [upsertMerchantRule, undoMerchantRule, customCategories, toast, copy],
  );

  const removeRule = useCallback(
    (rule: MerchantRule) => {
      if (!deleteMerchantRule) return;
      const removed = deleteMerchantRule(rule.id);
      if (removed.length === 0) return;
      showUndoToast(toast, {
        msg: fillRuleCopy(copy.removed, { merchant: rule.label }),
        undoLabel: copy.restore,
        onUndo: () => restoreMerchantRules?.(removed),
      });
    },
    [deleteMerchantRule, restoreMerchantRules, toast, copy],
  );

  return { createRule, removeRule };
}
