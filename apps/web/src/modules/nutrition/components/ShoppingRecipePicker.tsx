/**
 * Last validated: 2026-10-01
 * Status: Active
 *
 * Вибір рецептів для списку покупок: «Мої рецепти» (збережені) і
 * «Згенеровані» (щойно запропоновані) двома підписаними групами, кожен рядок
 * - чекбокс. Список складається з усіх позначених разом (рішення власника
 * 2026-10-01). Рядок - нативний `label` + `input[type=checkbox]` з
 * `touch-target` (той самий патерн, що в `SilpoPantryReplenishSheet`).
 */
import { pluralUa } from "@sergeant/shared";
import { Button } from "@shared/components/ui/Button";
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

function OptionRow({
  option,
  checked,
  disabled,
  onToggle,
}: {
  option: RecipeOption;
  checked: boolean;
  disabled: boolean;
  onToggle: (key: string) => void;
}) {
  return (
    <li>
      <label
        className={cn(
          "flex items-center gap-2.5 px-3 touch-target transition-colors",
          disabled ? "cursor-default opacity-60" : "cursor-pointer",
          !disabled && "hover:bg-panelHi/50",
        )}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={() => onToggle(option.key)}
          className="shrink-0 w-5 h-5 accent-nutrition"
        />
        {/* `min-w-0` на кожній дитині grid: інакше трек тримає
            `min-width: auto` і довга назва рецепта розпирає картку. */}
        <span className="min-w-0 flex-1 grid">
          <span className="min-w-0 text-style-label text-text truncate">
            {option.title}
          </span>
          <span className="min-w-0 text-style-caption text-subtle truncate">
            {ingredientsLabel(option.ingredientCount)}
          </span>
        </span>
      </label>
    </li>
  );
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
  if (options.length === 0) return null;
  return (
    <div role="group" aria-label={title}>
      <div className="px-3 py-1.5 text-style-caption text-muted bg-panel/40 border-b border-line/40">
        {title}
      </div>
      <ul className="divide-y divide-line/30">
        {options.map((o) => {
          const checked = selectedKeys.has(o.key);
          return (
            <OptionRow
              key={o.key}
              option={o}
              checked={checked}
              // Стеля запиту: понад неї сервер відповів би 400, тож зайві
              // рядки не вибираються, а знятий вибір повертає їх назад.
              disabled={disabled || (atLimit && !checked)}
              onToggle={onToggle}
            />
          );
        })}
      </ul>
    </div>
  );
}

export function ShoppingRecipePicker({
  saved,
  generated,
  savedBusy = false,
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
    return (
      <div className="text-style-caption text-muted text-center">
        {savedBusy ? pk.savedLoading : pk.emptyHint}
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border border-line bg-bg/30 overflow-hidden"
      aria-label={pk.listAria}
      role="group"
    >
      <div className="px-3 py-1 flex items-center justify-between gap-2 border-b border-line/40">
        <span className="text-style-caption text-text">
          {pk.selectedLabel} {selectedCount} {pk.selectedOf} {total}
        </span>
        <div className="flex flex-wrap justify-end gap-1">
          {!allSelected && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={onSelectAll}
            >
              {pk.selectAll}
            </Button>
          )}
          {selectedCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
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
          <div className="px-3 py-2 text-style-caption text-muted">
            {pk.savedLoading}
          </div>
        )}
      </div>
      {atLimit && (
        <div className="px-3 py-1.5 text-style-caption text-muted border-t border-line/40">
          {pk.maxHint}
        </div>
      )}
    </div>
  );
}
