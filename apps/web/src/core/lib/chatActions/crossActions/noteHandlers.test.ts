import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../hubChatUtils", () => ({
  ls: vi.fn(),
  lsSet: vi.fn(),
}));

import { ls, lsSet } from "../../hubChatUtils";
import { listNotes, saveNote } from "./noteHandlers";

const mockLs = vi.mocked(ls) as ReturnType<typeof vi.fn>;
const mockLsSet = vi.mocked(lsSet);

beforeEach(() => {
  vi.clearAllMocks();
  mockLs.mockReturnValue([]);
});

// ─── saveNote ─────────────────────────────────────────────────────────────────

describe("saveNote", () => {
  it("returns error for empty text", () => {
    expect(saveNote({ type: "save_note", input: { text: "" } })).toContain(
      "текст",
    );
  });

  it("saves note and returns confirmation", () => {
    const result = saveNote({
      type: "save_note",
      input: { text: "Важлива думка" },
    }) as { result: string };
    expect(result.result).toContain("Важлива думка");
    expect(mockLsSet).toHaveBeenCalledWith(
      "hub_notes_v1",
      expect.arrayContaining([
        expect.objectContaining({ text: "Важлива думка" }),
      ]),
    );
  });

  it("assigns default tag 'other' when none provided", () => {
    saveNote({ type: "save_note", input: { text: "Нотатка" } });
    const saved = mockLsSet.mock.calls[0]![1] as Array<{ tag: string }>;
    expect(saved[0]?.tag).toBe("other");
  });

  it("normalizes tag to lowercase", () => {
    saveNote({ type: "save_note", input: { text: "Нотатка", tag: "WORK" } });
    const saved = mockLsSet.mock.calls[0]![1] as Array<{ tag: string }>;
    expect(saved[0]?.tag).toBe("work");
  });

  it("truncates long text to 1000 chars", () => {
    const longText = "x".repeat(1500);
    saveNote({ type: "save_note", input: { text: longText } });
    const saved = mockLsSet.mock.calls[0]![1] as Array<{ text: string }>;
    expect(saved[0]?.text).toHaveLength(1000);
  });

  it("prepends new note to list (unshift)", () => {
    const existing = [
      { id: "n1", text: "Old", tag: "other", createdAt: "2026-01-01" },
    ];
    mockLs.mockReturnValue(existing);
    saveNote({ type: "save_note", input: { text: "New" } });
    const saved = mockLsSet.mock.calls[0]![1] as Array<{ text: string }>;
    expect(saved[0]?.text).toBe("New");
  });

  it("returns object with undo function", () => {
    const result = saveNote({ type: "save_note", input: { text: "Test" } });
    expect(typeof (result as { undo: () => void }).undo).toBe("function");
  });

  it("undo removes the created note", () => {
    const result = saveNote({
      type: "save_note",
      input: { text: "To undo" },
    }) as { undo: () => void };
    const saved = mockLsSet.mock.calls[0]![1] as Array<{ id: string }>;
    const noteId = saved[0]!.id;
    vi.clearAllMocks();
    mockLs.mockReturnValue([
      { id: noteId, text: "To undo", tag: "other", createdAt: "2026-01-01" },
    ]);
    result.undo();
    expect(mockLsSet).toHaveBeenCalledWith("hub_notes_v1", []);
  });
});

// ─── listNotes ────────────────────────────────────────────────────────────────

describe("listNotes", () => {
  it("returns empty message when no notes", () => {
    mockLs.mockReturnValue([]);
    expect(listNotes({ type: "list_notes", input: {} })).toContain(
      "Нотаток немає",
    );
  });

  it("returns all notes when no filter", () => {
    mockLs.mockReturnValue([
      {
        id: "n1",
        text: "Нотатка 1",
        tag: "work",
        createdAt: "2026-06-01T00:00:00Z",
      },
      {
        id: "n2",
        text: "Нотатка 2",
        tag: "home",
        createdAt: "2026-06-02T00:00:00Z",
      },
    ]);
    const result = listNotes({ type: "list_notes", input: {} });
    expect(result).toContain("Нотатка 1");
    expect(result).toContain("Нотатка 2");
  });

  it("filters by tag", () => {
    mockLs.mockReturnValue([
      {
        id: "n1",
        text: "Work note",
        tag: "work",
        createdAt: "2026-06-01T00:00:00Z",
      },
      {
        id: "n2",
        text: "Home note",
        tag: "home",
        createdAt: "2026-06-02T00:00:00Z",
      },
    ]);
    const result = listNotes({ type: "list_notes", input: { tag: "work" } });
    expect(result).toContain("Work note");
    expect(result).not.toContain("Home note");
  });

  it("returns 'no notes for tag' when filter yields nothing", () => {
    mockLs.mockReturnValue([
      { id: "n1", text: "X", tag: "work", createdAt: "2026-01-01T00:00:00Z" },
    ]);
    const result = listNotes({ type: "list_notes", input: { tag: "home" } });
    expect(result).toContain("немає");
  });

  it("respects limit", () => {
    const notes = Array.from({ length: 15 }, (_, i) => ({
      id: `n${i}`,
      text: `Note ${i}`,
      tag: "other",
      createdAt: "2026-01-01T00:00:00Z",
    }));
    mockLs.mockReturnValue(notes);
    const result = listNotes({ type: "list_notes", input: { limit: 3 } });
    expect(result).toContain("і ще 12");
  });
});
