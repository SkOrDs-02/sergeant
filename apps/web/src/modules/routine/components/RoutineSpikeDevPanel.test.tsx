// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ApiClientProvider } from "@sergeant/api-client/react";
import { createApiClient } from "@sergeant/api-client";

import type { SpikeSqliteClient } from "../lib/sqliteSpike";

const {
  recordRoutineCompletion,
  deleteRoutineCompletion,
  pushPendingOutbox,
  pullSince,
  listPendingOutboxOps,
  listActiveRoutineEntries,
  migrateRoutineSpike,
} = vi.hoisted(() => ({
  recordRoutineCompletion: vi.fn(),
  deleteRoutineCompletion: vi.fn(),
  pushPendingOutbox: vi.fn(),
  pullSince: vi.fn(),
  listPendingOutboxOps: vi.fn(),
  listActiveRoutineEntries: vi.fn(),
  migrateRoutineSpike: vi.fn(),
}));

vi.mock("../lib/sqliteSpike", () => ({
  recordRoutineCompletion,
  deleteRoutineCompletion,
  pushPendingOutbox,
  pullSince,
  listPendingOutboxOps,
  listActiveRoutineEntries,
  migrateRoutineSpike,
}));

import { RoutineSpikeDevPanel } from "./RoutineSpikeDevPanel";

const fakeClient: SpikeSqliteClient = {
  exec: vi.fn(),
  run: vi.fn(),
  all: vi.fn(),
} as unknown as SpikeSqliteClient;

const apiClient = createApiClient({ baseUrl: "http://localhost" });

function bootstrapOk() {
  return Promise.resolve({
    client: fakeClient,
    vfs: { vfs: "memory", crossOriginIsolated: false },
  });
}

function bootstrapFail() {
  return Promise.reject(new Error("opfs blew up"));
}

function renderPanel(
  bootstrap: () => Promise<{
    client: SpikeSqliteClient;
    vfs: { vfs: string; crossOriginIsolated: boolean };
  }>,
) {
  return render(
    <ApiClientProvider client={apiClient}>
      <RoutineSpikeDevPanel bootstrap={bootstrap} />
    </ApiClientProvider>,
  );
}

describe("RoutineSpikeDevPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    listPendingOutboxOps.mockResolvedValue([]);
    recordRoutineCompletion.mockResolvedValue({ idempotencyKey: "k-1" });
    deleteRoutineCompletion.mockResolvedValue({ idempotencyKey: "k-2" });
    pushPendingOutbox.mockResolvedValue({
      attempted: 1,
      applied: 1,
      duplicates: 0,
      rejected: 0,
      lastOpId: 7,
    });
    pullSince.mockResolvedValue({ applied: 2, conflicts: 0, cursor: 7 });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("disables action buttons until init succeeds", async () => {
    renderPanel(bootstrapOk);
    const recordBtn = screen.getByTestId("routine-spike-action-record");
    expect(recordBtn).toBeDisabled();

    fireEvent.click(screen.getByTestId("routine-spike-init"));
    await waitFor(() => {
      expect(screen.getByTestId("routine-spike-action-record")).toBeEnabled();
    });
    expect(screen.getByTestId("routine-spike-action-push")).toBeEnabled();
  });

  it("shows VFS info from the bootstrap result", async () => {
    renderPanel(bootstrapOk);
    fireEvent.click(screen.getByTestId("routine-spike-init"));
    await waitFor(() => {
      expect(screen.getByText("memory")).toBeTruthy();
    });
    // crossOriginIsolated rendered as boolean string
    expect(screen.getByText("false")).toBeTruthy();
  });

  it("surfaces bootstrap errors without enabling actions", async () => {
    renderPanel(bootstrapFail);
    fireEvent.click(screen.getByTestId("routine-spike-init"));
    await waitFor(() => {
      expect(screen.getByTestId("routine-spike-init-error").textContent).toBe(
        "opfs blew up",
      );
    });
    expect(screen.getByTestId("routine-spike-action-record")).toBeDisabled();
  });

  it("records a completion and shows a log line with detail", async () => {
    renderPanel(bootstrapOk);
    fireEvent.click(screen.getByTestId("routine-spike-init"));
    await waitFor(() =>
      expect(screen.getByTestId("routine-spike-action-record")).toBeEnabled(),
    );

    fireEvent.click(screen.getByTestId("routine-spike-action-record"));

    await waitFor(() => {
      expect(recordRoutineCompletion).toHaveBeenCalledTimes(1);
    });
    const args = recordRoutineCompletion.mock.calls[0]![1] as {
      userId: string;
      name: string;
    };
    expect(args.userId).toBe("spike-dev-user");
    expect(args.name).toBe("SPIKE dev habit");

    await waitFor(() => {
      const log = screen.getByTestId("routine-spike-log");
      expect(log.textContent).toContain("Запис тренування");
      expect(log.textContent).toContain("pending=0");
    });
  });

  it("forwards the originDeviceId to push and pull", async () => {
    renderPanel(bootstrapOk);
    fireEvent.click(screen.getByTestId("routine-spike-init"));
    await waitFor(() =>
      expect(screen.getByTestId("routine-spike-action-push")).toBeEnabled(),
    );

    const deviceId = screen.getByTestId(
      "routine-spike-origin-device-id",
    ).textContent;
    expect(deviceId && deviceId.length > 0).toBe(true);

    fireEvent.click(screen.getByTestId("routine-spike-action-push"));
    await waitFor(() => expect(pushPendingOutbox).toHaveBeenCalledTimes(1));
    expect(pushPendingOutbox.mock.calls[0]![2]).toEqual({
      originDeviceId: deviceId,
    });

    fireEvent.click(screen.getByTestId("routine-spike-action-pull"));
    await waitFor(() => expect(pullSince).toHaveBeenCalledTimes(1));
    expect(pullSince.mock.calls[0]![2]).toEqual({ originDeviceId: deviceId });
  });

  it("logs an error when delete is invoked without a recorded entry", async () => {
    renderPanel(bootstrapOk);
    fireEvent.click(screen.getByTestId("routine-spike-init"));
    await waitFor(() =>
      expect(screen.getByTestId("routine-spike-action-delete")).toBeEnabled(),
    );

    fireEvent.click(screen.getByTestId("routine-spike-action-delete"));
    await waitFor(() => {
      const log = screen.getByTestId("routine-spike-log");
      expect(log.textContent).toContain("Спочатку додай запис");
    });
    expect(deleteRoutineCompletion).not.toHaveBeenCalled();
  });

  it("rotates the originDeviceId on demand", async () => {
    renderPanel(bootstrapOk);
    const initial = screen.getByTestId(
      "routine-spike-origin-device-id",
    ).textContent;
    fireEvent.click(screen.getByText("rotate"));
    await waitFor(() => {
      expect(
        screen.getByTestId("routine-spike-origin-device-id").textContent,
      ).not.toBe(initial);
    });
  });
});
