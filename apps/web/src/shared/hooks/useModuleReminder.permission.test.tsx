// @vitest-environment jsdom
/**
 * Tests for the notification-permission helpers exported alongside
 * `useModuleReminder`: `useNotificationPermission`,
 * `requestNotificationPermission`, and `showReminderNotification`.
 *
 * The core scheduler is covered by `useModuleReminder.test.ts`; this file
 * targets the permission/SW-show branches it doesn't exercise.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@shared/lib", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  useNotificationPermission,
  requestNotificationPermission,
  showReminderNotification,
} from "./useModuleReminder";

function stubNotification(
  permission: NotificationPermission,
  requestImpl?: () => Promise<NotificationPermission>,
): void {
  const ctor = vi.fn() as unknown as typeof Notification;
  Object.defineProperty(ctor, "permission", {
    configurable: true,
    value: permission,
  });
  Object.defineProperty(ctor, "requestPermission", {
    configurable: true,
    value: requestImpl ?? vi.fn().mockResolvedValue(permission),
  });
  vi.stubGlobal("Notification", ctor);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useNotificationPermission", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: {
        query: vi.fn().mockResolvedValue({
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }),
      },
    });
  });

  it("reports 'unsupported' when Notification is absent", () => {
    vi.stubGlobal("Notification", undefined);
    const { result } = renderHook(() => useNotificationPermission());
    expect(result.current).toBe("unsupported");
  });

  it("reflects the current granted permission", async () => {
    stubNotification("granted");
    const { result } = renderHook(() => useNotificationPermission());
    await waitFor(() => expect(result.current).toBe("granted"));
  });

  it("reflects a denied permission", async () => {
    stubNotification("denied");
    const { result } = renderHook(() => useNotificationPermission());
    await waitFor(() => expect(result.current).toBe("denied"));
  });
});

describe("requestNotificationPermission", () => {
  it("returns 'unsupported' without Notification", async () => {
    vi.stubGlobal("Notification", undefined);
    await expect(requestNotificationPermission()).resolves.toBe("unsupported");
  });

  it("short-circuits when already granted", async () => {
    const request = vi.fn();
    stubNotification("granted", request);
    await expect(requestNotificationPermission()).resolves.toBe("granted");
    expect(request).not.toHaveBeenCalled();
  });

  it("short-circuits when already denied", async () => {
    stubNotification("denied");
    await expect(requestNotificationPermission()).resolves.toBe("denied");
  });

  it("prompts when permission is default", async () => {
    const request = vi.fn().mockResolvedValue("granted");
    stubNotification("default", request);
    await expect(requestNotificationPermission()).resolves.toBe("granted");
    expect(request).toHaveBeenCalled();
  });

  it("returns 'denied' if requestPermission throws", async () => {
    const request = vi.fn().mockRejectedValue(new Error("nope"));
    stubNotification("default", request);
    await expect(requestNotificationPermission()).resolves.toBe("denied");
  });
});

describe("showReminderNotification", () => {
  it("prefers the service-worker registration", async () => {
    const showNotification = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { ready: Promise.resolve({ showNotification }) },
    });
    await showReminderNotification("Title", "Body", "tag-1");
    expect(showNotification).toHaveBeenCalledWith(
      "Title",
      expect.objectContaining({ body: "Body", tag: "tag-1" }),
    );
  });

  it("falls back to the Notification ctor when SW is unavailable", async () => {
    // remove serviceWorker so the SW branch is skipped
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: undefined,
    });
    const ctor = vi.fn() as unknown as typeof Notification;
    vi.stubGlobal("Notification", ctor);
    await showReminderNotification("T", "B", "tag");
    expect(ctor).toHaveBeenCalledWith(
      "T",
      expect.objectContaining({ body: "B", tag: "tag" }),
    );
  });
});
