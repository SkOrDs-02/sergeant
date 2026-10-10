/**
 * Last validated: 2026-10-01
 * Status: Active
 *
 * Блок «Завжди так для магазину» в аркуші банківської операції (рішення
 * власника 2026-10-01). Людина щойно змінила категорію ОДНІЄЇ операції, і
 * тут вона одним тапом робить із цього правило для мерчанта: минулі й нові
 * операції з тим самим магазином підуть у ту саму категорію.
 *
 * Два стани, взаємовиключні:
 *   - пропозиція: на операції є явний override, а правила для цього мерчанта
 *     або нема, або воно веде в іншу категорію (тоді кнопка «Оновити»);
 *   - діюче правило: категорію операції дає саме воно (override нема або
 *     збігається з ним) — тоді підпис «Діє правило» і «Прибрати правило».
 *
 * Не показується, коли в описі нема літер (нема що запамʼятовувати), для
 * «Внутрішнього переказу» (правило на нього заборонене, див. `merchantRules.ts`)
 * і поки аркуш не отримав колбеків.
 */
import { Button } from "@shared/components/ui/Button";
import { messages } from "@shared/i18n/uk";
import { INTERNAL_TRANSFER_ID } from "@sergeant/finyk-domain/constants";
import {
  merchantKeyOfTransaction,
  merchantRuleLabelOf,
  type MerchantRule,
} from "@sergeant/finyk-domain/lib/merchantRules";
import {
  fillRuleCopy,
  merchantRuleCategoryName,
  shortMerchantLabel,
} from "../lib/merchantRuleCopy";

interface MerchantRuleOfferProps {
  transaction: {
    description?: string | null | undefined;
    amount?: number | undefined;
  };
  isIncome: boolean;
  /** Явний вибір людини на цій операції; `null`, якщо категорію дає авто/правило. */
  overrideCatId: string | null | undefined;
  /** Правило цього мерчанта (того ж боку витрата/надходження) або `null`. */
  rule: MerchantRule | null;
  customCategories: readonly unknown[];
  onCreate?: ((categoryId: string) => void) | undefined;
  onRemove?: ((rule: MerchantRule) => void) | undefined;
}

export function MerchantRuleOffer({
  transaction,
  isIncome,
  overrideCatId,
  rule,
  customCategories,
  onCreate,
  onRemove,
}: MerchantRuleOfferProps) {
  const copy = messages.finyk.merchantRules;
  if (!merchantKeyOfTransaction(transaction)) return null;
  const kind = isIncome ? "income" : "expense";
  const merchant = shortMerchantLabel(merchantRuleLabelOf(transaction));

  const canOffer =
    onCreate !== undefined &&
    Boolean(overrideCatId) &&
    overrideCatId !== INTERNAL_TRANSFER_ID &&
    (!rule || rule.categoryId !== overrideCatId);

  if (canOffer && overrideCatId) {
    const categoryName = merchantRuleCategoryName(
      kind,
      overrideCatId,
      customCategories,
    );
    // Категорія з override-а не відома каталогу (її щойно видалили): правило
    // на неї не діяло б, тож і пропонувати нічого.
    if (!categoryName) return null;
    return (
      <section
        aria-label={copy.offerAria}
        className="space-y-2 rounded-xl border border-line bg-panel p-3"
        data-testid="merchant-rule-offer"
      >
        <Button
          variant="outline"
          size="md"
          className="w-full"
          onClick={() => onCreate(overrideCatId)}
        >
          {fillRuleCopy(rule ? copy.offerUpdateButton : copy.offerButton, {
            merchant,
          })}
        </Button>
        <p className="text-style-caption text-muted">
          {fillRuleCopy(
            isIncome ? copy.offerHintIncome : copy.offerHintExpense,
            { category: categoryName },
          )}
        </p>
      </section>
    );
  }

  const ruleApplies =
    rule !== null &&
    onRemove !== undefined &&
    (!overrideCatId || overrideCatId === rule.categoryId);
  if (ruleApplies && rule) {
    const categoryName = merchantRuleCategoryName(
      kind,
      rule.categoryId,
      customCategories,
    );
    // Правило, чия категорія зникла, не діє — і блок про «діюче правило»
    // збрехав би. Прибрати його можна зі списку в Налаштуваннях.
    if (!categoryName) return null;
    return (
      <section
        aria-label={fillRuleCopy(copy.activeTitle, { merchant })}
        className="space-y-2 rounded-xl border border-line bg-panel p-3"
        data-testid="merchant-rule-active"
      >
        <div>
          <h3 className="text-style-label text-text">
            {fillRuleCopy(copy.activeTitle, { merchant })}
          </h3>
          <p className="mt-0.5 text-style-caption text-muted">
            {fillRuleCopy(isIncome ? copy.activeHintIncome : copy.activeHint, {
              category: categoryName,
            })}
          </p>
        </div>
        <Button
          variant="ghost"
          size="md"
          className="w-full"
          onClick={() => onRemove(rule)}
        >
          {copy.removeButton}
        </Button>
      </section>
    );
  }

  return null;
}
