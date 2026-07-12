import { useCallback, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
import {
  JOURNAL_ENTRY_OPEN_PREFIX,
  readPersistedOpen,
  writePersistedOpen,
} from "./storage";
import type { JournalEntry } from "./storage";

export function JournalEntryCard({
  entry,
  onDelete,
}: {
  entry: JournalEntry;
  onDelete: (id: string) => void;
}) {
  const storageKey = JOURNAL_ENTRY_OPEN_PREFIX + entry.id;
  const [open, setOpen] = useState<boolean>(() =>
    readPersistedOpen(storageKey, false),
  );
  const contentId = `journal-entry-${entry.id}`;

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      writePersistedOpen(storageKey, next);
      return next;
    });
  }, [storageKey]);

  const dateLabel = new Date(entry.at).toLocaleDateString("uk-UA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  // Collapsed summary shows only weight/sleep — energy and mood are visible
  // in the expanded state, so surfacing them here doubled the same values
  // on screen at once.
  const summaryParts: string[] = [];
  if (entry.weightKg != null) summaryParts.push(`${entry.weightKg} кг`);
  if (entry.sleepHours != null) summaryParts.push(`${entry.sleepHours} год`);
  const summary = summaryParts.join(" · ");

  return (
    <div className="rounded-xl border border-line bg-bg">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={contentId}
          className={cn(
            "flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-left",
            "rounded-xl transition-colors hover:bg-panelHi/40",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "inline-block w-3 text-muted transition-transform shrink-0 text-xs",
              open ? "rotate-180" : "rotate-0",
            )}
          >
            ▾
          </span>
          <span className="text-xs text-subtle shrink-0">{dateLabel}</span>
          {!open && summary && (
            <span className="text-xs text-muted truncate">· {summary}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => onDelete(entry.id)}
          className="touch-target shrink-0 m-1 flex items-center justify-center rounded-xl text-muted hover:text-danger hover:bg-danger/10 transition-colors"
          aria-label={messages.fizruk.journal.deleteEntryAriaLabel}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />
          </svg>
        </button>
      </div>
      {open && (
        <div id={contentId} className="px-3 pb-3 pt-0">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {entry.weightKg != null && (
              <span className="text-xs text-text">
                <span className="text-subtle">
                  {messages.fizruk.journal.weightLabel}
                </span>{" "}
                <span className="font-semibold">
                  {entry.weightKg} {messages.fizruk.kgUnit}
                </span>
              </span>
            )}
            {entry.sleepHours != null && (
              <span className="text-xs text-text">
                <span className="text-subtle">
                  {messages.fizruk.journal.sleepLabel}
                </span>{" "}
                <span className="font-semibold">
                  {entry.sleepHours} {messages.fizruk.hoursUnit}
                </span>
              </span>
            )}
            {entry.energyLevel != null && (
              <span className="text-xs text-text">
                <span className="text-subtle">
                  {messages.fizruk.journal.energyLabel}
                </span>{" "}
                <span className="font-semibold">{entry.energyLevel}/5</span>
              </span>
            )}
            {entry.moodScore != null && (
              <span className="text-xs text-text">
                <span className="text-subtle">
                  {messages.fizruk.journal.moodLabel}
                </span>{" "}
                <span className="font-semibold">{entry.moodScore}/5</span>
              </span>
            )}
          </div>
          {entry.note && (
            <p className="text-xs text-subtle mt-1 italic">{entry.note}</p>
          )}
        </div>
      )}
    </div>
  );
}
