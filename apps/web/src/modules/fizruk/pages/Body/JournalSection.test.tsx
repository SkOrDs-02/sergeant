// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

import { JournalSection } from "./JournalSection";
import {
  JOURNAL_ENTRY_OPEN_PREFIX,
  JOURNAL_OPEN_STORAGE_KEY,
  type JournalEntry,
} from "./storage";

const entry: JournalEntry = {
  id: "entry-1",
  at: "2026-06-22T07:00:00.000Z",
  weightKg: 82.5,
  sleepHours: 7.5,
  energyLevel: 4,
  moodScore: 5,
  note: "Після легкого тренування",
};

function renderJournal(
  overrides: Partial<React.ComponentProps<typeof JournalSection>> = {},
) {
  const onDelete = overrides.onDelete ?? (() => undefined);
  return render(
    <JournalSection
      entries={overrides.entries ?? [entry]}
      totalCount={overrides.totalCount ?? 1}
      onDelete={onDelete}
    />,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("JournalSection", () => {
  it("renders open by default with entries and total count", () => {
    renderJournal();

    expect(screen.getByRole("button", { name: /Журнал/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText(/82.5 кг/)).toBeInTheDocument();
    expect(screen.getByText(/7.5 год/)).toBeInTheDocument();
  });

  it("collapses the whole section and persists the section state", () => {
    renderJournal();

    fireEvent.click(screen.getByRole("button", { name: /Журнал/i }));

    expect(localStorage.getItem(JOURNAL_OPEN_STORAGE_KEY)).toBe("0");
    expect(screen.queryByText(/82.5 кг/)).not.toBeInTheDocument();
  });

  it("syncs section open state from a storage event", () => {
    localStorage.setItem(JOURNAL_OPEN_STORAGE_KEY, "0");
    renderJournal();
    expect(screen.queryByText(/82.5 кг/)).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: JOURNAL_OPEN_STORAGE_KEY,
          newValue: "1",
        }),
      );
    });

    expect(screen.getByText(/82.5 кг/)).toBeInTheDocument();
  });

  it("expands an entry to show energy, mood, note, and calls delete", () => {
    const onDelete = vi.fn();
    renderJournal({ onDelete });

    fireEvent.click(screen.getByRole("button", { name: /82.5 кг/ }));
    expect(localStorage.getItem(`${JOURNAL_ENTRY_OPEN_PREFIX}entry-1`)).toBe(
      "1",
    );
    expect(screen.getByText(/Енергія/i)).toBeInTheDocument();
    expect(screen.getByText("4/5")).toBeInTheDocument();
    expect(screen.getByText(/Настрій/i)).toBeInTheDocument();
    expect(screen.getByText("5/5")).toBeInTheDocument();
    expect(screen.getByText("Після легкого тренування")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Видалити запис" }));
    expect(onDelete).toHaveBeenCalledWith("entry-1");
  });

  it("opens an entry from persisted state without a collapsed summary", () => {
    localStorage.setItem(`${JOURNAL_ENTRY_OPEN_PREFIX}entry-1`, "1");

    renderJournal();

    expect(screen.queryByText(/· 82.5 кг/)).not.toBeInTheDocument();
    expect(screen.getByText(/Вага/i)).toBeInTheDocument();
  });
});
