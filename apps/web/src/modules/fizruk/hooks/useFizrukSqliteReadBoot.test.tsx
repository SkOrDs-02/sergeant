// @vitest-environment jsdom
/**
 * Mirrors `apps/web/src/modules/finyk/hooks/useFinykSqliteReadBoot.test.tsx`.
 * Fizruk's variant additionally falls back to a synthetic demo user id
 * when demo mode is active and there's no authenticated user (QA D-002)
 * — covered separately below.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const useAuthMock = vi.fn();
const bootMock = vi.fn();
const notifyMock = vi.fn();

vi.mock("../../../core/auth/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));
vi.mock("../lib/sqliteReadBoot", () => ({
  bootFizrukSqliteReadPath: (...a: unknown[]) => bootMock(...a),
}));
vi.mock("../lib/sqliteReadGate", () => ({
  notifyFizrukSqliteCacheRefresh: () => notifyMock(),
}));

import { logger } from "@shared/lib";
import {
  useFizrukSqliteReadBoot,
  isFizrukReadBootInFlight,
} from "./useFizrukSqliteReadBoot";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useFizrukSqliteReadBoot", () => {
  it("does not boot while the session is still resolving", () => {
    useAuthMock.mockReturnValue({ user: null, status: "loading" });
    renderHook(() => useFizrukSqliteReadBoot());
    expect(bootMock).not.toHaveBeenCalled();
  });

  it("boots once and notifies the cache gate when the path activates", async () => {
    useAuthMock.mockReturnValue({ user: { id: "u1" } });
    bootMock.mockResolvedValue(true);

    const { rerender } = renderHook(() => useFizrukSqliteReadBoot());
    await waitFor(() => {
      expect(bootMock).toHaveBeenCalledWith("u1");
    });
    await waitFor(() => {
      expect(notifyMock).toHaveBeenCalled();
    });

    // Re-render must not re-boot (ref-guarded).
    rerender();
    expect(bootMock).toHaveBeenCalledTimes(1);
  });

  // Контракт ІНВЕРТОВАНО 2026-09-14, і це навмисно. Тест раніше вимагав
  // «не повідомляти, коли бут повернув false» — тобто мовчати саме тоді,
  // коли щось пішло не так. Поки на сигнал підписувались лише споживачі
  // кешу, мовчання було правильним: оновлювати нічого. Але скелетон
  // дашборда Фізрука тепер тримається на «бут у польоті», і без сигналу
  // про невдачу людина лишалась би дивитись на нього до перезавантаження
  // (знахідка PR-Z9, домір 2026-09-14). Ціна інверсії — один зайвий
  // ре-рендер споживачів на порожньому кеші.
  it("повідомляє НАВІТЬ коли бут повернув false — інакше скелетон вічний", async () => {
    useAuthMock.mockReturnValue({ user: { id: "u2" } });
    bootMock.mockResolvedValue(false);

    renderHook(() => useFizrukSqliteReadBoot());
    await waitFor(() => {
      expect(bootMock).toHaveBeenCalledWith("u2");
    });
    await waitFor(() => {
      expect(notifyMock).toHaveBeenCalled();
    });
  });

  it("політ завершується і при провалі бута", async () => {
    // Парний до попереднього і важливіший за нього: саме цей прапорець
    // гасить скелетон. Якби `settle()` стояв у `.then()` замість
    // `.finally()`, відхилення промісу лишило б його піднятим назавжди.
    useAuthMock.mockReturnValue({ user: { id: "u3" } });
    bootMock.mockRejectedValue(new Error("sqlite недоступний"));
    // Стежимо за `logger.warn`, а не за `console.warn`: логер у проді йде
    // в breadcrumb і консолі не торкається взагалі, тож перевірка через
    // консоль пінила б лише dev-гілку транспорту.
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

    renderHook(() => useFizrukSqliteReadBoot());
    await waitFor(() => {
      expect(isFizrukReadBootInFlight()).toBe(false);
    });

    // І відхилення має бути ОПРАЦЬОВАНЕ, а не просто пережите: `.finally`
    // його не гасить, тож без `catch` браузер отримував би
    // `unhandledrejection` (і подію в Sentry) на кожному провалі бута.
    // Цей рядок падав би, хоч прапорець і скидався правильно.
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
