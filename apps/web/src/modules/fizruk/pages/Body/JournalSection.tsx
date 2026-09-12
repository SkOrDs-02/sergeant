import { useCallback, useEffect, useState } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { Button } from "@shared/components/ui/Button";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
import { JournalEntryCard } from "./JournalEntryCard";
import {
  JOURNAL_OPEN_STORAGE_KEY,
  readPersistedOpen,
  writePersistedOpen,
} from "./storage";
import type { JournalEntry } from "./storage";

/**
 * Entries rendered before the «Показати ще» affordance kicks in
 * (defect #1 — the header badge used to claim the full count while the
 * body silently truncated to a fixed page with no way to reach the rest;
 * see `Exercise.tsx`'s `HISTORY_PAGE_SIZE` for the same pattern).
 */
const PAGE_SIZE = 15;

export function JournalSection({
  entries,
  onDelete,
}: {
  /**
   * Full journal, newest first. NOT pre-sliced by the caller — pagination
   * lives inside this component so the header count and the rendered list
   * can never disagree (defect #1).
   */
  entries: readonly JournalEntry[];
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState<boolean>(() =>
    readPersistedOpen(JOURNAL_OPEN_STORAGE_KEY, true),
  );
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const contentId = "fizruk-body-journal-content";
  const totalCount = entries.length;
  const visibleEntries = entries.slice(0, visibleCount);

  // Sync open-state across tabs via the `storage` event so both tabs
  // reflect the same collapsed/expanded state without a page reload.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== JOURNAL_OPEN_STORAGE_KEY) return;
      setOpen(e.newValue === "1");
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      writePersistedOpen(JOURNAL_OPEN_STORAGE_KEY, next);
      return next;
    });
  }, []);

  return (
    <Card
      as="section"
      radius="lg"
      padding="none"
      aria-label={messages.fizruk.journal.sectionAriaLabel}
    >
      {/* AI-CONTEXT: `<h2>` wraps the WHOLE toggle button (WAI-ARIA
          disclosure/accordion pattern), not the other way around — a
          heading nested inside a native `<button>` loses its heading
          semantics for most AT (defect #2). `contents` drops the h2's own
          box so it doesn't affect the flex layout. */}
      <h2 className="contents">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={contentId}
          className={cn(
            "focus-ring w-full flex items-center gap-3 px-4 py-3 text-left",
            "rounded-2xl transition-colors hover:bg-panelHi/40",
          )}
        >
          <div className="flex-1 min-w-0 flex items-baseline gap-2">
            <SectionHeading
              as="span"
              size="xs"
              className="mb-0!"
              variant="fizruk"
            >
              {messages.fizruk.journal.title}
            </SectionHeading>
            <span className="text-style-caption text-muted tabular-nums">
              {totalCount}
            </span>
          </div>
          <span
            aria-hidden
            className={cn(
              "inline-flex justify-center w-4 text-muted transition-transform shrink-0",
              open ? "rotate-180" : "rotate-0",
            )}
          >
            <Icon name="chevron-down" size="md" />
          </span>
        </button>
      </h2>
      {open && (
        <div id={contentId} className="px-4 pb-4 pt-1">
          <div className="space-y-2">
            {visibleEntries.map((entry) => (
              <JournalEntryCard
                key={entry.id}
                entry={entry}
                onDelete={onDelete}
              />
            ))}
          </div>
          {totalCount > visibleCount && (
            <div className="flex flex-col items-center gap-2 pt-3">
              <p className="text-style-caption text-subtle">
                {messages.fizruk.journal.shownPrefix} {visibleCount}{" "}
                {messages.fizruk.journal.shownOfWord} {totalCount}
              </p>
              <Button
                variant="fizruk-soft"
                size="sm"
                onClick={() =>
                  setVisibleCount((c) => Math.min(c + PAGE_SIZE, totalCount))
                }
              >
                {messages.fizruk.journal.showMore}
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
