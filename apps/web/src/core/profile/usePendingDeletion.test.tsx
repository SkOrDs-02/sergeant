// @vitest-environment jsdom
/**
 * `usePendingDeletion` (аудит 2026-10-01, logic-01): для акаунта у вікні
 * видалення `GET /api/me` віддає 403, тож `user` порожній. Хук мусить
 * вмикатись за наявності сесії (`pendingDeletion` з AuthContext), а не лише
 * за `user`, інакше екран відновлення недосяжний.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const deletionStatusMock = vi.fn();
vi.mock("@shared/api", () => ({
  meApi: { deletionStatus: () => deletionStatusMock() },
}));

const authRef: {
  user: { id: string } | null;
  pendingDeletion: { scheduledPurgeAt: string | null } | null;
  refresh: () => Promise<void>;
} = {
  user: null,
  pendingDeletion: null,
  refresh: vi.fn(async () => undefined),
};
vi.mock("../auth/AuthContext", () => ({ useAuth: () => authRef }));

import { usePendingDeletion } from "./usePendingDeletion";

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return Wrapper;
}

describe("usePendingDeletion", () => {
  beforeEach(() => {
    deletionStatusMock.mockReset();
    authRef.user = null;
    authRef.pendingDeletion = null;
    authRef.refresh = vi.fn(async () => undefined);
  });

  it("без сесії не питає сервер і вікно не відкрите", () => {
    const { result } = renderHook(() => usePendingDeletion(), {
      wrapper: wrapper(),
    });
    expect(deletionStatusMock).not.toHaveBeenCalled();
    expect(result.current.isPending).toBe(false);
  });

  it("із pendingDeletion (user = null) питає deletion-status і одразу показує дату з 403", async () => {
    authRef.pendingDeletion = { scheduledPurgeAt: "2026-10-31T10:00:00.000Z" };
    deletionStatusMock.mockResolvedValue({
      pending: true,
      requestedAt: "2026-10-01T10:00:00.000Z",
      scheduledPurgeAt: "2026-10-31T10:00:00.000Z",
    });
    const { result } = renderHook(() => usePendingDeletion(), {
      wrapper: wrapper(),
    });
    // До відповіді вікно вже відкрите, дата з тіла 403.
    expect(result.current.isPending).toBe(true);
    expect(result.current.scheduledPurgeAt).toBe("2026-10-31T10:00:00.000Z");
    await waitFor(() => expect(deletionStatusMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(result.current.requestedAt).toBe("2026-10-01T10:00:00.000Z"),
    );
  });

  it("403 на me авторитетніший за застарілий deletion-status `pending: false`, але me перепитується", async () => {
    authRef.pendingDeletion = { scheduledPurgeAt: "2026-10-31T10:00:00.000Z" };
    deletionStatusMock.mockResolvedValue({ pending: false });
    const { result } = renderHook(() => usePendingDeletion(), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(authRef.refresh).toHaveBeenCalledTimes(1));
    expect(result.current.isPending).toBe(true);
  });

  it("звичайна сесія: вікно відкрите лише за pending: true", async () => {
    authRef.user = { id: "u-1" };
    deletionStatusMock.mockResolvedValue({ pending: false });
    const { result } = renderHook(() => usePendingDeletion(), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(deletionStatusMock).toHaveBeenCalled());
    expect(result.current.isPending).toBe(false);
    expect(authRef.refresh).not.toHaveBeenCalled();
  });
});
