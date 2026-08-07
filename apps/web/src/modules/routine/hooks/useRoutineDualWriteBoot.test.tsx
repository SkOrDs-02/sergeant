// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const bootMock = vi.fn();
const teardown = vi.fn();

let authUser: { id: string } | null = null;
let authStatus = "unauthenticated";

vi.mock("../../../core/auth/AuthContext", () => ({
  useAuth: () => ({ user: authUser, status: authStatus }),
}));
vi.mock("../lib/dualWriteBoot.js", () => ({
  bootRoutineDualWrite: (...args: unknown[]) => bootMock(...args),
}));

import { useRoutineDualWriteBoot } from "./useRoutineDualWriteBoot";

beforeEach(() => {
  vi.clearAllMocks();
  authUser = null;
  authStatus = "unauthenticated";
  bootMock.mockReturnValue(teardown);
});

afterEach(() => {
  authUser = null;
  authStatus = "unauthenticated";
});

/**
 * AI-CONTEXT: boot-модуль тепер підвантажується динамічно (`import()` у
 * хуку) — щоб `drizzle-orm` не сидів у критичному шляху. Через це виклик
 * `boot*DualWrite` відбувається на мікрозадачі, а не в тому ж такті, що
 * `renderHook`. Тому ассерти тут чекають, а не читають лічильник одразу.
 *
 * Негативний тест теж чекає — інакше він проходив би тривіально: «ще не
 * викликано» правда і для «не буде викликано», і для «викликається за
 * мить». Один такт мікрозадач робить його знову осмисленим.
 */
describe("useRoutineDualWriteBoot", () => {
  it("registers dual-write under the anonymous id when signed out", async () => {
    // Regression: dual-write used to stay dormant for anonymous
    // visitors, so `triggerRoutineDualWrite` no-opped and the new habit
    // never reached SQLite — it survived only until the next reload.
    renderHook(() => useRoutineDualWriteBoot());

    await waitFor(() => expect(bootMock).toHaveBeenCalledTimes(1));
    const ctx = bootMock.mock.calls[0]![0] as { getUserId: () => string };
    expect(ctx.getUserId()).toBe("local-anon");
  });

  it("leaves dual-write dormant while the session is still resolving", async () => {
    authStatus = "loading";
    renderHook(() => useRoutineDualWriteBoot());
    // Даємо динамічному імпорту шанс спрацювати — інакше ассерт нижче
    // нічого не доводить (див. шапку файлу).
    await act(async () => {
      await Promise.resolve();
    });
    expect(bootMock).not.toHaveBeenCalled();
  });

  it("registers routine dual-write and tears down on unmount", async () => {
    authUser = { id: "routine-u1" };
    const { unmount } = renderHook(() => useRoutineDualWriteBoot());

    // Чекаємо ДО `unmount()`: хук скасовує ще нерозвʼязаний імпорт
    // (`cancelled = true`), тож розмонтування до резолву означало б, що
    // `teardown` взагалі не призначиться — і перевіряти було б нічого.
    await waitFor(() => expect(bootMock).toHaveBeenCalledTimes(1));
    const ctx = bootMock.mock.calls[0]![0] as { getUserId: () => string };
    expect(ctx.getUserId()).toBe("routine-u1");

    unmount();
    expect(teardown).toHaveBeenCalledTimes(1);
  });
});
