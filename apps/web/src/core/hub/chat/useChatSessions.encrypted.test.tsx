/** @vitest-environment jsdom */
// B24: флаш історії на ховання сторінки при УВІМКНЕНОМУ шифруванні.
// Справжній WebCrypto + fake-indexeddb; завершення `subtle.encrypt`
// керується вручну, щоб перевірити: подія до debounce запускає шифрований
// запис, до його завершення відкритого тексту в сховищі немає, а після —
// лежить конверт, який розшифровується в останнє повідомлення.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";

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
vi.mock("@shared/lib/ui/undoToast", () => ({ showUndoToast: vi.fn() }));
vi.mock("../../lib/hubChatSpeech", () => ({ stopSpeaking: vi.fn() }));

import { useChatSessions } from "./useChatSessions";
import {
  SESSIONS_STORAGE_KEY,
  whenChatHistoryReady,
  type HubChatSession,
} from "../hubChatSessions";
import { makeUserMsg } from "../../lib/hubChatUtils";
import {
  __resetAtRestKeyForTests,
  flushAtRest,
  hydrateAtRest,
  sealAtRest,
} from "../../security/aiAtRest";
import { bumpAtRestWipeEpoch } from "../../security/aiAtRestEpoch";
import { open } from "../../security/aiAtRestCrypto";

const originalIDB = (globalThis as { indexedDB?: unknown }).indexedDB;
let gates: Array<() => void> = [];

beforeEach(async () => {
  (globalThis as { indexedDB?: unknown }).indexedDB = new IDBFactory();
  localStorage.clear();
  await __resetAtRestKeyForTests();
  await hydrateAtRest(); // ключ готовий, як після буту
  gates = [];
  const realEncrypt = crypto.subtle.encrypt.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, "encrypt").mockImplementation(
    (...args: Parameters<SubtleCrypto["encrypt"]>) =>
      new Promise<ArrayBuffer>((resolve, reject) => {
        gates.push(() => {
          realEncrypt(...args).then(resolve, reject);
        });
      }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  (globalThis as { indexedDB?: unknown }).indexedDB = originalIDB;
  Reflect.deleteProperty(document, "visibilityState");
});

describe("useChatSessions: флаш на ховання з шифруванням (B24)", () => {
  it.each([
    ["pagehide", () => window.dispatchEvent(new Event("pagehide"))],
    [
      "visibilitychange→hidden",
      () => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      },
    ],
  ])(
    "%s до debounce дає зашифрований запис останнього повідомлення",
    async (_n, fire) => {
      const { result, unmount } = renderHook(() => useChatSessions());
      act(() => {
        result.current.setMessages((m) => [...m, makeUserMsg("секрет у чаті")]);
      });
      act(() => fire()); // раніше за 600 мс debounce
      await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });

      // Шифрування запущено, але ще не завершилось: відкритого тексту немає.
      expect(gates.length).toBeGreaterThan(0);
      expect(localStorage.getItem(SESSIONS_STORAGE_KEY) ?? "").not.toContain(
        "секрет",
      );

      await act(async () => {
        while (gates.length > 0) gates.shift()!();
        await flushAtRest();
      });

      const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
      expect(raw).not.toBeNull();
      expect(raw).not.toContain("секрет");
      const plain = await open(SESSIONS_STORAGE_KEY, JSON.parse(raw as string));
      const sessions = JSON.parse(plain) as HubChatSession[];
      expect(
        sessions[0]!.messages.some((m) => m.text === "секрет у чаті"),
      ).toBe(true);
      unmount();
    },
  );
});

