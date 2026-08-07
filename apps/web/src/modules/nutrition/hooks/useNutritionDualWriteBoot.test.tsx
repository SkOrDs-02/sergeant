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
  bootNutritionDualWrite: (...args: unknown[]) => bootMock(...args),
}));

import { useNutritionDualWriteBoot } from "./useNutritionDualWriteBoot";

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
describe("useNutritionDualWriteBoot", () => {
  it("boots under the anonymous id when nobody is signed in", async () => {
    // Regression: a meal logged anonymously never reached SQLite and
    // disappeared on reload.
    renderHook(() => useNutritionDualWriteBoot());

    await waitFor(() => expect(bootMock).toHaveBeenCalledTimes(1));
    const ctx = bootMock.mock.calls[0]![0] as { getUserId: () => string };
    expect(ctx.getUserId()).toBe("local-anon");
  });

  it("does not boot while the session is still resolving", async () => {
    authStatus = "loading";
    renderHook(() => useNutritionDualWriteBoot());
    // Даємо динамічному імпорту шанс спрацювати — інакше ассерт нижче
    // нічого не доводить (див. шапку файлу).
    await act(async () => {
      await Promise.resolve();
    });
    expect(bootMock).not.toHaveBeenCalled();
  });

  it("boots nutrition dual-write for signed-in users", async () => {
    authUser = { id: "nutrition-u1" };
    const { unmount } = renderHook(() => useNutritionDualWriteBoot());

    // Чекаємо ДО `unmount()`: хук скасовує ще нерозвʼязаний імпорт
    // (`cancelled = true`), тож розмонтування до резолву означало б, що
    // `teardown` взагалі не призначиться — і перевіряти було б нічого.
    await waitFor(() => expect(bootMock).toHaveBeenCalledTimes(1));
    const ctx = bootMock.mock.calls[0]![0] as { getUserId: () => string };
    expect(ctx.getUserId()).toBe("nutrition-u1");

    unmount();
    expect(teardown).toHaveBeenCalledTimes(1);
  });
});
