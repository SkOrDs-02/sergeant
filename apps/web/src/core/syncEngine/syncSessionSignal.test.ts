import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __resetSyncSessionSignalForTests,
  observeSyncSession,
  readSyncSessionMissing,
  subscribeSyncSessionMissing,
} from "./syncSessionSignal";

afterEach(() => {
  __resetSyncSessionSignalForTests();
});

describe("observeSyncSession (sec-18)", () => {
  it("повертає userId і не ставить сигнал, коли сесія жива", () => {
    expect(
      observeSyncSession({ data: { user: { id: "u1" } }, error: null }),
    ).toBe("u1");
    expect(readSyncSessionMissing()).toBe(false);
  });

  it("`data: null` без помилки — сесії немає: сигнал стоїть, userId null", () => {
    expect(observeSyncSession({ data: null, error: null })).toBeNull();
    expect(readSyncSessionMissing()).toBe(true);
  });

  it.each([401, 403])(
    "статус %i від get-session теж означає «немає»",
    (status) => {
      expect(observeSyncSession({ data: null, error: { status } })).toBeNull();
      expect(readSyncSessionMissing()).toBe(true);
    },
  );

  it("офлайн/5xx (помилка без 401/403) нічого не каже про сесію і стан не міняє", () => {
    expect(observeSyncSession({ data: null, error: { status: 0 } })).toBeNull();
    expect(
      observeSyncSession({ data: null, error: { status: 503 } }),
    ).toBeNull();
    expect(readSyncSessionMissing()).toBe(false);

    observeSyncSession({ data: null, error: null });
    expect(readSyncSessionMissing()).toBe(true);
    // Збій мережі ПІСЛЯ підтвердженого «немає» не скидає сигнал.
    observeSyncSession({ data: null, error: { status: 0 } });
    expect(readSyncSessionMissing()).toBe(true);
  });

  it("живе спостереження знімає сигнал і повідомляє підписників лише на зміні", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSyncSessionMissing(listener);

    observeSyncSession({ data: null, error: null });
    observeSyncSession({ data: null, error: null });
    expect(listener).toHaveBeenCalledTimes(1);

    observeSyncSession({ data: { user: { id: "u1" } }, error: null });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(readSyncSessionMissing()).toBe(false);

    unsubscribe();
    observeSyncSession({ data: null, error: null });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
