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
  // Підписка на зміни зі сховища — компонент вішає її в `useEffect`.
  subscribeMemoryEntries: () => () => {},
  writeMemoryEntries: (next: MemoryEntry[]) => writeMemoryEntriesMock(next),
  removeMemoryEntry: (entries: MemoryEntry[], id: string) =>
    removeMemoryEntryMock(entries, id),
  groupMemoryEntries: (entries: MemoryEntry[]) =>
    entries.length ? { health: entries } : {},
  memoryStorageSize: () => "0,1 КБ",
  normalizeMemoryEntry: (x: unknown) => x as MemoryEntry,
  buildMemoryImportPreview: (existing: MemoryEntry[], parsed: unknown[]) => {
    const valid = (parsed as MemoryEntry[]).filter((entry) => entry?.fact);
    const existingIds = new Set(existing.map((entry) => entry.id));
    const newEntries = valid.filter((entry) => !existingIds.has(entry.id));
    return {
      validCount: valid.length,
      invalidCount: (parsed as unknown[]).length - valid.length,
      duplicateCount: valid.length - newEntries.length,
      newEntries,
    };
  },
  upsertMemoryFact: (
    entries: MemoryEntry[],
    fact: string,
    category?: string,
  ) => ({
    entries: [
      { id: "manual-1", fact, category: category ?? "other", createdAt: "x" },
      ...entries,
    ],
    entry: { id: "manual-1", fact, category: category ?? "other" },
    created: true,
  }),
  CATEGORY_META: { health: { label: "Здоровʼя", emoji: "🩺" } },
  MEMORY_ONBOARDING_PROMPT: "ONBOARDING_PROMPT",
  MEMORY_ADD_INFO_PROMPT: "ADD_INFO_PROMPT",
  MEMORY_MANUAL_STEPS: [
    {
      category: "goal",
      label: "Фокус",
      prompt: "Що важливо?",
      placeholder: "Наприклад",
    },
  ],
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

    expect(screen.getByText("Банк памʼяті порожній")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Заповнити профіль/ }));

    // Preset — головне тут: інструкція інтервʼю живе на сервері
    // (`chatPresets.ts`), а звідси йде лише ідентифікатор режиму. Він же
    // переводить розмову на окреме тижневе відро AI-квоти.
    expect(emitHubBusMock).toHaveBeenCalledWith("openChat", {
      message: "ONBOARDING_PROMPT",
      autoSend: true,
      preset: "profile_interview",
    });
  });

  it("offers a manual step-by-step path that writes only memory entries", () => {
    storedEntries = [];
    render(<MemoryBankSection />);

    fireEvent.click(screen.getByRole("button", { name: /Заповнити вручну/ }));
    fireEvent.change(screen.getByPlaceholderText("Наприклад"), {
      target: { value: "Хочу більше ходити пішки" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Завершити" }));

    expect(writeMemoryEntriesMock).toHaveBeenCalledWith([
      expect.objectContaining({
        fact: "Хочу більше ходити пішки",
        category: "goal",
      }),
    ]);
    expect(toastSuccessMock).toHaveBeenCalledWith("Памʼять профілю оновлено");
  });
});

describe("MemoryBankSection — populated", () => {
  it("renders the stored fact under its category", () => {
    storedEntries = [ENTRY];
    render(<MemoryBankSection />);

    expect(screen.getByText("Алергія на арахіс")).toBeTruthy();
    expect(screen.getByText("Здоровʼя")).toBeTruthy();
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
    expect(payload).toEqual({
      message: "ADD_INFO_PROMPT",
      autoSend: true,
      preset: "profile_add_info",
    });
  });

  /**
   * Регресія 2026-08-07: режим виводився з `entries.length`, тож перший же
   * запис назавжди перемикав кнопку на `profile_add_info`. Повне інтервʼю
   * ставало недосяжним — щоб пройти його вдруге, треба було спорожнити банк.
   */
  it("інтервʼю доступне і з непорожнім банком", () => {
    storedEntries = [ENTRY];
    render(<MemoryBankSection />);

    fireEvent.click(screen.getByRole("button", { name: /Інтерв.ю/ }));

    const [event, payload] = emitHubBusMock.mock.calls[0]!;
    expect(event).toBe("openChat");
    expect(payload).toEqual({
      message: "ONBOARDING_PROMPT",
      autoSend: true,
      preset: "profile_interview",
    });
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
    fireEvent.click(screen.getByRole("button", { name: "Експорт памʼяті" }));

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

  it("previews a valid array of entries before merging new ones", async () => {
    const entries = [{ id: "n1", fact: "Веган", category: "diet" }];
    importFile(JSON.stringify(entries));

    await vi.waitFor(() => {
      expect(screen.getByText(/Перевір імпорт/)).toBeInTheDocument();
    });

    expect(writeMemoryEntriesMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Імпортувати нові" }));

    expect(writeMemoryEntriesMock).toHaveBeenCalledWith([
      expect.objectContaining({ id: "n1", fact: "Веган" }),
    ]);
    expect(toastSuccessMock).toHaveBeenCalledWith("Імпортовано 1 запис");
  });

  it("rejects a non-array payload", async () => {
    importFile(JSON.stringify({ not: "an array" }));
    await vi.waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Невалідний формат файлу",
        undefined,
        expect.objectContaining({ label: "Обрати інший" }),
      );
    });
    expect(writeMemoryEntriesMock).not.toHaveBeenCalled();
  });

  it("reports a parse failure on malformed JSON", async () => {
    importFile("{ broken json");
    await vi.waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Не вдалося прочитати файл",
        undefined,
        expect.objectContaining({ label: "Обрати інший" }),
      );
    });
  });
});

