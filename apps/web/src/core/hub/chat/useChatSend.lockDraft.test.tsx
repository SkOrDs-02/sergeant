/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Мокаються лише план, виконавець tool-ів і тост; мережа - шпигуном на
// методах `chatApi` (як у `useChatSend.sessionBinding.test.tsx`).
const { executeActionsMock } = vi.hoisted(() => ({
  executeActionsMock: vi.fn(),
}));

vi.mock("../../billing/usePlan", () => ({
  usePlan: () => ({ isPro: true, plan: "pro", isLoading: false }),
}));
vi.mock("../../lib/hubChatActions", () => ({
  executeActions: executeActionsMock,
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

import { chatApi } from "@shared/api";
import { useChatSend } from "./useChatSend";
import {
  commitStashedFormDrafts,
  discardAllFormDrafts,
  setFormDraftUser,
} from "@shared/lib/storage/formDrafts";
import { safeListSSKeys } from "@shared/lib/storage/storage";
import { purgeAppOwnedSessionStorage } from "@shared/lib/storage/purgeLocalData";

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function W({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

const mountChat = () =>
  renderHook(() => useChatSend({ messages: [], setMessages: vi.fn() }), {
    wrapper: wrapper(),
  });
const sendMock = vi.fn();
const draftKeys = () => safeListSSKeys().filter((k) => k.includes("formDraft"));

beforeEach(() => {
  window.sessionStorage.clear();
  discardAllFormDrafts();
  setFormDraftUser("u1");
  sendMock.mockReset();
  vi.spyOn(chatApi, "send").mockImplementation(sendMock);
  vi.spyOn(chatApi, "stream").mockImplementation(vi.fn());
});
afterEach(() => vi.restoreAllMocks());

describe("useChatSend: чернетка повідомлення під замком (sec-13)", () => {
  it("замок розмонтовує чат, після розблокування текст повертається, один раз", async () => {
    const first = mountChat();
    act(() => first.result.current.setInput("не відправлене повідомлення"));

    first.unmount(); // замок
    commitStashedFormDrafts("u1");
    expect(draftKeys()).toHaveLength(1);

    const second = mountChat(); // розблокування
    expect(second.result.current.input).toBe("не відправлене повідомлення");
    expect(draftKeys()).toHaveLength(0);

    second.unmount(); // звичайне розмонтування без замка нічого не лишає
    const third = mountChat();
    expect(third.result.current.input).toBe("");
  });

  it("відправлене повідомлення чернетки не лишає", async () => {
    sendMock.mockResolvedValue({ text: "ок" });
    const first = mountChat();
    act(() => first.result.current.setInput("привіт"));
    await act(async () => {
      await first.result.current.send();
    });
    first.unmount();
    commitStashedFormDrafts("u1");
    expect(draftKeys()).toHaveLength(0);
  });

  it("вихід з акаунта стирає чернетку", () => {
    const first = mountChat();
    act(() => first.result.current.setInput("приватне"));
    first.unmount();
    commitStashedFormDrafts("u1");
    expect(draftKeys()).toHaveLength(1);
    purgeAppOwnedSessionStorage();
    expect(draftKeys()).toHaveLength(0);
  });
});
