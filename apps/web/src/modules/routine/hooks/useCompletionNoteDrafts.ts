import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import { completionNoteKey } from "../lib/completionNoteKey";
import { setCompletionNote } from "../lib/routineStorage";
import type { RoutineState } from "../lib/types";

/**
 * Debounced completion-note draft store for the Routine calendar list.
 *
 * Extracted from `RoutineCalendarPanel.tsx` to keep the panel under the
 * `max-lines:600` Hard Rule (Initiative 0013 regression — the panel had
 * re-grown to ~645 effective LOC after the 2026-05-09 carry-over ревізія).
 *
 * ## Why a draft layer at all
 *
 * Typing into the «Нотатка до відмітки» input used to call `setRoutine`
 * → `saveRoutineState` → `localStorage.setItem` (serialising the entire
 * routine) on every keystroke, which also triggered a `postMessage` to
 * the service worker and a re-read of the full routine state via
 * `ROUTINE_EVENT`. On larger states (many habits / many completions)
 * that produced visible input lag, especially on mobile. The draft
 * layer keeps keystrokes in component-local state; a 300 ms debounce
 * flushes the final value through the canonical `setRoutine` writer.
 *
 * ## What this hook owns
 *
 * - `noteDrafts` — keyed by `completionNoteKey(habitId, dateKey)`; the
 *   in-flight (un-flushed) value for each row that the user has typed
 *   into during this session.
 * - `noteExpanded` — keyed the same way; tracks which rows have their
 *   input revealed. The caller defaults rows with a saved value to
 *   expanded so users can see what they wrote without an extra tap.
 * - `noteDraftsRef` — escape hatch for inline event handlers that need
 *   the latest draft value without subscribing to re-renders (e.g.
 *   "reveal note input now and show the freshly-typed value").
 * - `scheduleNoteFlush(habitId, dateKey, value)` — record a keystroke
 *   and arm a 300 ms timer per row to flush via `setRoutine`.
 * - `flushNoteDraft(habitId, dateKey)` — immediate flush (used on blur
 *   to commit the value without waiting out the debounce).
 *
 * ## Unmount safety
 *
 * The hook flushes ALL outstanding drafts synchronously on unmount so
 * nothing the user typed is silently dropped when navigating away
 * mid-typing. Pending timers are cleared in the same pass.
 */
export interface UseCompletionNoteDrafts {
  noteDrafts: Record<string, NoteDraft>;
  noteDraftsRef: MutableRefObject<Record<string, NoteDraft>>;
  noteExpanded: Record<string, boolean>;
  setNoteExpanded: Dispatch<SetStateAction<Record<string, boolean>>>;
  scheduleNoteFlush: (habitId: string, dateKey: string, value: string) => void;
  flushNoteDraft: (habitId: string, dateKey: string) => void;
}

interface NoteDraft {
  habitId: string;
  dateKey: string;
  value: string;
}

export function useCompletionNoteDrafts(
  setRoutine: Dispatch<SetStateAction<RoutineState>>,
): UseCompletionNoteDrafts {
  const [noteDrafts, setNoteDrafts] = useState<Record<string, NoteDraft>>({});
  const [noteExpanded, setNoteExpanded] = useState<Record<string, boolean>>({});
  const noteDraftsRef = useRef(noteDrafts);
  useEffect(() => {
    noteDraftsRef.current = noteDrafts;
  }, [noteDrafts]);

  const noteTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const flushNoteDraft = useCallback(
    (habitId: string, dateKey: string) => {
      const key = completionNoteKey(habitId, dateKey);
      const draft = noteDraftsRef.current[key];
      if (!draft) return;
      setRoutine((s) =>
        setCompletionNote(s, draft.habitId, draft.dateKey, draft.value),
      );
      setNoteDrafts((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [setRoutine],
  );

  const scheduleNoteFlush = useCallback(
    (habitId: string, dateKey: string, value: string) => {
      const key = completionNoteKey(habitId, dateKey);
      setNoteDrafts((prev) => ({
        ...prev,
        [key]: { habitId, dateKey, value },
      }));
      const timers = noteTimersRef.current;
      const prior = timers.get(key);
      if (prior) clearTimeout(prior);
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          flushNoteDraft(habitId, dateKey);
        }, 300),
      );
    },
    [flushNoteDraft],
  );

  useEffect(() => {
    const timers = noteTimersRef.current;
    return () => {
      // Flush any outstanding drafts synchronously on unmount so nothing is
      // silently dropped when the user navigates away mid-typing.
      const drafts = Object.values(noteDraftsRef.current);
      if (drafts.length > 0) {
        setRoutine((s) => {
          let next = s;
          for (const d of drafts) {
            next = setCompletionNote(next, d.habitId, d.dateKey, d.value);
          }
          return next;
        });
      }
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, [setRoutine]);

  return {
    noteDrafts,
    noteDraftsRef,
    noteExpanded,
    setNoteExpanded,
    scheduleNoteFlush,
    flushNoteDraft,
  };
}
