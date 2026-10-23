// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const show = vi.fn(async () => undefined);
vi.mock("@shared/hooks/useModuleReminder", () => ({
  showReminderNotification: (...args: unknown[]) => show(...(args as [])),
}));

import {
  notifyRestFinishedIfHidden,
  REST_NOTIFICATION_TAG,
} from "./restTimerNotification";

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

function setPermission(permission: NotificationPermission | null) {
  if (permission === null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).Notification;
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Notification = { permission };
}

describe("notifyRestFinishedIfHidden (logic-10)", () => {
  beforeEach(() => show.mockClear());
  afterEach(() => {
    setPermission(null);
    setVisibility("visible");
  });

  it("shows a local notification when the tab is hidden and permission is granted", () => {
    setVisibility("hidden");
    setPermission("granted");
    expect(notifyRestFinishedIfHidden()).toBe(true);
    expect(show).toHaveBeenCalledWith(
      "Відпочинок завершено",
      "Час для наступного підходу",
      REST_NOTIFICATION_TAG,
    );
  });

  it("stays silent on a visible page: the sound is the cue there", () => {
    setVisibility("visible");
    setPermission("granted");
    expect(notifyRestFinishedIfHidden()).toBe(false);
    expect(show).not.toHaveBeenCalled();
  });

  it("never asks for permission and stays silent unless it is already granted", () => {
    setVisibility("hidden");
    for (const p of ["default", "denied"] as const) {
      setPermission(p);
      expect(notifyRestFinishedIfHidden()).toBe(false);
    }
    setPermission(null);
    expect(notifyRestFinishedIfHidden()).toBe(false);
    expect(show).not.toHaveBeenCalled();
  });
});
