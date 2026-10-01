/**
 * Востаннє перевірено: 2026-10-01
 * Статус: Активний
 *
 * Налаштування → Фінік → «Правила категорій»: список правил «Завжди так для
 * цього магазину» з видаленням (рішення власника 2026-10-01). Створюються
 * правила в аркуші операції; тут їх лише переглядають і прибирають.
 *
 * Прибирання показує 5-секундний тост із поверненням: правило змінює категорію
 * всіх операцій мерчанта, тож помилковий тап мусить мати шлях назад.
 */
import { useMemo } from "react";
import { Button } from "@shared/components/ui/Button";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { Icon } from "@shared/components/ui/Icon";
import { useToast } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n/uk";
import {
  useMerchantRuleActions,
  type MerchantRuleActionsDeps,
} from "@finyk/hooks/useMerchantRuleActions";
import {
  fillRuleCopy,
  merchantRuleCategoryName,
} from "@finyk/lib/merchantRuleCopy";
import {
  buildMerchantRuleIndex,
  type MerchantRule,
} from "@sergeant/finyk-domain/lib/merchantRules";
import { SettingsSubGroup } from "./SettingsPrimitives";

interface FinykMerchantRulesSectionProps {
  rules: readonly MerchantRule[];
  customCategories: readonly unknown[];
  deleteMerchantRule?: MerchantRuleActionsDeps["deleteMerchantRule"];
  restoreMerchantRules?: MerchantRuleActionsDeps["restoreMerchantRules"];
}

export function FinykMerchantRulesSection({
  rules,
  customCategories,
  deleteMerchantRule,
  restoreMerchantRules,
}: FinykMerchantRulesSectionProps) {
  const copy = messages.finyk.merchantRules;
  const toast = useToast();
  const { removeRule } = useMerchantRuleActions({
    deleteMerchantRule,
    restoreMerchantRules,
    customCategories,
    toast,
  });

  // Рядок на мерчанта: дубль від другого пристрою (гонка двох створень) у
  // списку не показуємо — діє лише переможець індексу, а «Прибрати» знімає
  // обидва. Порядок стабільний: за назвою, без залежності від порядку
  // синхронізації між пристроями.
  const sorted = useMemo(
    () =>
      [...buildMerchantRuleIndex(rules).values()].sort((a, b) =>
        a.label.localeCompare(b.label, "uk-UA", { sensitivity: "base" }),
      ),
    [rules],
  );

  return (
    <SettingsSubGroup title={copy.settings.title}>
      <p className="text-style-body text-subtle leading-snug">
        {copy.settings.description}
      </p>
      {sorted.length > 0 ? (
        <ul className="space-y-0 -mx-4" data-testid="merchant-rules-list">
          {sorted.map((rule) => {
            const categoryName = merchantRuleCategoryName(
              rule.kind,
              rule.categoryId,
              customCategories,
            );
            const kindLabel =
              rule.kind === "income"
                ? copy.settings.kindIncome
                : copy.settings.kindExpense;
            return (
              <li
                key={rule.id}
                className="flex items-center justify-between gap-2 px-4 py-2 border-b border-line last:border-0"
              >
                <span className="min-w-0">
                  <span className="block text-style-label truncate">
                    {rule.label}
                  </span>
                  <span className="block text-style-caption text-subtle">
                    {`${kindLabel} · ${categoryName ?? copy.settings.missingCategory}`}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  className="shrink-0"
                  aria-label={fillRuleCopy(copy.settings.removeAria, {
                    merchant: rule.label,
                  })}
                  onClick={() => removeRule(rule)}
                >
                  {copy.settings.remove}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          compact
          module="finyk"
          icon={<Icon name="tag" size="lg" />}
          title={copy.settings.empty.title}
          description={copy.settings.empty.description}
        />
      )}
    </SettingsSubGroup>
  );
}