describe("MemoryBankSection — довгі факти не обрізаються (V-9, аудит 2026-08-08)", () => {
  it("факт переноситься повністю (break-words), а не truncate в один рядок", () => {
    const longFact =
      "Не їм молочне, бо лактозна непереносимість, але твердий сир ок";
    storedEntries = [
      { id: "m2", fact: longFact, category: "health" } as MemoryEntry,
    ];
    render(<MemoryBankSection />);

    const factNode = screen.getByText(longFact);
    // `truncate` різав контент, заради якого секція існує, без жодного
    // способу прочитати решту (ні title, ні розкриття) — V-9.
    expect(factNode.className).not.toMatch(/\btruncate\b/);
    expect(factNode.className).toMatch(/\bbreak-words\b/);
  });

  it("кнопка видалення вирівняна по верху (items-start), а не по центру рядка", () => {
    const longFact =
      "Не їм молочне, бо лактозна непереносимість, але твердий сир ок";
    storedEntries = [
      { id: "m2", fact: longFact, category: "health" } as MemoryEntry,
    ];
    render(<MemoryBankSection />);

    // На багаторядковому факті `items-center` зсунув би кнопку в середину
    // блоку тексту замість верхнього краю першого рядка.
    const row = screen.getByText(longFact).closest("div.group");
    expect(row?.className).toMatch(/\bitems-start\b/);
    expect(row?.className).not.toMatch(/\bitems-center\b/);
  });
});

describe("MemoryBankSection — порожні стани через спільний EmptyState (V-14, аудит 2026-08-08)", () => {
  it("порожній банк памʼяті малює <EmptyState> (role=status) з усіма трьома діями", () => {
    storedEntries = [];
    render(<MemoryBankSection />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Банк памʼяті порожній");
    expect(
      screen.getByRole("button", { name: /Заповнити профіль/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Заповнити вручну/ }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Імпорт/ })).toBeTruthy();

    // Прихований input лишається в DOM — програмне відкриття діалогу вибору
    // файлу (кнопка «Імпорт») досі має куди клікати.
    expect(document.querySelector('input[type="file"]')).toBeTruthy();
  });

  it("імпорт самих дублів показує порожній стан преview через <EmptyState>, а не голий <p>", async () => {
    storedEntries = [ENTRY];
    render(<MemoryBankSection />);

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const duplicateOnly = [
      { id: ENTRY.id, fact: ENTRY.fact, category: ENTRY.category },
    ];
    const content = JSON.stringify(duplicateOnly);
    const file = new File([content], "dup.json", {
      type: "application/json",
    });
    Object.defineProperty(file, "text", {
      value: () => Promise.resolve(content),
    });
    fireEvent.change(input, { target: { files: [file] } });

    await vi.waitFor(() => {
      expect(screen.getByText(/Перевір імпорт/)).toBeInTheDocument();
    });

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Нових записів немає");
  });
});
