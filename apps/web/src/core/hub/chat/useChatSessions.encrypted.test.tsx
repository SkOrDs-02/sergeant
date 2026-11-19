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
import { SESSIONS_STORAGE_KEY, type HubChatSession } from "../hubChatSessions";
import { makeUserMsg } from "../../lib/hubChatUtils";
import {
  __resetAtRestKeyForTests,
  flushAtRest,
  hydrateAtRest,
} from "../../security/aiAtRest";
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
