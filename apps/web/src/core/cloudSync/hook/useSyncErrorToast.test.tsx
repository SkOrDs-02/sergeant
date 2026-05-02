/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ToastApi, ToastAction } from "@shared/hooks/useToast";
import type { SyncError } from "../types";
import {
  SYNC_ERROR_TOAST_DURATION_MS,
  useSyncErrorToast,
  userFacingSyncErrorMessage,
} from "./useSyncErrorToast";

interface ErrorCall {
  msg: unknown;
  duration: number | undefined;
  action: ToastAction | undefined;
  id: number;
}

interface MockToast extends ToastApi {
  readonly _errorCalls: readonly ErrorCall[];
  readonly _dismissed: readonly number[];
}

function makeToast(): MockToast {
  let nextId = 0;
  const calls: ErrorCall[] = [];
  const dismissed: number[] = [];
  const api: ToastApi = {
    show: vi.fn(() => -1),
    success: vi.fn(() => -1),
    info: vi.fn(() => -1),
    warning: vi.fn(() => -1),
    error: vi.fn((msg, duration, action) => {
      const id = ++nextId;
      calls.push({ msg, duration, action, id });
      return id;
    }),
    dismiss: vi.fn((id: number) => {
      dismissed.push(id);
    }),
  };
  Object.defineProperty(api, "_errorCalls", {
    get: () => calls,
    enumerable: true,
  });
  Object.defineProperty(api, "_dismissed", {
    get: () => dismissed,
    enumerable: true,
  });
  return api as MockToast;
}

const NETWORK_ERR: SyncError = {
  message: "fetch failed",
  type: "network",
  retryable: true,
};
const SERVER_5XX: SyncError = {
  message: "HTTP 502",
  type: "server",
  retryable: true,
};
const SERVER_4XX: SyncError = {
  message: "HTTP 401",
  type: "server",
  retryable: false,
};

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

describe("userFacingSyncErrorMessage", () => {
  it("returns network copy for network errors", () => {
    expect(userFacingSyncErrorMessage(NETWORK_ERR)).toMatch(/з'єднання/);
  });

  it("returns retry copy for retryable server errors (5xx)", () => {
    expect(userFacingSyncErrorMessage(SERVER_5XX)).toMatch(/тимчасово/);
  });

  it("returns non-retry copy for non-retryable server errors (4xx)", () => {
    const msg = userFacingSyncErrorMessage(SERVER_4XX);
    expect(msg).toMatch(/Передивись/);
    expect(msg).not.toMatch(/Спробуй ще раз/);
  });
});

describe("useSyncErrorToast", () => {
  beforeEach(() => {
    setOnline(true);
  });
  afterEach(() => {
    setOnline(true);
  });

  it("does not fire on initial null error", () => {
    const toast = makeToast();
    renderHook(() => useSyncErrorToast(null, toast, () => {}));
    expect(toast._errorCalls).toHaveLength(0);
  });

  it("fires once when transitioning null → error (retryable)", () => {
    const toast = makeToast();
    const onRetry = vi.fn();
    const { rerender } = renderHook(
      ({ err }: { err: SyncError | null }) =>
        useSyncErrorToast(err, toast, onRetry),
      { initialProps: { err: null as SyncError | null } },
    );

    rerender({ err: NETWORK_ERR });

    expect(toast._errorCalls).toHaveLength(1);
    const [call] = toast._errorCalls;
    expect(call.duration).toBe(SYNC_ERROR_TOAST_DURATION_MS);
    expect(call.action?.label).toBe("Спробувати ще");

    call.action?.onClick();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("does not attach a retry CTA when error is non-retryable", () => {
    const toast = makeToast();
    const { rerender } = renderHook(
      ({ err }: { err: SyncError | null }) =>
        useSyncErrorToast(err, toast, () => {}),
      { initialProps: { err: null as SyncError | null } },
    );

    rerender({ err: SERVER_4XX });

    expect(toast._errorCalls).toHaveLength(1);
    expect(toast._errorCalls[0].action).toBeUndefined();
  });

  it("does not re-fire when the same error stays in place", () => {
    const toast = makeToast();
    const { rerender } = renderHook(
      ({ err }: { err: SyncError | null }) =>
        useSyncErrorToast(err, toast, () => {}),
      { initialProps: { err: null as SyncError | null } },
    );

    rerender({ err: NETWORK_ERR });
    rerender({ err: { ...NETWORK_ERR } }); // new ref, same message
    rerender({ err: { ...NETWORK_ERR } });

    expect(toast._errorCalls).toHaveLength(1);
  });

  it("dismisses the previous toast and fires a new one when the error message changes", () => {
    const toast = makeToast();
    const { rerender } = renderHook(
      ({ err }: { err: SyncError | null }) =>
        useSyncErrorToast(err, toast, () => {}),
      { initialProps: { err: null as SyncError | null } },
    );

    rerender({ err: NETWORK_ERR });
    rerender({ err: SERVER_5XX });

    expect(toast._errorCalls).toHaveLength(2);
    expect(toast._dismissed).toEqual([toast._errorCalls[0].id]);
  });

  it("re-fires after the error clears and a new failure arrives", () => {
    const toast = makeToast();
    const { rerender } = renderHook(
      ({ err }: { err: SyncError | null }) =>
        useSyncErrorToast(err, toast, () => {}),
      { initialProps: { err: null as SyncError | null } },
    );

    rerender({ err: NETWORK_ERR });
    rerender({ err: null });
    rerender({ err: NETWORK_ERR }); // same message, but cleared in between

    expect(toast._errorCalls).toHaveLength(2);
  });

  it("suppresses the toast while the device is offline (OfflineBanner owns that signal)", () => {
    setOnline(false);
    const toast = makeToast();
    const { rerender } = renderHook(
      ({ err }: { err: SyncError | null }) =>
        useSyncErrorToast(err, toast, () => {}),
      { initialProps: { err: null as SyncError | null } },
    );

    rerender({ err: NETWORK_ERR });

    expect(toast._errorCalls).toHaveLength(0);

    setOnline(true);
    rerender({ err: NETWORK_ERR });
    expect(toast._errorCalls).toHaveLength(1);
  });
});
