import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../profile/memoryBank", () => ({
  CATEGORY_META: {
    personal: { label: "Особисте" },
    preference: { label: "Уподобання" },
  },
  readMemoryEntries: vi.fn(),
  removeMemoryEntry: vi.fn(),
  upsertMemoryFact: vi.fn(),
  writeMemoryEntries: vi.fn(),
}));

import {
  CATEGORY_META as _cat,
  readMemoryEntries,
  removeMemoryEntry,
  upsertMemoryFact,
  writeMemoryEntries,
} from "../../../profile/memoryBank";
import { forget, myProfile, remember } from "./memoryHandlers";

const mockRead = vi.mocked(readMemoryEntries);
const mockWrite = vi.mocked(writeMemoryEntries);
const mockUpsert = vi.mocked(upsertMemoryFact);
const mockRemove = vi.mocked(removeMemoryEntry);

beforeEach(() => {
  vi.clearAllMocks();
  mockRead.mockReturnValue([]);
});

// ─── remember ─────────────────────────────────────────────────────────────────

describe("remember", () => {
  it("writes fact and returns success message with id", () => {
    const entry = {
      id: "e1",
      fact: "Люблю каву",
      category: "personal",
      createdAt: "",
    };
    mockUpsert.mockReturnValue({ entries: [entry], entry, created: true });
    const result = remember({
      name: "remember",
      input: { fact: "Люблю каву" },
    }) as { result: string };
    expect(result.result).toContain("Запам'ятав");
    expect(result.result).toContain("Люблю каву");
    expect(mockWrite).toHaveBeenCalledOnce();
  });

  it("uses 'Оновив' when entry existed", () => {
    const entry = {
      id: "e1",
      fact: "Не люблю горіхи",
      category: "personal",
      createdAt: "",
    };
    mockUpsert.mockReturnValue({ entries: [entry], entry, created: false });
    const result = remember({
      name: "remember",
      input: { fact: "Не люблю горіхи" },
    }) as { result: string };
    expect(result.result).toContain("Оновив");
  });

  it("returns object with undo function", () => {
    const entry = {
      id: "e2",
      fact: "Тест",
      category: "personal",
      createdAt: "",
    };
    mockUpsert.mockReturnValue({ entries: [entry], entry, created: true });
    const result = remember({ name: "remember", input: { fact: "Тест" } });
    expect(typeof (result as { undo: () => void }).undo).toBe("function");
  });

  it("undo: deletes entry when created=true", () => {
    const entry = {
      id: "e3",
      fact: "Undo test",
      category: "personal",
      createdAt: "",
    };
    mockUpsert.mockReturnValue({ entries: [entry], entry, created: true });
    const result = remember({
      name: "remember",
      input: { fact: "Undo test" },
    }) as { undo: () => void };
    mockRead.mockReturnValue([entry]);
    mockRemove.mockReturnValue({ entries: [], removed: entry });
    result.undo();
    expect(mockWrite).toHaveBeenCalledTimes(2);
  });

  it("undo: restores previous entry when updated", () => {
    const prev = {
      id: "e4",
      fact: "Old fact",
      category: "personal",
      createdAt: "",
    };
    mockRead.mockReturnValueOnce([prev]);
    const entry = {
      id: "e4",
      fact: "New fact",
      category: "personal",
      createdAt: "",
    };
    mockUpsert.mockReturnValue({ entries: [entry], entry, created: false });
    const result = remember({
      name: "remember",
      input: { fact: "New fact" },
    }) as { undo: () => void };
    mockRead.mockReturnValue([entry]);
    result.undo();
    expect(mockWrite).toHaveBeenCalledTimes(2);
  });

  it("catches errors and returns error message string", () => {
    mockUpsert.mockImplementation(() => {
      throw new Error("Storage full");
    });
    const result = remember({ name: "remember", input: { fact: "X" } });
    expect(result).toBe("Storage full");
  });

  it("converts non-string fact to empty string", () => {
    const entry = { id: "e5", fact: "", category: "personal", createdAt: "" };
    mockUpsert.mockReturnValue({ entries: [entry], entry, created: true });
    remember({ name: "remember", input: { fact: null as unknown as string } });
    expect(mockUpsert).toHaveBeenCalledWith([], "", undefined);
  });
});

// ─── forget ───────────────────────────────────────────────────────────────────

describe("forget", () => {
  it("returns error for empty fact_id", () => {
    const result = forget({ name: "forget", input: { fact_id: "" } });
    expect(result).toContain("id факту");
  });

  it("returns error when fact not found", () => {
    mockRead.mockReturnValue([]);
    mockRemove.mockReturnValue({ entries: [], removed: null });
    const result = forget({ name: "forget", input: { fact_id: "nope" } });
    expect(result).toContain("не знайдено");
  });

  it("removes and returns confirmation with fact text", () => {
    const entry = {
      id: "e1",
      fact: "Стара нотатка",
      category: "personal",
      createdAt: "",
    };
    mockRead.mockReturnValue([entry]);
    mockRemove.mockReturnValue({ entries: [], removed: entry });
    const result = forget({ name: "forget", input: { fact_id: "e1" } });
    expect(result).toContain("Забув");
    expect(result).toContain("Стара нотатка");
    expect(mockWrite).toHaveBeenCalledOnce();
  });
});

// ─── myProfile ────────────────────────────────────────────────────────────────

describe("myProfile", () => {
  it("returns empty profile message when no entries", () => {
    mockRead.mockReturnValue([]);
    const result = myProfile({ name: "my_profile", input: {} });
    expect(result).toContain("порожній");
  });

  it("lists all entries when no category filter", () => {
    mockRead.mockReturnValue([
      { id: "e1", fact: "Люблю каву", category: "personal", createdAt: "" },
      {
        id: "e2",
        fact: "Вегетаріанець",
        category: "preference",
        createdAt: "",
      },
    ]);
    const result = myProfile({ name: "my_profile", input: {} });
    expect(result).toContain("Люблю каву");
    expect(result).toContain("Вегетаріанець");
  });

  it("filters by category", () => {
    mockRead.mockReturnValue([
      { id: "e1", fact: "Люблю каву", category: "personal", createdAt: "" },
      {
        id: "e2",
        fact: "Вегетаріанець",
        category: "preference",
        createdAt: "",
      },
    ]);
    const result = myProfile({
      name: "my_profile",
      input: { category: "personal" },
    });
    expect(result).toContain("Люблю каву");
    expect(result).not.toContain("Вегетаріанець");
  });

  it("returns 'no records for category' when filter yields empty", () => {
    mockRead.mockReturnValue([
      { id: "e1", fact: "Каву п'ю", category: "personal", createdAt: "" },
    ]);
    const result = myProfile({
      name: "my_profile",
      input: { category: "preference" },
    });
    expect(result).toContain("немає записів");
  });

  it("shows category label from CATEGORY_META", () => {
    mockRead.mockReturnValue([
      { id: "e1", fact: "Тест", category: "personal", createdAt: "" },
    ]);
    const result = myProfile({ name: "my_profile", input: {} });
    expect(result).toContain("Особисте");
  });

  it("includes entry id in output", () => {
    mockRead.mockReturnValue([
      { id: "abc123", fact: "Щось", category: "personal", createdAt: "" },
    ]);
    const result = myProfile({ name: "my_profile", input: {} });
    expect(result).toContain("abc123");
  });
});
