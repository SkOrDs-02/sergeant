/**
 * Last validated: 2026-10-01
 * Status: Active
 *
 * Мутації правил «Завжди так для цього магазину» (рішення власника
 * 2026-10-01). Тонка обгортка над чистими функціями
 * `@sergeant/finyk-domain/lib/merchantRules`: хук лише тримає слот і дає
 * замикання, які повертають достатньо, щоб показати «Скасувати».
 *
 * Запис іде тим самим шляхом, що решта налаштувань: слот → діф
 * (`useFinykDualWriteSync`) → `finyk_prefs.prefs_json` → op-log. Окремого
 * persist тут немає навмисно.
 */
import { useCallback, useMemo } from "react";
import {
  applyMerchantRule,
  buildMerchantRuleIndex,
  removeMerchantRule,
  restoreMerchantRules,
  revertMerchantRuleChange,
  type MerchantRule,
  type MerchantRuleChange,
  type MerchantRuleIndex,
  type MerchantRuleInput,
} from "@sergeant/finyk-domain/lib/merchantRules";
import type { FinykStorageSlots } from "./useFinykStorageSlots";

export interface FinykMerchantRulesApi {
  merchantRules: readonly MerchantRule[];
  /** Індекс для резолвера; нова ідентичність лише коли змінився список. */
  merchantRuleIndex: MerchantRuleIndex;
  /**
   * Створює або оновлює правило. `null`, якщо його не можна створити (порожній
   * ключ, «Внутрішній переказ», ліміт). Повернене значення віддають у
   * {@link FinykMerchantRulesApi.undoMerchantRule}.
   */
  upsertMerchantRule: (input: MerchantRuleInput) => MerchantRuleChange | null;
  undoMerchantRule: (change: MerchantRuleChange) => void;
  /** Видаляє правило (разом із дублями за ключем); повертає видалене для undo. */
  deleteMerchantRule: (id: string) => MerchantRule[];
  restoreMerchantRules: (rules: readonly MerchantRule[]) => void;
}

export function useFinykMerchantRules(
  slots: Pick<FinykStorageSlots, "merchantRules" | "setMerchantRules">,
): FinykMerchantRulesApi {
  const { merchantRules, setMerchantRules } = slots;

  const merchantRuleIndex = useMemo(
    () => buildMerchantRuleIndex(merchantRules),
    [merchantRules],
  );

  const upsertMerchantRule = useCallback(
    (input: MerchantRuleInput): MerchantRuleChange | null => {
      // Результат потрібен викликачу синхронно (для тосту), а функціональний
      // `setState` виконується відкладено — тож рахуємо від списку з цього
      // рендера й віддаємо готовий новий список. Два виклики підряд в одному
      // рендері неможливі: кнопка «Завжди так» зникає після першого тапу.
      const change = applyMerchantRule(merchantRules, input, {
        // eslint-disable-next-line no-restricted-syntax -- UTC wall-clock updatedAt-style timestamp for LWW ordering, not a Kyiv day-boundary computation.
        now: new Date().toISOString(),
        newId: () => `mr_${Date.now().toString(36)}_${crypto.randomUUID()}`,
      });
      if (!change) return null;
      setMerchantRules(change.list);
      return change;
    },
    [merchantRules, setMerchantRules],
  );

  const undoMerchantRule = useCallback(
    (change: MerchantRuleChange) => {
      setMerchantRules((prev) => revertMerchantRuleChange(prev, change));
    },
    [setMerchantRules],
  );

  const deleteMerchantRule = useCallback(
    (id: string): MerchantRule[] => {
      const { list, removed } = removeMerchantRule(merchantRules, id);
      if (removed.length > 0) setMerchantRules(list);
      return removed;
    },
    [merchantRules, setMerchantRules],
  );

  const restore = useCallback(
    (rules: readonly MerchantRule[]) => {
      setMerchantRules((prev) => restoreMerchantRules(prev, rules));
    },
    [setMerchantRules],
  );

  return {
    merchantRules,
    merchantRuleIndex,
    upsertMerchantRule,
    undoMerchantRule,
    deleteMerchantRule,
    restoreMerchantRules: restore,
  };
}
