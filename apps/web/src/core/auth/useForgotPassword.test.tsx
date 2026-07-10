// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const requestPasswordResetMock = vi.fn();
const setAuthErrorMock = vi.fn();

vi.mock("./AuthContext", () => ({
  useAuth: () => ({
    requestPasswordReset: requestPasswordResetMock,
    setAuthError: setAuthErrorMock,
  }),
}));

import { useForgotPassword } from "./useForgotPassword";

beforeEach(() => {
  requestPasswordResetMock.mockReset();
  setAuthErrorMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useForgotPassword", () => {
  it("toggles panel via openPanel and prefills email", () => {
    const { result } = renderHook(() => useForgotPassword());

    act(() => {
      result.current.openPanel("prefill@example.com");
    });
    expect(result.current.showForgot).toBe(true);
    expect(result.current.forgotEmail).toBe("prefill@example.com");
    expect(setAuthErrorMock).toHaveBeenCalledWith(null);

    act(() => {
      result.current.openPanel("other@example.com");
    });
    expect(result.current.showForgot).toBe(false);
  });

  it("closePanel resets state and clears auth error", () => {
    const { result } = renderHook(() => useForgotPassword());

    act(() => {
      result.current.openPanel("user@example.com");
    });
    act(() => {
      result.current.closePanel();
    });

    expect(result.current.showForgot).toBe(false);
    expect(result.current.forgotState).toBe("idle");
    expect(setAuthErrorMock).toHaveBeenCalledWith(null);
  });

  it("sets auth error when submit called with empty email", async () => {
    const { result } = renderHook(() => useForgotPassword());

    await act(async () => {
      await result.current.submit();
    });

    expect(setAuthErrorMock).toHaveBeenCalledWith(
      "Введи email, на який відправити лист.",
    );
    expect(requestPasswordResetMock).not.toHaveBeenCalled();
  });

  it("transitions to sent on successful reset request", async () => {
    requestPasswordResetMock.mockResolvedValue(true);
    const { result } = renderHook(() => useForgotPassword());

    act(() => {
      result.current.setForgotEmail("alice@example.com");
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(requestPasswordResetMock).toHaveBeenCalledWith("alice@example.com");
    expect(result.current.forgotState).toBe("sent");
  });

  it("returns to idle when reset request fails", async () => {
    requestPasswordResetMock.mockResolvedValue(false);
    const { result } = renderHook(() => useForgotPassword());

    act(() => {
      result.current.setForgotEmail("alice@example.com");
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.forgotState).toBe("idle");
  });

  it("auto-closes panel 6s after successful send", async () => {
    vi.useFakeTimers();
    try {
      requestPasswordResetMock.mockResolvedValue(true);
      const { result } = renderHook(() => useForgotPassword());

      act(() => {
        result.current.openPanel("");
        result.current.setForgotEmail("alice@example.com");
      });

      await act(async () => {
        await result.current.submit();
      });

      await vi.waitFor(() => {
        expect(result.current.forgotState).toBe("sent");
      });

      act(() => {
        vi.advanceTimersByTime(6000);
      });

      await vi.waitFor(() => {
        expect(result.current.showForgot).toBe(false);
        expect(result.current.forgotState).toBe("idle");
      });
      expect(setAuthErrorMock).toHaveBeenCalledWith(null);
    } finally {
      vi.useRealTimers();
    }
  });
});
