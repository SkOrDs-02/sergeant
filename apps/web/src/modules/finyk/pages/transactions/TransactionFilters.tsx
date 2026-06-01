import { cn } from "@shared/lib/ui/cn";

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
    ...catSpends.map((c) => {
      // Audit 05 F11: `c.label.split(" ")[0]` returned `string | undefined`
      // under Hard Rule #19 (noUncheckedIndexedAccess) and was implicitly
      // coerced. Categories without a leading emoji (legacy plain-text
      // names) used to produce a leading space. Guard the split result
      // explicitly: when there is no detectable emoji segment, fall back
      // to the raw label so the pill renders cleanly.
      const space = c.label.indexOf(" ");
      const label =
        space > 0
          ? `${c.label.slice(0, space)} ${c.label.slice(space + 1)}`
          : c.label;
      return { id: c.id, label };
    }),
  ];

  return (
    <div data-no-swipe className="-mx-3 px-3 overflow-x-auto no-scrollbar">
      <div className="flex gap-1 whitespace-nowrap">
        {filters.map((f) => (
          <button
            key={f.id}
            data-compact
            onClick={() => onChangeFilter(f.id)}
            aria-pressed={filter === f.id}
            className={cn(
              "shrink-0 inline-flex items-center h-7 px-3 text-style-caption font-medium rounded-full border transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-finyk/50 focus-visible:ring-offset-1",
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
