/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

// Capture the undo-toast config so the test can drive the `onUndo` callback.
const { showUndoToastMock } = vi.hoisted(() => ({
  showUndoToastMock: vi.fn(),
}));

vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({
    show: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock("@shared/lib/ui/undoToast", () => ({
  showUndoToast: showUndoToastMock,
}));

import { useChatSessions } from "./useChatSessions";
import {
  SESSIONS_STORAGE_KEY,
  loadSessions,
  type HubChatSession,
} from "../hubChatSessions";
import { makeUserMsg } from "../../lib/hubChatUtils";

function storedSessions(): HubChatSession[] {
  return JSON.parse(localStorage.getItem(SESSIONS_STORAGE_KEY) || "[]");
}

beforeEach(() => {
  localStorage.clear();
  showUndoToastMock.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("useChatSessions (audit 03 F22 — debounce/undo)", () => {
  it("mints a fresh active session on first mount when storage is empty", () => {
    const { result } = renderHook(() => useChatSessions());
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.activeId).toBe(result.current.sessions[0]!.id);
    // Intro assistant message is seeded by `normalizeStoredMessages`.
    expect(result.current.messages.length).toBeGreaterThan(0);
  });

  it("debounces the persist + re-derives an auto title from the first user message", () => {
    const { result } = renderHook(() => useChatSessions());

    act(() => {
      result.current.setMessages((m) => [
        ...m,
        makeUserMsg("Порахуй мій бюджет"),
      ]);
    });

    // Separate `act` so the ref-updater effect (lastMessagesRef = messages) and
    // the debounce-schedule effect both flush before we run the timer. Then
    // advance past CHAT_HISTORY_WRITE_DEBOUNCE_MS (600 ms).
    act(() => {
      vi.advanceTimersByTime(700);
    });

    const stored = storedSessions();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.title).toBe("Порахуй мій бюджет");
    expect(stored[0]!.titleSource).toBe("auto");
  });

  it("does NOT steamroll a user-owned title on the debounced flush (F14 guard)", () => {
    // Seed a user-renamed session BEFORE mount so the hook initialises from it.
    const now = Date.now();
    const userOwned: HubChatSession = {
      id: "sess-user-owned",
      title: "Мій план на місяць",
      titleSource: "user",
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify([userOwned]));
    localStorage.setItem("hub_chat_active_session_v1", "sess-user-owned");

    const { result } = renderHook(() => useChatSessions());
    expect(result.current.activeId).toBe("sess-user-owned");

    act(() => {
      result.current.setMessages((m) => [
        ...m,
        makeUserMsg("геть інший перший меседж"),
      ]);
    });
    act(() => {
      vi.advanceTimersByTime(700);
    });

    const stored = storedSessions();
    expect(stored[0]!.title).toBe("Мій план на місяць");
    expect(stored[0]!.titleSource).toBe("user");
  });

  it("creates a new session and switches the active id", () => {
    const { result } = renderHook(() => useChatSessions());
    const firstId = result.current.activeId;

    act(() => {
      result.current.handleCreateSession();
    });

    expect(result.current.sessions).toHaveLength(2);
    expect(result.current.activeId).not.toBe(firstId);
    expect(result.current.sessions[0]!.title).toBe("Нова бесіда");
  });

  it("deletes a session, shows an undo toast, and restores it on undo", () => {
    const { result } = renderHook(() => useChatSessions());

    // Two sessions so a delete leaves a valid remainder.
    act(() => {
      result.current.handleCreateSession();
    });
    const idToDelete = result.current.activeId;
    expect(result.current.sessions).toHaveLength(2);

    act(() => {
      result.current.handleDeleteSession(idToDelete);
    });

    expect(result.current.sessions.some((s) => s.id === idToDelete)).toBe(
      false,
    );
    expect(showUndoToastMock).toHaveBeenCalledTimes(1);

    // Drive the captured `onUndo` to restore the deleted session.
    const undoConfig = showUndoToastMock.mock.calls[0]![1] as {
      onUndo: () => void;
    };
    act(() => {
      undoConfig.onUndo();
    });

    expect(result.current.sessions.some((s) => s.id === idToDelete)).toBe(true);
  });

  it("replaces the deleted session with a fresh one when it was the last", () => {
    const { result } = renderHook(() => useChatSessions());
    const onlyId = result.current.activeId;
    expect(result.current.sessions).toHaveLength(1);

    act(() => {
      result.current.handleDeleteSession(onlyId);
    });

    // Never leaves the user with zero sessions — a fresh one is minted.
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0]!.id).not.toBe(onlyId);
    expect(result.current.activeId).toBe(result.current.sessions[0]!.id);
  });

  it("loadSessions reads back what the debounced flush persisted", () => {
    const { result } = renderHook(() => useChatSessions());
    act(() => {
      result.current.setMessages((m) => [...m, makeUserMsg("персист тест")]);
    });
    act(() => {
      vi.advanceTimersByTime(700);
    });
    const reloaded = loadSessions();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]!.title).toBe("персист тест");
  });
});
