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

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({
    success: toastSuccessMock,
    error: toastErrorMock,
    info: vi.fn(),
  }),
}));

import { MemoryBankSection } from "./MemoryBankSection";

beforeEach(() => {
  storedEntries = [];
  writeMemoryEntriesMock.mockReset();
  removeMemoryEntryMock.mockClear();
  emitHubBusMock.mockReset();
  showUndoToastMock.mockReset();
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
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

describe("MemoryBankSection — export", () => {
  it("exports entries to a downloadable JSON blob", () => {
    storedEntries = [ENTRY];
    const createObjectURL = vi.fn(() => "blob:fake");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    render(<MemoryBankSection />);
    fireEvent.click(screen.getByRole("button", { name: "Експорт пам'яті" }));

    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");
    expect(toastSuccessMock).toHaveBeenCalledWith("Експорт завершено");

    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe("MemoryBankSection — import", () => {
  function importFile(content: string) {
    // The empty-state import button is the simplest entry point.
    render(<MemoryBankSection />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File([content], "mem.json", {
      type: "application/json",
    });
    // jsdom's FileReader.readAsText reads File contents; provide text().
    Object.defineProperty(file, "text", {
      value: () => Promise.resolve(content),
    });
    fireEvent.change(input, { target: { files: [file] } });
    return input;
  }

  it("imports a valid array of entries and merges new ones", async () => {
    const entries = [{ id: "n1", fact: "Веган", category: "diet" }];
    importFile(JSON.stringify(entries));

    await vi.waitFor(() => {
      expect(writeMemoryEntriesMock).toHaveBeenCalled();
    });
    await vi.waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith(
        expect.stringContaining("Імпортовано"),
      );
    });
  });

  it("rejects a non-array payload", async () => {
    importFile(JSON.stringify({ not: "an array" }));
    await vi.waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Невалідний формат файлу");
    });
    expect(writeMemoryEntriesMock).not.toHaveBeenCalled();
  });

  it("reports a parse failure on malformed JSON", async () => {
    importFile("{ broken json");
    await vi.waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Не вдалося прочитати файл");
    });
  });
});