describe("useChatSessions: оверлей відкрито до розшифровки історії (B24 #19)", () => {
  it("стара історія не затирається, набране за цей час зберігається поруч", async () => {
    vi.mocked(crypto.subtle.encrypt).mockRestore(); // шифр без воріт
    // Історія, вже зашифрована на диску попереднім сеансом.
    const old: HubChatSession = {
      id: "old-1",
      title: "Стара бесіда",
      titleSource: "auto",
      createdAt: 1,
      updatedAt: 1,
      messages: [makeUserMsg("старе повідомлення")],
    } as HubChatSession;
    const written: Record<string, string> = {};
    for (const key of [SESSIONS_STORAGE_KEY, "hub_chat_sessions_mirror_v1"]) {
      const env = (await sealAtRest(key, JSON.stringify([old]))) as string;
      written[key] = env;
      localStorage.setItem(key, env);
    }
    // Холодний бут: слоти нічого не знають, а розшифровка ще не завершилась.
    bumpAtRestWipeEpoch();
    const decryptGates: Array<() => void> = [];
    const realDecrypt = crypto.subtle.decrypt.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "decrypt").mockImplementation(
      (...args: Parameters<SubtleCrypto["decrypt"]>) =>
        new Promise<ArrayBuffer>((resolve, reject) => {
          decryptGates.push(() => {
            realDecrypt(...args).then(resolve, reject);
          });
        }),
    );

    const { result, unmount } = renderHook(() => useChatSessions());
    expect(result.current.messages).toHaveLength(0); // історії ще не видно
    act(() => {
      result.current.setMessages((m) => [...m, makeUserMsg("нове до розбору")]);
    });
    act(() => {
      window.dispatchEvent(new Event("pagehide")); // спроба зберегти до розбору
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    // Збереження відмовлено: на диску досі той самий шифртекст.
    expect(localStorage.getItem(SESSIONS_STORAGE_KEY)).toBe(
      written[SESSIONS_STORAGE_KEY],
    );
    expect(localStorage.getItem("hub_chat_sessions_mirror_v1")).toBe(
      written["hub_chat_sessions_mirror_v1"],
    );

    await act(async () => {
      for (let i = 0; i < 20 && decryptGates.length === 0; i++) {
        await new Promise((r) => setTimeout(r, 0));
      }
      while (decryptGates.length > 0) decryptGates.shift()!();
      vi.mocked(crypto.subtle.decrypt).mockRestore(); // далі без воріт
      await whenChatHistoryReady();
      await new Promise((r) => setTimeout(r, 0));
      await flushAtRest();
    });

    const ids = result.current.sessions.map((s) => s.id);
    expect(ids).toContain("old-1");
    const stored = JSON.parse(
      await open(
        SESSIONS_STORAGE_KEY,
        JSON.parse(localStorage.getItem(SESSIONS_STORAGE_KEY) as string),
      ),
    ) as HubChatSession[];
    const texts = stored.flatMap((s) => s.messages.map((m) => m.text));
    expect(texts).toContain("старе повідомлення");
    expect(texts).toContain("нове до розбору");
    unmount();
  });
});

describe("useChatSessions: історію під хуком замінили (інша вкладка / розділ) (B24)", () => {
  it("зведення по бесідах: чужа історія лишається, свої нові повідомлення теж", async () => {
    vi.mocked(crypto.subtle.encrypt).mockRestore();
    const { result, unmount } = renderHook(() => useChatSessions());
    act(() => {
      result.current.setMessages((m) => [...m, makeUserMsg("моє перше")]);
    });
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    await act(async () => {
      await flushAtRest();
    });

    // Інша вкладка (або історія акаунта після входу) поклала своє.
    const theirs: HubChatSession = {
      id: "theirs-1",
      title: "Чужа бесіда",
      titleSource: "auto",
      createdAt: 5,
      updatedAt: 5,
      messages: [makeUserMsg("чуже повідомлення")],
    } as HubChatSession;
    for (const key of [SESSIONS_STORAGE_KEY, "hub_chat_sessions_mirror_v1"]) {
      const env = (await sealAtRest(key, JSON.stringify([theirs]))) as string;
      localStorage.setItem(key, env);
    }

    act(() => {
      result.current.setMessages((m) => [...m, makeUserMsg("моє друге")]);
    });
    act(() => {
      window.dispatchEvent(new Event("pagehide")); // відмова + запуск розбору
    });
    await act(async () => {
      for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
      await flushAtRest();
    });

    const stored = JSON.parse(
      await open(
        SESSIONS_STORAGE_KEY,
        JSON.parse(localStorage.getItem(SESSIONS_STORAGE_KEY) as string),
      ),
    ) as HubChatSession[];
    const texts = stored.flatMap((s) => s.messages.map((m) => m.text));
    expect(texts).toContain("чуже повідомлення");
    expect(texts).toContain("моє перше");
    expect(texts).toContain("моє друге");
    unmount();
  });
});
