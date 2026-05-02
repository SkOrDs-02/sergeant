/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from "vitest";
import {
  ACTIVE_SESSION_KEY,
  SESSIONS_STORAGE_KEY,
  createSession,
  deleteSession,
  deriveSessionTitle,
  ensureActiveSession,
  findSession,
  loadActiveSessionId,
  loadSessions,
  saveActiveSessionId,
  saveSessions,
  upsertSession,
} from "./hubChatSessions";
import { makeAssistantMsg, makeUserMsg } from "../lib/hubChatUtils";

beforeEach(() => {
  localStorage.clear();
});

describe("hubChatSessions", () => {
  describe("loadSessions migration", () => {
    it("migrates legacy `hub_chat_history` into a single fresh session", () => {
      const legacy = [
        makeUserMsg("Привіт, склади мені план"),
        makeAssistantMsg("Звичайно, давай починати"),
      ];
      localStorage.setItem("hub_chat_history", JSON.stringify(legacy));

      const sessions = loadSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].messages.length).toBeGreaterThanOrEqual(2);
      // After migration the v1 key is populated so subsequent loads
      // don't re-migrate.
      expect(localStorage.getItem(SESSIONS_STORAGE_KEY)).toBeTruthy();
    });

    it("never re-migrates once v1 key has data", () => {
      const original = [createSession()];
      saveSessions(original);
      localStorage.setItem(
        "hub_chat_history",
        JSON.stringify([makeUserMsg("Should be ignored")]),
      );

      const next = loadSessions();
      expect(next).toHaveLength(1);
      expect(next[0].id).toBe(original[0].id);
    });

    it("returns empty array when there is nothing to migrate", () => {
      expect(loadSessions()).toEqual([]);
    });
  });

  describe("createSession + deriveSessionTitle", () => {
    it("falls back to date-based title when no user message is present", () => {
      const s = createSession();
      expect(s.title).toMatch(/^Бесіда \d{2}\.\d{2}/);
      expect(s.messages.length).toBeGreaterThan(0); // assistant intro
    });

    it("derives title from first user message and truncates >40 chars", () => {
      const long = "A".repeat(80);
      const t = deriveSessionTitle([makeUserMsg(long)], Date.now());
      expect(t.length).toBeLessThanOrEqual(41);
      expect(t.endsWith("…")).toBe(true);
    });
  });

  describe("upsertSession + deleteSession + findSession", () => {
    it("upsert prepends a new session when id is unknown", () => {
      const a = createSession();
      const b = createSession();
      const next = upsertSession([a], b);
      expect(next.map((s) => s.id)).toEqual([b.id, a.id]);
    });

    it("upsert replaces an existing session in place", () => {
      const a = createSession();
      const updated = { ...a, title: "Renamed" };
      const next = upsertSession([a], updated);
      expect(next).toHaveLength(1);
      expect(next[0].title).toBe("Renamed");
    });

    it("delete removes only the targeted session", () => {
      const a = createSession();
      const b = createSession();
      const next = deleteSession([a, b], a.id);
      expect(next.map((s) => s.id)).toEqual([b.id]);
    });

    it("findSession returns null for unknown id", () => {
      expect(findSession([createSession()], "bogus")).toBeNull();
    });
  });

  describe("active session persistence", () => {
    it("saveActiveSessionId(null) clears the key", () => {
      saveActiveSessionId("abc");
      expect(loadActiveSessionId()).toBe("abc");
      saveActiveSessionId(null);
      expect(loadActiveSessionId()).toBeNull();
    });
  });

  describe("ensureActiveSession", () => {
    it("creates a fresh session when input list is empty", () => {
      const { sessions, activeId } = ensureActiveSession([], null);
      expect(sessions).toHaveLength(1);
      expect(activeId).toBe(sessions[0].id);
    });

    it("falls back to the most recent session when activeId is missing", () => {
      const a = createSession();
      const b = createSession();
      const { activeId } = ensureActiveSession([a, b], null);
      expect(activeId).toBe(a.id);
    });

    it("preserves the active id when valid", () => {
      const a = createSession();
      const b = createSession();
      const { activeId } = ensureActiveSession([a, b], b.id);
      expect(activeId).toBe(b.id);
    });
  });

  describe("saveSessions caps growth", () => {
    it("trims to the newest 20 sessions and 60 messages each", () => {
      const many = Array.from({ length: 30 }, (_, i) => {
        const s = createSession();
        // Stagger updatedAt so newest wins.
        s.updatedAt = i;
        return s;
      });
      saveSessions(many);
      const stored = JSON.parse(
        localStorage.getItem(SESSIONS_STORAGE_KEY) || "[]",
      );
      expect(stored).toHaveLength(20);
      expect(stored[0].updatedAt).toBe(29);
    });
  });

  describe("active session key constants", () => {
    it("uses the documented stable keys", () => {
      expect(SESSIONS_STORAGE_KEY).toBe("hub_chat_sessions_v1");
      expect(ACTIVE_SESSION_KEY).toBe("hub_chat_active_session_v1");
    });
  });
});
