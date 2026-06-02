import { useRef } from "react";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";

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
  catSpends,
}: TransactionFiltersProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);

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

  // Roving-tabindex anchor: the selected pill owns the single Tab stop. If
  // the active filter isn't a rendered pill (e.g. a category whose spend
  // dropped to 0 and fell out of `catSpends`), fall back to the first pill
  // ("all") so the toolbar always has exactly one `tabindex={0}`.
  const activeId = filters.some((f) => f.id === filter)
    ? filter
    : (filters[0]?.id ?? "all");

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    const btns = Array.from(
      toolbarRef.current?.querySelectorAll<HTMLButtonElement>(
        "button[data-pill]",
      ) ?? [],
    );
    if (btns.length === 0) return;
    const cur = btns.findIndex((b) => b === document.activeElement);
    let next = cur;
    if (e.key === "ArrowRight") next = cur < 0 ? 0 : (cur + 1) % btns.length;
    else if (e.key === "ArrowLeft")
      next = cur < 0 ? btns.length - 1 : (cur - 1 + btns.length) % btns.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = btns.length - 1;
    e.preventDefault();
    btns[next]?.focus();
  };

  return (
    <div data-no-swipe className="-mx-3 px-3 overflow-x-auto no-scrollbar">
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label={messages.finyk.transactionsFilterLabel}
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className="flex gap-1 whitespace-nowrap"
      >
        {filters.map((f) => (
          <button
            key={f.id}
            data-pill
            data-compact
            type="button"
            onClick={() => onChangeFilter(f.id)}
            aria-pressed={filter === f.id}
            tabIndex={f.id === activeId ? 0 : -1}
            className={cn(
              // Audit 05 F12: keep the compact `h-7` visual on fine
              // pointers (mouse) but extend the touch-target floor on
              // coarse pointers (mobile finger-tap) to the WCAG 2.5.5 ≥44
              // px contract via `pointer-coarse:min-h-[44px]`. The pill
              // outline stays 28px on desktop; the hit area only grows
              // where it actually matters.
              "shrink-0 inline-flex items-center h-7 px-3 text-style-caption font-medium rounded-full border transition-colors",
              "pointer-coarse:min-h-[44px]",
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
