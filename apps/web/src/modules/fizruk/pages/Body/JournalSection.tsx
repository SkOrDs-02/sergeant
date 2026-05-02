import { useCallback, useState } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Card } from "@shared/components/ui/Card";
import { cn } from "@shared/lib/cn";
import { JournalEntryCard } from "./JournalEntryCard";
import {
  JOURNAL_OPEN_STORAGE_KEY,
  readPersistedOpen,
  writePersistedOpen,
} from "./storage";
import type { JournalEntry } from "./storage";

export function JournalSection({
  entries,
  totalCount,
  onDelete,
}: {
  entries: readonly JournalEntry[];
  totalCount: number;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState<boolean>(() =>
    readPersistedOpen(JOURNAL_OPEN_STORAGE_KEY, true),
  );
  const contentId = "fizruk-body-journal-content";

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      writePersistedOpen(JOURNAL_OPEN_STORAGE_KEY, next);
      return next;
    });
  }, []);

  return (
    <Card as="section" radius="lg" padding="none" aria-label="Журнал записів">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={contentId}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 text-left",
          "rounded-2xl transition-colors hover:bg-panelHi/40",
        )}
      >
        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          <SectionHeading as="h2" size="sm" className="!mb-0">
            Журнал
          </SectionHeading>
          <span className="text-xs text-muted tabular-nums">{totalCount}</span>
        </div>
        <span
          aria-hidden
          className={cn(
            "inline-block w-4 text-muted transition-transform shrink-0",
            open ? "rotate-180" : "rotate-0",
          )}
        >
          ▾
        </span>
      </button>
      {open && (
        <div id={contentId} className="px-4 pb-4 pt-1">
          <div className="space-y-2">
            {entries.map((entry) => (
              <JournalEntryCard
                key={entry.id}
                entry={entry}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
