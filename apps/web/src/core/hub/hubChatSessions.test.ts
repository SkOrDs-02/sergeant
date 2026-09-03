/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from "vitest";
import {
  ACTIVE_SESSION_KEY,
  CHAT_OWNER_KEY,
  SESSIONS_MIRROR_KEY,
  SESSIONS_STORAGE_KEY,
  createSession,
  deleteSession,
  deriveSessionTitle,
  ensureActiveSession,
  findSession,
  loadActiveSessionId,
  loadSessions,
  reconcileChatOwnerOnAuthChange,
  saveActiveSessionId,
  saveSessions,
  upsertSession,
} from "./hubChatSessions";
import { makeAssistantMsg, makeUserMsg } from "../lib/hubChatUtils";

beforeEach(() => {
  localStorage.clear();
});

describe("hubChatSessions", () => {
  // Регресія на SEV1 з browser-QA 2026-09-02: історія чату зникала після
  // релоаду, бо `safeWriteLS` пише в SQLite fire-and-forget, і сплеск
  // повідомлень із релоадом за ним втрачав запис. Синхронне дзеркало в
  // localStorage закриває гонку; арбітраж — за `updatedAt`, щоб жодне
  // джерело не стало «правдою» назавжди.
  describe("durable mirror", () => {
    it("mirrors sessions synchronously on save", () => {
      const session = createSession([makeUserMsg("привіт")]);
      saveSessions([session]);

      const mirrored = localStorage.getItem(SESSIONS_MIRROR_KEY);
      expect(mirrored).toBeTruthy();
      expect(JSON.parse(mirrored!)).toHaveLength(1);
    });

    it("recovers history when the primary key lost the async write", () => {
      const session = createSession([makeUserMsg("не загубись")]);
      saveSessions([session]);
      // Імітуємо саму гонку: SQLite-бік не встиг, дзеркало встигло.
      localStorage.removeItem(SESSIONS_STORAGE_KEY);
      localStorage.removeItem("hub_chat_history");

      const loaded = loadSessions();
      expect(loaded).toHaveLength(1);
      expect(loaded[0]!.messages.some((m) => m.text === "не загубись")).toBe(
        true,
      );
    });

    // Рев'ю CodeRabbit на PR #1053: дірка в самому фіксі гонки. Міграція
    // legacy стояла ПЕРШОЮ і бачила лише основний ключ, тож старий
    // `hub_chat_history` перехоплював гілку і затирав свіже дзеркало.
    it("does not let stale legacy history overwrite a fresh mirror", () => {
      const fresh = createSession([makeUserMsg("свіже з дзеркала")]);
      saveSessions([fresh]);
      // Основний запис не долетів; legacy-ключ лишився з давньої розмови.
      localStorage.removeItem(SESSIONS_STORAGE_KEY);
      localStorage.setItem(
        "hub_chat_history",
        JSON.stringify([makeUserMsg("давня розмова")]),
      );

      const loaded = loadSessions();
      const texts = loaded.flatMap((s) => s.messages.map((m) => m.text));
      expect(texts).toContain("свіже з дзеркала");
      expect(texts).not.toContain("давня розмова");
    });

    it("prefers whichever side has the newer updatedAt", () => {
      const stale = {
        ...createSession([makeUserMsg("старе")]),
        updatedAt: 100,
      };
      const fresh = { ...createSession([makeUserMsg("нове")]), updatedAt: 900 };

      // Стале дзеркало (напр. запис у localStorage не пройшов через квоту)
      // не має перебивати свіжий основний ключ.
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify([fresh]));
      localStorage.setItem(SESSIONS_MIRROR_KEY, JSON.stringify([stale]));
      expect(loadSessions()[0]!.updatedAt).toBe(900);

      // І симетрично — свіже дзеркало перебиває старий основний ключ.
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify([stale]));
      localStorage.setItem(SESSIONS_MIRROR_KEY, JSON.stringify([fresh]));
      expect(loadSessions()[0]!.updatedAt).toBe(900);
    });

    it("wipes the mirror when the account changes (F12 privacy)", () => {
      reconcileChatOwnerOnAuthChange("user-a");
      saveSessions([createSession([makeUserMsg("таємниця акаунта A")])]);
      expect(localStorage.getItem(SESSIONS_MIRROR_KEY)).toBeTruthy();

      reconcileChatOwnerOnAuthChange("user-b");

      expect(localStorage.getItem(SESSIONS_MIRROR_KEY)).toBeNull();
      expect(loadSessions()).toEqual([]);
    });
  });

  describe("loadSessions migration", () => {
    it("migrates legacy `hub_chat_history` into a single fresh session", () => {
      const legacy = [
        makeUserMsg("Привіт, склади мені план"),
        makeAssistantMsg("Звичайно, давай починати"),
      ];
      localStorage.setItem("hub_chat_history", JSON.stringify(legacy));

      const sessions = loadSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.messages.length).toBeGreaterThanOrEqual(2);
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
      expect(next[0]!.id).toBe(original[0]!.id);
    });

    it("returns empty array when there is nothing to migrate", () => {
      expect(loadSessions()).toEqual([]);
    });
  });

  describe("reconcileChatOwnerOnAuthChange (F12 privacy)", () => {
    it("first stamp keeps existing sessions (anonymous → first sign-in)", () => {
      saveSessions([createSession([makeUserMsg("Анонімний чернетковий чат")])]);
      expect(reconcileChatOwnerOnAuthChange("user-A")).toEqual({
        changed: false,
        prevOwnerWasUser: false,
      });
      expect(loadSessions()).toHaveLength(1);
      expect(localStorage.getItem(CHAT_OWNER_KEY)).toContain("user-A");
    });

    it("wipes sessions when a different account signs in on the device", () => {
      reconcileChatOwnerOnAuthChange("user-A");
      saveSessions([createSession([makeUserMsg("Скільки я витратив?")])]);
      saveActiveSessionId("some-id");

      // user → user': the ONLY transition that may trigger the heavy
      // identity-wipe (RQ clear + persisted purge + reload) upstream.
      expect(reconcileChatOwnerOnAuthChange("user-B")).toEqual({
        changed: true,
        prevOwnerWasUser: true,
      });

      expect(loadSessions()).toEqual([]);
      expect(loadActiveSessionId()).toBeNull();
      expect(localStorage.getItem("hub_chat_history")).toBeNull();
      expect(localStorage.getItem(CHAT_OWNER_KEY)).toContain("user-B");
    });

    it("wipes sessions on logout (user → anonymous) and is idempotent", () => {
      reconcileChatOwnerOnAuthChange("user-A");
      saveSessions([createSession([makeUserMsg("Приватне питання")])]);

      expect(reconcileChatOwnerOnAuthChange(null)).toEqual({
        changed: true,
        prevOwnerWasUser: true,
      });
      expect(loadSessions()).toEqual([]);

      // Repeat with the same identity — no wipe reported, still empty.
      expect(reconcileChatOwnerOnAuthChange(null)).toEqual({
        changed: false,
        prevOwnerWasUser: false,
      });
      expect(loadSessions()).toEqual([]);
    });

    it("anon-after-logout → user wipes chat but is NOT a user-to-user switch", () => {
      // logout stamped the anonymous placeholder…
      reconcileChatOwnerOnAuthChange("user-A");
      reconcileChatOwnerOnAuthChange(null);
      saveSessions([createSession([makeUserMsg("Чернетка гостя")])]);

      // …so the next sign-in wipes the guest chat (privacy) but must
      // NOT report prevOwnerWasUser: the upstream identity-wipe (RQ
      // teardown + reload) would break the anonymous-data migration.
      expect(reconcileChatOwnerOnAuthChange("user-B")).toEqual({
        changed: true,
        prevOwnerWasUser: false,
      });
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
      expect(next[0]!.title).toBe("Renamed");
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
      expect(activeId).toBe(sessions[0]!.id);
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
