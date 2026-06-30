import { describe, it, expect, vi, beforeEach } from "vitest";
import { saveNote, listNotes } from "./noteHandlers";
import type { ListNotesAction, SaveNoteAction } from "../types.cross";

const store: Record<string, unknown> = {};

vi.mock("../../hubChatUtils", () => ({
  ls: vi.fn((key: string, def: unknown) => store[key] ?? def),
  lsSet: vi.fn((key: string, val: unknown) => {
    store[key] = val;
  }),
}));

// Helpers intentionally accept loose/invalid input to exercise the
// handlers' runtime validation, so the built fixture is cast to the
// action type rather than constrained at the parameter level.
function makeSaveAction(text: unknown, tag?: string) {
  return {
    name: "save_note",
    input: { text, tag },
  } as SaveNoteAction;
}

function makeListAction(tag?: string, limit?: number) {
  return {
    name: "list_notes",
    input: { tag, limit },
  } as ListNotesAction;
}

describe("saveNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(store)) delete store[k];
  });

  it("returns error for empty text", () => {
    expect(saveNote(makeSaveAction(""))).toBe("Потрібен текст нотатки.");
  });

  it("returns error for whitespace-only text", () => {
    expect(saveNote(makeSaveAction("   "))).toBe("Потрібен текст нотатки.");
  });

  it("returns result object with undo for valid text", () => {
    const result = saveNote(makeSaveAction("Зробити домашнє завдання"));
    expect(result).toMatchObject({
      result: expect.stringContaining("Нотатку збережено"),
    });
    expect(typeof (result as { undo: () => void }).undo).toBe("function");
  });

  it("includes tag in result", () => {
    const result = saveNote(makeSaveAction("Купити молоко", "shopping")) as {
      result: string;
    };
    expect(result.result).toContain("[shopping]");
  });

  it("defaults tag to 'other' when not provided", () => {
    const result = saveNote(makeSaveAction("Нотатка без тегу")) as {
      result: string;
    };
    expect(result.result).toContain("[other]");
  });

  it("truncates text longer than 50 chars in result", () => {
    const long = "а".repeat(100);
    const result = saveNote(makeSaveAction(long)) as { result: string };
    expect(result.result).toContain("…");
  });

  it("undo removes note from store", () => {
    const result = saveNote(makeSaveAction("Тимчасова нотатка")) as {
      result: string;
      undo: () => void;
    };
    // Store has the note now
    const notes = store["hub_notes_v1"] as Array<{ id: string }>;
    expect(notes).toHaveLength(1);
    result.undo();
    const after = store["hub_notes_v1"] as Array<{ id: string }>;
    expect(after).toHaveLength(0);
  });
});

describe("listNotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(store)) delete store[k];
  });

  it("returns 'Нотаток немає' when empty", () => {
    expect(listNotes(makeListAction())).toBe("Нотаток немає.");
  });

  it("lists notes when store has entries", () => {
    store["hub_notes_v1"] = [
      {
        id: "1",
        text: "Перша нотатка",
        tag: "work",
        createdAt: "2026-06-01T10:00:00Z",
      },
      {
        id: "2",
        text: "Друга нотатка",
        tag: "other",
        createdAt: "2026-06-02T10:00:00Z",
      },
    ];
    const result = listNotes(makeListAction());
    expect(result).toContain("Нотатки (2 всього)");
    expect(result).toContain("Перша нотатка");
    expect(result).toContain("Друга нотатка");
  });

  it("filters by tag", () => {
    store["hub_notes_v1"] = [
      {
        id: "1",
        text: "Робота",
        tag: "work",
        createdAt: "2026-06-01T10:00:00Z",
      },
      {
        id: "2",
        text: "Особисте",
        tag: "other",
        createdAt: "2026-06-02T10:00:00Z",
      },
    ];
    const result = listNotes(makeListAction("work"));
    expect(result).toContain("Робота");
    expect(result).not.toContain("Особисте");
  });

  it("returns 'немає' message for non-matching tag", () => {
    store["hub_notes_v1"] = [
      {
        id: "1",
        text: "Щось",
        tag: "other",
        createdAt: "2026-06-01T10:00:00Z",
      },
    ];
    const result = listNotes(makeListAction("shopping"));
    expect(result).toContain('"shopping"');
  });

  it("limits output to given count", () => {
    store["hub_notes_v1"] = Array.from({ length: 15 }, (_, i) => ({
      id: String(i),
      text: `Нотатка ${i}`,
      tag: "other",
      createdAt: "2026-06-01T10:00:00Z",
    }));
    const result = listNotes(makeListAction(undefined, 5));
    expect(result).toContain("і ще 10");
  });

  it("defaults limit to 10", () => {
    store["hub_notes_v1"] = Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      text: `Нотатка ${i}`,
      tag: "other",
      createdAt: "2026-06-01T10:00:00Z",
    }));
    const result = listNotes(makeListAction());
    expect(result).toContain("і ще 2");
  });
});
