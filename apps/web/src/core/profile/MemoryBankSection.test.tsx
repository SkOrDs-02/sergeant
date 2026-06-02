// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { MemoryEntry } from "./types";

/**
 * Regression tests for `MemoryBankSection` (previously zero coverage).
 * The `./memoryBank` storage layer is mocked so the component's wiring —
 * render of grouped entries, delete + undo, and the "open chat" prompts —
 * is exercised without touching real localStorage internals.
 */

const ENTRY: MemoryEntry = {
  id: "m1",
  fact: "Алергія на арахіс",
  category: "health",
} as MemoryEntry;

let storedEntries: MemoryEntry[] = [];

const writeMemoryEntriesMock = vi.fn();
const removeMemoryEntryMock = vi.fn((entries: MemoryEntry[], id: string) => ({
  entries: entries.filter((e) => e.id !== id),
}));

vi.mock("./memoryBank", () => ({
  readMemoryEntries: () => storedEntries,
  writeMemoryEntries: (next: MemoryEntry[]) => writeMemoryEntriesMock(next),
  removeMemoryEntry: (entries: MemoryEntry[], id: string) =>
    removeMemoryEntryMock(entries, id),
  groupMemoryEntries: (entries: MemoryEntry[]) =>
    entries.length ? { health: entries } : {},
  memoryStorageSize: () => "0,1 КБ",
  normalizeMemoryEntry: (x: unknown) => x as MemoryEntry,
  CATEGORY_META: { health: { label: "Здоров'я", emoji: "🩺" } },
  MEMORY_ONBOARDING_PROMPT: "ONBOARDING_PROMPT",
}));

const emitHubBusMock = vi.fn();
vi.mock("@shared/lib/modules/hubBus", () => ({
  emitHubBus: (...args: unknown[]) => emitHubBusMock(...args),
}));

const showUndoToastMock = vi.fn();
vi.mock("@shared/lib/ui/undoToast", () => ({
  showUndoToast: (...args: unknown[]) => showUndoToastMock(...args),
}));

vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { MemoryBankSection } from "./MemoryBankSection";

beforeEach(() => {
  storedEntries = [];
  writeMemoryEntriesMock.mockReset();
  removeMemoryEntryMock.mockClear();
  emitHubBusMock.mockReset();
  showUndoToastMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("MemoryBankSection — empty state", () => {
  it("shows the empty placeholder and opens chat with the onboarding prompt", () => {
    storedEntries = [];
    render(<MemoryBankSection />);

    expect(screen.getByText("Банк пам'яті порожній")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Заповнити профіль/ }));

    expect(emitHubBusMock).toHaveBeenCalledWith("openChat", {
      message: "ONBOARDING_PROMPT",
    });
  });
});

describe("MemoryBankSection — populated", () => {
  it("renders the stored fact under its category", () => {
    storedEntries = [ENTRY];
    render(<MemoryBankSection />);

    expect(screen.getByText("Алергія на арахіс")).toBeTruthy();
    expect(screen.getByText("Здоров'я")).toBeTruthy();
  });

  it("delete removes the entry (writeMemoryEntries) and offers undo", () => {
    storedEntries = [ENTRY];
    render(<MemoryBankSection />);

    fireEvent.click(
      screen.getByRole("button", { name: "Видалити: Алергія на арахіс" }),
    );

    expect(removeMemoryEntryMock).toHaveBeenCalledWith([ENTRY], "m1");
    expect(writeMemoryEntriesMock).toHaveBeenCalledWith([]);
    expect(showUndoToastMock).toHaveBeenCalled();
  });

  it("'Додати інфо' opens chat with the add-info prompt (not the onboarding one)", () => {
    storedEntries = [ENTRY];
    render(<MemoryBankSection />);

    fireEvent.click(screen.getByRole("button", { name: /Додати інфо/ }));

    expect(emitHubBusMock).toHaveBeenCalledTimes(1);
    const [event, payload] = emitHubBusMock.mock.calls[0]!;
    expect(event).toBe("openChat");
    expect((payload as { message: string }).message).not.toBe(
      "ONBOARDING_PROMPT",
    );
  });
});
