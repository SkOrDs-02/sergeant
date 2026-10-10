import { Button } from "@shared/components/ui/Button";
import { Segmented } from "@shared/components/ui/Segmented";
import { messages } from "@shared/i18n/uk";

export interface TransactionFiltersProps {
  filter: string;
  onChangeFilter: (id: string) => void;
  hasCreditAccounts: boolean;
  /**
   * Підпис активної категорії, коли фільтр прийшов дрил-дауном із
   * Аналітики. `null`, коли активний один із базових фільтрів.
   */
  activeCategoryLabel?: string | null;
}

/**
 * Smuga фільтрів операцій: Всі / Витрати / Доходи / Кредитна. Stateless —
 * активний id і обробник приходять із шелу сторінки.
 *
 * AI-CONTEXT: чипів категорій тут БІЛЬШЕ НЕМА, і це не спрощення, а
 * рішення власника 2026-08-06 (матеріал — `mockups/product/filters.html`).
 * Їх було 4 базові плюс по чипу на кожну категорію з витратами, тобто
 * список без верхньої межі, який доводилось горизонтально скролити —
 * атрактор №7 анти-слоп-стратегії §3.2.
 *
 * Прибрано не заради вигляду, а тому, що та сама робота вже робиться
 * краще в іншому місці: кільце категорій на Аналітиці показує і назву, і
 * суму, і частку. Доти воно було глухим кутом — клік не робив нічого.
 * Тепер клік веде СЮДИ з уже застосованим фільтром, а тут лишається
 * знімний чип, який каже, чому список звужений.
 *
 * Тобто число й список більше не дублюють одне одного, а зʼєднані.
 *
 * AI-CONTEXT: під смугою НЕМА і слайдера «Сума» (`TransactionAmountFilter`,
 * ex-UI-16) — прибрано на прохання власника 2026-08-17. Причина не в
 * оформленні: шкала слайдера бралась як `[0, max]` місяця, а розподіл сум
 * різко скошений — одна зарплата чи переказ на 40 000 ₴ ставили стелю, і
 * весь щоденний діапазон (50–500 ₴) стискався в перші ~1% доріжки. Крок
 * при цьому — 1% прольоту, тобто ~400 ₴: контроль фізично не міг
 * відрізнити 50 ₴ від 300 ₴ у типовому місяці. Плюс він стояв «порожнім»
 * (обидва повзунки на краях = фільтр вимкнений) на кожному вході в
 * сторінку — постійний хром заради рідкісної дії.
 *
 * Знадобиться звуження за сумою — це ввід «від / до» або пресети
 * («понад 1000 ₴»), а не діапазонний повзунок по скошеній шкалі.
 *
 * A11y (page-audit-05 F13): the strip is a WAI-ARIA **toolbar** — a single
 * Tab stop with roving `tabindex` (only the active pill is `tabindex={0}`),
 * and ←/→/Home/End move focus between pills. `role="toolbar"` (not
 * `tablist`) because these pills filter one list in place, they don't switch
 * tab panels. Selection state stays on `aria-pressed` (toggle buttons).
 */
export function TransactionFilters({
  filter,
  onChangeFilter,
  hasCreditAccounts,
  activeCategoryLabel,
}: TransactionFiltersProps) {
  const filters = [
    { id: "all", label: "Всі" },
    { id: "expense", label: "Витрати" },
    { id: "income", label: "Надходження" },
    ...(hasCreditAccounts ? [{ id: "credit", label: "Кредитна" }] : []),
  ];

  return (
    <div
      data-no-swipe
      className="-mx-3 px-3 overflow-x-auto no-scrollbar [touch-action:pan-x_pan-y]"
    >
      <div className="flex items-center gap-1 whitespace-nowrap">
        <Segmented
          semantics="filter"
          ariaLabel={messages.finyk.transactionsFilterLabel}
          items={filters.map((item) => ({ value: item.id, label: item.label }))}
          value={filter}
          onChange={onChangeFilter}
          className="flex-nowrap shrink-0"
        />
        {activeCategoryLabel != null && (
          /*
            AI-CONTEXT: єдиний носій інформації про те, ЧОМУ список
            звужений, коли фільтр прийшов з Аналітики. Без нього людина
            бачила б неповний список без жодного пояснення — саме цей
            розрив і був у коді доти, бо категорійний фільтр існував
            пропом, але ніде не показувався.

            Це не пігулка тулбара: вона не бере участі в roving-tabindex і
            не має `aria-pressed`, бо це не перемикач стану, а дія
            «прибрати звуження». Звідси `×` і власна Tab-зупинка.
          */
          <Button
            size="xs"
            variant="outline"
            onClick={() => onChangeFilter("all")}
            className="shrink-0"
          >
            {activeCategoryLabel}
            <span aria-hidden>×</span>
            <span className="sr-only">
              {messages.finyk.clearCategoryFilter}
            </span>
          </Button>
        )}
      </div>
    </div>
  );
}
