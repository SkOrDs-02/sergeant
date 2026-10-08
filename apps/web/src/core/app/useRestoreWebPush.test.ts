/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const restoreMock = vi.hoisted(() => vi.fn());
vi.mock("@shared/hooks/restoreWebPushSubscription", () => ({
  restoreWebPushSubscriptionIfLost: restoreMock,
}));

import { useRestoreWebPush } from "./useRestoreWebPush";

describe("useRestoreWebPush", () => {
  beforeEach(() => {
    restoreMock.mockReset();
    restoreMock.mockResolvedValue("not-needed");
  });

  it("не звертається до сервера без сесії (register вимагає авторизації)", () => {
    renderHook(() => useRestoreWebPush(null));
    renderHook(() => useRestoreWebPush(undefined));
    expect(restoreMock).not.toHaveBeenCalled();
  });

  it("перевіряє підписку один раз на користувача", () => {
    const { rerender } = renderHook(({ id }) => useRestoreWebPush(id), {
      initialProps: { id: "u1" as string | null },
    });
    rerender({ id: "u1" });
    expect(restoreMock).toHaveBeenCalledTimes(1);
    rerender({ id: "u2" });
    expect(restoreMock).toHaveBeenCalledTimes(2);
  });
});
