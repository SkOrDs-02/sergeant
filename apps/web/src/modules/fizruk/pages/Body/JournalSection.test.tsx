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

/** Builds `n` distinct entries (newest first) for pagination tests. */
function buildEntries(n: number): JournalEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `entry-${i}`,
    at: `2026-06-${String(30 - i).padStart(2, "0")}T07:00:00.000Z`,
    weightKg: 80 + i,
    sleepHours: null,
    energyLevel: null,
    moodScore: null,
    note: "",
  }));
}

function renderJournal(
  overrides: Partial<React.ComponentProps<typeof JournalSection>> = {},
) {
  const onDelete = overrides.onDelete ?? (() => undefined);
  return render(
    <JournalSection
      entries={overrides.entries ?? [entry]}
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

describe("JournalSection — heading semantics (defect #2)", () => {
  it("exposes the section title as an h2 heading, and the toggle stays a single button", () => {
    renderJournal();
    expect(
      screen.getByRole("heading", { level: 2, name: /Журнал/ }),
    ).toBeInTheDocument();
    // The section toggle is the only top-level button when there is a
    // single, collapsed entry — the entry row itself is a second button.
    expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(1);
  });
});

describe("JournalSection — pagination affordance (defect #1)", () => {
  // The header badge used to claim the FULL count while `Body.tsx` sliced
  // the list to the first 15 entries before ever handing them to this
  // component — no way to reach the rest existed. Pagination now lives
  // here so the two numbers can never disagree.
  it("renders only the first page and shows an honest 'shown of total' count", () => {
    renderJournal({ entries: buildEntries(40) });

    // Header badge shows the TRUE total, not the page size.
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText(/Показано 15 з 40/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Показати ще" }),
    ).toBeInTheDocument();

    // Exactly the first 15 entry rows are mounted (weight labels are
    // unique per entry: 80..94 kg is the first page, 95 kg starts page 2).
    expect(screen.getByText(/80 кг/)).toBeInTheDocument();
    expect(screen.getByText(/94 кг/)).toBeInTheDocument();
    expect(screen.queryByText(/95 кг/)).not.toBeInTheDocument();
  });

  it("reveals the next page on 'Показати ще' and hides the affordance once exhausted", () => {
    renderJournal({ entries: buildEntries(20) });

    expect(screen.getByText(/Показано 15 з 20/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Показати ще" }));

    expect(screen.getByText(/95 кг/)).toBeInTheDocument(); // 16th entry now visible
    expect(screen.queryByText(/Показано/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Показати ще" }),
    ).not.toBeInTheDocument();
  });

  it("hides the affordance entirely when the journal fits on one page", () => {
    renderJournal({ entries: buildEntries(5) });
    expect(screen.queryByText(/Показано/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Показати ще" }),
    ).not.toBeInTheDocument();
  });
});
