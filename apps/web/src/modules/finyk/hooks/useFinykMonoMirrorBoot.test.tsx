// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const useLocalUserIdMock = vi.fn();
const bootMock = vi.fn();
const notifyMock = vi.fn();

// `useLocalUserId`, НЕ `useAuth`: хук перевели на спільний резолвер
// (2026-08-08). На `useAuth().user?.id` бут мірора не стартував під демо
// (auth там обходиться, `user === null`), і демо-місток банківських
// транзакцій у `monoMirrorBoot.ts` був недосяжним кодом — 23 засіяні
// транзакції лежали в LS, а мірор лишався порожнім.
vi.mock("../../../core/auth/useLocalUserId", () => ({
  useLocalUserId: () => useLocalUserIdMock(),
}));
vi.mock("../lib/monoMirrorBoot", () => ({
  bootFinykMonoMirror: (...a: unknown[]) => bootMock(...a),
}));
vi.mock("../lib/monoMirrorGate", () => ({
  notifyFinykMonoMirrorRefresh: () => notifyMock(),
}));

import { useFinykMonoMirrorBoot } from "./useFinykMonoMirrorBoot";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useFinykMonoMirrorBoot", () => {
  it("does not boot while the resolver has no id (pre-auth window)", () => {
    useLocalUserIdMock.mockReturnValue(null);
    renderHook(() => useFinykMonoMirrorBoot());
    expect(bootMock).not.toHaveBeenCalled();
  });

  it("boots once and notifies the gate when activated", async () => {
    useLocalUserIdMock.mockReturnValue("u1");
    bootMock.mockResolvedValue(true);
    const { rerender } = renderHook(() => useFinykMonoMirrorBoot());
    await waitFor(() => expect(bootMock).toHaveBeenCalledWith("u1"));
    await waitFor(() => expect(notifyMock).toHaveBeenCalled());
    rerender();
    expect(bootMock).toHaveBeenCalledTimes(1);
  });

  it("does not notify when boot returns false", async () => {
    useLocalUserIdMock.mockReturnValue("u2");
    bootMock.mockResolvedValue(false);
    renderHook(() => useFinykMonoMirrorBoot());
    await waitFor(() => expect(bootMock).toHaveBeenCalledWith("u2"));
    expect(notifyMock).not.toHaveBeenCalled();
  });

  // Регресійний пін фіксу 2026-08-08: під демо резолвер віддає
  // `demo-local`, і бут МУСИТЬ стартувати саме з ним. Якби хук знову
  // повернувся на `useAuth().user?.id`, цей тест зламався б першим —
  // `user` у демо `null`, бут не викликається, і транзакції демо
  // мовчки зникають із Аналітики.
  it("бутиться під демо через синтетичний demo-local id", async () => {
    useLocalUserIdMock.mockReturnValue("demo-local");
    bootMock.mockResolvedValue(true);
    renderHook(() => useFinykMonoMirrorBoot());
    await waitFor(() => expect(bootMock).toHaveBeenCalledWith("demo-local"));
  });
});
