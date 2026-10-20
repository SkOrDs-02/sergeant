/**
 * Last validated: 2026-10-01
 * Status: Active
 *
 * Вибір рецептів для списку покупок: «Мої рецепти» (збережені) і
 * «Згенеровані» (щойно запропоновані) двома підписаними групами, кожен рядок
 * - чекбокс. Список складається з усіх позначених разом (рішення власника
 * 2026-10-01). Група - `ChoiceGroup multiple` (мова станів v3.1).
 */
import { pluralUa } from "@sergeant/shared";
import { useId } from "react";
import { Button } from "@shared/components/ui/Button";
import { ChoiceGroup } from "@shared/components/ui/Choice";
import { FIELD_LABEL } from "@shared/components/ui/Input";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";
import {
  SHOPPING_RECIPES_MAX,
  type RecipeOption,
} from "../lib/shoppingRecipes";

const pk = messages.nutrition.shoppingRecipePicker;

interface ShoppingRecipePickerProps {
  saved: readonly RecipeOption[];
  generated: readonly RecipeOption[];
  /** Збережені ще читаються з книги: показуємо це, а не «порожньо». */
  savedBusy?: boolean | undefined;
  /**
   * Книгу збережених не вдалося прочитати: кажемо про це, а не «порожньо»
   * і не мовчки ховаємо групу «Мої рецепти».
   */
  savedError?: boolean | undefined;
  selectedKeys: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  disabled?: boolean | undefined;
}

function ingredientsLabel(count: number): string {
  if (count === 0) return pk.noIngredients;
  return `${count} ${pluralUa(count, {
    one: pk.ingredientsOne,
    few: pk.ingredientsFew,
    many: pk.ingredientsMany,
  })}`;
}

function Group({
  title,
  options,
  selectedKeys,
  atLimit,
  disabled,
  onToggle,
}: {
  title: string;
  options: readonly RecipeOption[];
  selectedKeys: ReadonlySet<string>;
  atLimit: boolean;
  disabled: boolean;
  onToggle: (key: string) => void;
}) {
  const titleId = useId();
  if (options.length === 0) return null;
  return (
    <div>
      <div id={titleId} className={cn(FIELD_LABEL, "pt-3 pb-1")}>
        {title}
      </div>
      <ChoiceGroup
        multiple
        variant="rows"
        ariaLabelledBy={titleId}
        className="border-t border-line"
        value={options.filter((o) => selectedKeys.has(o.key)).map((o) => o.key)}
        onChange={(next) => {
          const changed = options.find(
            (o) => next.includes(o.key) !== selectedKeys.has(o.key),
          );
          if (changed) onToggle(changed.key);
        }}
        items={options.map((o) => ({
          value: o.key,
          // `min-w-0` + `truncate`: довга назва рецепта не розпирає картку.
          label: (
            <span className="block truncate text-style-body font-semibold">
              {o.title}
            </span>
          ),
          description: (
            <span className="block truncate">
              {ingredientsLabel(o.ingredientCount)}
            </span>
          ),
          // Стеля запиту: понад неї сервер відповів би 400, тож зайві
          // рядки не вибираються, а знятий вибір повертає їх назад.
          disabled: disabled || (atLimit && !selectedKeys.has(o.key)),
        }))}
      />
    </div>
  );
}

export function ShoppingRecipePicker({
  saved,
  generated,
  savedBusy = false,
  savedError = false,
  selectedKeys,
  onToggle,
  onSelectAll,
  onClear,
  disabled = false,
}: ShoppingRecipePickerProps) {
  const total = saved.length + generated.length;
  const selectedCount = [...saved, ...generated].filter((o) =>
    selectedKeys.has(o.key),
  ).length;
  const atLimit = selectedCount >= SHOPPING_RECIPES_MAX;
  // «Обрати всі» бере не більше стелі запиту, тож «все» - це і всі рядки, і
  // повна стеля, що настане раніше.
  const allSelected = selectedCount >= Math.min(total, SHOPPING_RECIPES_MAX);

  if (total === 0) {
    if (savedError && !savedBusy) {
      return (
        <p
          className="text-style-caption text-danger-strong text-center"
          role="alert"
        >
          {pk.savedError}
        </p>
      );
    }
    return (
      <div className="text-style-caption text-muted text-center">
        {savedBusy ? pk.savedLoading : pk.emptyHint}
      </div>
    );
  }

  return (
    <div className="border-t border-line" aria-label={pk.listAria} role="group">
      <div className="py-1 flex items-center justify-between gap-2">
        <span className="text-style-caption text-muted tabular-nums">
          {pk.checkedLabel} {selectedCount} {pk.selectedOf} {total}
        </span>
        <div className="flex flex-wrap justify-end gap-1">
          {!allSelected && (
            <Button
              type="button"
              variant="text"
              disabled={disabled}
              onClick={onSelectAll}
            >
              {pk.selectAll}
            </Button>
          )}
          {selectedCount > 0 && (
            <Button
              type="button"
              variant="text"
              disabled={disabled}
              onClick={onClear}
            >
              {pk.clearSelection}
            </Button>
          )}
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto">
        <Group
          title={pk.groupSaved}
          options={saved}
          selectedKeys={selectedKeys}
          atLimit={atLimit}
          disabled={disabled}
          onToggle={onToggle}
        />
        <Group
          title={pk.groupGenerated}
          options={generated}
          selectedKeys={selectedKeys}
          atLimit={atLimit}
          disabled={disabled}
          onToggle={onToggle}
        />
        {savedBusy && (
          <div className="py-2 text-style-caption text-muted">
            {pk.savedLoading}
          </div>
        )}
      </div>
      {atLimit && (
        <div className="py-1.5 text-style-caption text-muted border-t border-line">
          {pk.maxHint}
        </div>
      )}
    </div>
  );
}
