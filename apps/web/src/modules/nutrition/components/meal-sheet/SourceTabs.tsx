/**
 * Last validated: 2026-10-13
 * Status: Active
 * Вибір способу — навігаційні дії; після вибору лишається один рядок.
 */
import { useEffect, useRef } from "react";
import { messages } from "@shared/i18n/uk";
import { Button } from "@shared/components/ui/Button";

export type SourceTabId = "search" | "scan" | "photo" | "manual";
export const SOURCE_LABELS: Record<SourceTabId, string> = {
  search: messages.nutrition.addSources.search.label,
  scan: messages.nutrition.addSources.scan.label,
  photo: messages.nutrition.addSources.photo.label,
  manual: messages.nutrition.addSources.manual.label,
};

interface SourceTabsProps {
  active: SourceTabId;
  expanded?: boolean;
  onChange: (id: SourceTabId) => void;
  onExpand?: () => void;
  sources?: readonly SourceTabId[] | undefined;
}

export function SourceTabs({
  active,
  expanded = true,
  onChange,
  onExpand,
  sources = Object.keys(SOURCE_LABELS) as SourceTabId[],
}: SourceTabsProps) {
  const navRef = useRef<HTMLElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const previousExpanded = useRef(expanded);
  useEffect(() => {
    if (previousExpanded.current === expanded) return;
    previousExpanded.current = expanded;
    if (expanded)
      navRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    else changeRef.current?.focus();
  }, [expanded]);
  if (!expanded)
    return (
      <div className="mb-4 flex min-h-[44px] items-center justify-between gap-3 border-b border-line pb-2">
        <span className="text-style-label text-text">
          {SOURCE_LABELS[active]}
        </span>
        <Button
          variant="text"
          ref={changeRef}
          onClick={onExpand}
          aria-label="Змінити спосіб додавання"
        >
          Змінити
        </Button>
      </div>
    );
  return (
    <nav
      ref={navRef}
      aria-label="Спосіб додавання їжі"
      className="mb-4 flex flex-col divide-y divide-line border-y border-line"
    >
      {sources.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className="flex min-h-[44px] items-center justify-between gap-3 py-2 text-left text-style-body text-text focus-ring"
        >
          {SOURCE_LABELS[id]}
        </button>
      ))}
    </nav>
  );
}
