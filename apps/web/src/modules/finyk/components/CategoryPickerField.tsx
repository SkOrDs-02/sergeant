/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * Компактний пошуковий вибір категорії для ручних і банківських операцій.
 *
 * Дві колонки замість одного стовпця (рішення власника 2026-09-11, за
 * підтвердженим мокапом): повнорядкові чипи з довгими підписами кастомних
 * категорій розтягували аркуш удвічі довше, ніж потрібно, — прокрутка до
 * потрібного пункту ставала окремою проблемою. Пошук показується завжди
 * (без порогу за довжиною списку): і на короткому, і на довгому списку
 * дешевше набрати кілька літер, ніж гортати сітку.
 */
import { useMemo, useState } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { Input } from "@shared/components/ui/Input";
import { Sheet } from "@shared/components/ui/Sheet";
import { Label } from "@shared/components/ui/FormField";
import { cn } from "@shared/lib/ui/cn";
import { catChipVars } from "../lib/categoryChip";
import { stripLeadingEmoji } from "./txRowHelpers";

export interface CategoryPickerOption {
  id: string;
  label: string;
}

interface CategoryPickerFieldProps {
  id?: string;
  label?: string;
  categories: readonly CategoryPickerOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  error?: boolean;
  describedBy?: string | undefined;
  placeholder?: string;
  /** Реальні персональні частоти; порядок масиву є порядком показу. */
  frequentIds?: readonly string[];
  onReset?: (() => void) | undefined;
  resetLabel?: string | undefined;
}

const copy = {
  all: "Усі категорії",
  frequent: "Часті",
  noResults: "Нічого не знайдено",
  placeholder: "Обери категорію",
  search: "Знайти категорію",
  title: "Категорія",
} as const;

export function CategoryPickerField({
  id,
  label,
  categories,
  selectedId,
  onSelect,
  error = false,
  describedBy,
  placeholder = copy.placeholder,
  frequentIds = [],
  onReset,
  resetLabel,
}: CategoryPickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = categories.find((category) => category.id === selectedId);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("uk-UA");
    if (!needle) return categories;
    return categories.filter((category) =>
      stripLeadingEmoji(category.label)
        .toLocaleLowerCase("uk-UA")
        .includes(needle),
    );
  }, [categories, query]);
  const frequent = useMemo(() => {
    if (query || frequentIds.length === 0) return [];
    const byId = new Map(categories.map((category) => [category.id, category]));
    return frequentIds
      .map((id) => byId.get(id))
      .filter((category): category is CategoryPickerOption =>
        Boolean(category),
      );
  }, [categories, frequentIds, query]);
  const frequentSet = useMemo(
    () => new Set(frequent.map((category) => category.id)),
    [frequent],
  );
  const remaining = query
    ? filtered
    : filtered.filter((category) => !frequentSet.has(category.id));

  const choose = (nextId: string) => {
    onSelect(nextId);
    setOpen(false);
    setQuery("");
  };

  const reset = () => {
    onReset?.();
    setOpen(false);
    setQuery("");
  };

  const renderOption = (category: CategoryPickerOption) => (
    <button
      key={category.id}
      type="button"
      aria-pressed={category.id === selectedId}
      onClick={() => choose(category.id)}
      style={catChipVars(category.id, categories)}
      className={cn(
        "w-full touch-target rounded-xl border px-2.5 py-2.5 text-left",
        "flex items-center justify-between gap-2 transition-colors",
        category.id === selectedId
          ? "cat-chip border-transparent"
          : "border-line hover:bg-panelHi",
      )}
    >
      <span className="inline-flex min-w-0 items-center gap-2 text-style-body">
        <span aria-hidden className="cat-dot h-2 w-2 shrink-0 rounded-full" />
        <span className="truncate">{stripLeadingEmoji(category.label)}</span>
      </span>
      {category.id === selectedId && (
        <Icon name="check" size={16} aria-hidden />
      )}
    </button>
  );

  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}
      <button
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby={describedBy}
        onClick={() => setOpen(true)}
        className={cn(
          "input-focus-finyk w-full min-h-11 rounded-xl border bg-panelHi px-3",
          "flex items-center justify-between gap-3 text-left text-style-body",
          error ? "border-danger" : "border-line",
        )}
      >
        <span className={selected ? "text-text" : "text-subtle"}>
          {selected ? stripLeadingEmoji(selected.label) : placeholder}
        </span>
        <Icon name="chevron-down" size={16} aria-hidden />
      </button>

      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          setQuery("");
        }}
        title={copy.title}
        zIndex={70}
        bodyClassName="space-y-4"
      >
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={copy.search}
          aria-label={copy.search}
          icon={<Icon name="search" size={16} aria-hidden />}
        />
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-style-body text-subtle">
            {copy.noResults}
          </p>
        ) : (
          <div className="space-y-4">
            {frequent.length > 0 && (
              <section className="space-y-2">
                <p className="text-style-caption text-subtle">
                  {copy.frequent}
                </p>
                <div
                  data-testid="category-picker-options"
                  className="grid grid-cols-2 gap-2"
                >
                  {frequent.map(renderOption)}
                </div>
              </section>
            )}
            {remaining.length > 0 && (
              <section className="space-y-2">
                {!query && (
                  <p className="text-style-caption text-subtle">{copy.all}</p>
                )}
                <div
                  data-testid="category-picker-options"
                  className="grid grid-cols-2 gap-2"
                >
                  {remaining.map(renderOption)}
                </div>
              </section>
            )}
          </div>
        )}
        {onReset && resetLabel && (
          <button
            type="button"
            onClick={reset}
            className="touch-target w-full rounded-xl border border-dashed border-line px-3 py-2.5 text-left text-style-body text-subtle transition-colors hover:border-muted hover:text-text"
          >
            <span className="inline-flex items-center gap-2">
              <Icon name="refresh-cw" size={16} aria-hidden />
              {resetLabel}
            </span>
          </button>
        )}
      </Sheet>
    </div>
  );
}
