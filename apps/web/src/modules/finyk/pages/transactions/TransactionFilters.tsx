import { cn } from "@shared/lib/cn";

export interface TransactionFiltersProps {
  filter: string;
  onChangeFilter: (id: string) => void;
  hasCreditAccounts: boolean;
  catSpends: ReadonlyArray<{ id: string; label: string }>;
}

/**
 * Horizontal pill strip for the Transactions filter (All / Expense /
 * Income / Credit + per-category chips). Stateless — the active id and
 * change handler come from the page shell so the strip can also be
 * rendered from other surfaces (e.g. analytics drill-down) without
 * forking the markup.
 */
export function TransactionFilters({
  filter,
  onChangeFilter,
  hasCreditAccounts,
  catSpends,
}: TransactionFiltersProps) {
  const filters = [
    { id: "all", label: "Всі" },
    { id: "expense", label: "Витрати" },
    { id: "income", label: "Доходи" },
    ...(hasCreditAccounts ? [{ id: "credit", label: "💳 Кредитна" }] : []),
    ...catSpends.map((c) => ({
      id: c.id,
      // Each category label is rendered as `<emoji> <name>`; splitting on
      // the first space drops the leading symbol so we can re-emit it
      // separately below if a future iteration wants different spacing.
      // The current visual is identical to before — kept the join here so
      // the diff stays minimal.
      label: c.label.split(" ")[0] + " " + c.label.slice(3),
    })),
  ];

  return (
    <div data-no-swipe className="-mx-3 px-3 overflow-x-auto no-scrollbar">
      <div className="flex gap-1 whitespace-nowrap">
        {filters.map((f) => (
          <button
            key={f.id}
            data-compact
            onClick={() => onChangeFilter(f.id)}
            className={cn(
              "shrink-0 inline-flex items-center h-7 px-3 text-style-caption font-medium rounded-full border transition-colors",
              filter === f.id
                ? "bg-primary border-primary text-bg shadow-sm"
                : "bg-panelHi border-line text-text hover:border-muted",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
