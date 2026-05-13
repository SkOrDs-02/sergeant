/**
 * CommandPalette — context + persisted "recent commands" store.
 *
 * Split from `CommandPalette.tsx` to keep that file under the 600-LOC
 * cap (Hard Rule #18). Pure data plumbing — no JSX.
 *
 * Status: Active. Last validated: 2026-05-13 by @Skords-01 / Devin.
 */

import { createContext, type ReactNode } from "react";
import { z } from "zod";
import { createTypedStore } from "@shared/lib/storage/typedStore";

export interface PaletteCommand {
  /** Stable id used for `recent` tracking and `aria-activedescendant`. */
  id: string;
  /** Human-visible label (Ukrainian). */
  title: string;
  /** Optional secondary line in muted text. */
  description?: string;
  /** Group label used for section headers in the palette. */
  group?: string;
  /** Optional icon (any ReactNode — typically `<Icon name="..." />`). */
  icon?: ReactNode;
  /** Shortcut hint rendered inside a <kbd>. */
  shortcut?: string;
  /** Synonyms / aliases for fuzzy match. */
  keywords?: string[];
  /** Renders the row with muted state and skips activation. */
  disabled?: boolean;
  /** Invoked when the command is selected. */
  run: () => void;
}

export interface RegisterCommandsInput {
  /** Stable id for the *registration* (typically the module name). */
  id: string;
  commands: ReadonlyArray<PaletteCommand>;
}

export interface CommandPaletteContextValue {
  open: boolean;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  register: (input: RegisterCommandsInput) => void;
  unregister: (id: string) => void;
  /** Returns a fresh flat list of every registered command. */
  getAll: () => PaletteCommand[];
  recents: string[];
  markRecent: (commandId: string) => void;
  /** Ticks whenever commands are (un)registered. */
  revision: number;
}

export const CommandPaletteContext =
  createContext<CommandPaletteContextValue | null>(null);

export const RECENTS_MAX = 6;

/**
 * Persisted recent-command order. The shape is a plain string list; we
 * cap it to `RECENTS_MAX` entries on write. Stored under the typedStore
 * envelope so it benefits from migration + cross-tab subscribe.
 */
export const RECENTS_STORE = createTypedStore<string[]>({
  key: "command-palette-recents-v1",
  version: 1,
  schema: z.array(z.string()),
  defaultValue: [],
});
