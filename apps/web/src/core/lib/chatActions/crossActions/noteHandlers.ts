import { ls, lsSet } from "../../hubChatUtils";
import type {
  ChatActionResult,
  ListNotesAction,
  SaveNoteAction,
} from "../types";

export function saveNote(action: SaveNoteAction): ChatActionResult {
  const { text, tag } = (action as SaveNoteAction).input;
  const trimmed = (text || "").trim();
  if (!trimmed) return "Потрібен текст нотатки.";
  const notes = ls<
    Array<{ id: string; text: string; tag: string; createdAt: string }>
  >("hub_notes_v1", []);
  const note = {
    id: `note_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    text: trimmed.slice(0, 1000),
    tag: (tag || "other").trim().toLowerCase(),
    createdAt: new Date().toISOString(),
  };
  notes.unshift(note);
  lsSet("hub_notes_v1", notes);
  const noteId = note.id;
  return {
    result: `Нотатку збережено: "${trimmed.slice(0, 50)}${trimmed.length > 50 ? "\u2026" : ""}" [${note.tag}] (id:${noteId})`,
    undo: () => {
      const cur = ls<
        Array<{
          id: string;
          text: string;
          tag: string;
          createdAt: string;
        }>
      >("hub_notes_v1", []);
      const next = cur.filter((n) => n.id !== noteId);
      if (next.length !== cur.length) lsSet("hub_notes_v1", next);
    },
  };
}

export function listNotes(action: ListNotesAction): string {
  const { tag, limit } = (action as ListNotesAction).input || {};
  const max = Number(limit) || 10;
  const notes = ls<
    Array<{ id: string; text: string; tag: string; createdAt: string }>
  >("hub_notes_v1", []);
  if (notes.length === 0) return "Нотаток немає.";
  const filtered = tag
    ? notes.filter((n) => n.tag === tag.toLowerCase().trim())
    : notes;
  if (filtered.length === 0) return `Нотаток з тегом "${tag}" немає.`;
  const shown = filtered.slice(0, max);
  const parts: string[] = [`Нотатки (${filtered.length} всього):`];
  for (const n of shown) {
    const d = new Date(n.createdAt).toLocaleDateString("uk-UA");
    parts.push(
      `  [${n.tag}] ${n.text.slice(0, 80)}${n.text.length > 80 ? "\u2026" : ""} (${d})`,
    );
  }
  if (filtered.length > max) {
    parts.push(`  \u2026і ще ${filtered.length - max}`);
  }
  return parts.join("\n");
}
