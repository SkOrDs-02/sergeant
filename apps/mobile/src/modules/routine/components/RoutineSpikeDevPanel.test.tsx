/**
 * Smoke + behaviour tests for the mobile `RoutineSpikeDevPanel`.
 *
 * Mirrors the web suite at
 * `apps/web/src/modules/routine/components/RoutineSpikeDevPanel.test.tsx`
 * — bootstrap is injected via the `bootstrap` prop so jest doesn't have
 * to spin up real `expo-sqlite` / OPFS-VFS on the host.
 */

import {
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react-native";
import { ApiClientProvider } from "@sergeant/api-client/react";
import { createApiClient } from "@sergeant/api-client";

import type { SpikeSqliteClient } from "../lib/sqliteSpike";
import { _getMMKVInstance } from "@/lib/storage";

const mocks = {
  recordRoutineCompletion: jest.fn(),
  deleteRoutineCompletion: jest.fn(),
  pushPendingOutbox: jest.fn(),
  pullSince: jest.fn(),
  listPendingOutboxOps: jest.fn(),
  listActiveRoutineEntries: jest.fn(),
  migrateRoutineSpike: jest.fn(),
  createExpoSqliteRawClient: jest.fn(),
};

jest.mock("../lib/sqliteSpike", () => ({
  __esModule: true,
  recordRoutineCompletion: (...args: unknown[]) =>
    mocks.recordRoutineCompletion(...args),
  deleteRoutineCompletion: (...args: unknown[]) =>
    mocks.deleteRoutineCompletion(...args),
  pushPendingOutbox: (...args: unknown[]) => mocks.pushPendingOutbox(...args),
  pullSince: (...args: unknown[]) => mocks.pullSince(...args),
  listPendingOutboxOps: (...args: unknown[]) =>
    mocks.listPendingOutboxOps(...args),
  listActiveRoutineEntries: (...args: unknown[]) =>
    mocks.listActiveRoutineEntries(...args),
  migrateRoutineSpike: (...args: unknown[]) =>
    mocks.migrateRoutineSpike(...args),
  createExpoSqliteRawClient: (...args: unknown[]) =>
    mocks.createExpoSqliteRawClient(...args),
}));

import { RoutineSpikeDevPanel } from "./RoutineSpikeDevPanel";

const fakeClient: SpikeSqliteClient = {
  exec: jest.fn(),
  run: jest.fn(),
  all: jest.fn(),
} as unknown as SpikeSqliteClient;

const apiClient = createApiClient({ baseUrl: "http://localhost" });

function bootstrapOk() {
  return Promise.resolve({
    client: fakeClient,
    info: { database: "sergeant.db", engine: "expo-sqlite" as const },
  });
}

function bootstrapFail() {
  return Promise.reject(new Error("expo-sqlite open failed"));
}

function renderPanel(
  bootstrap: () => Promise<{
    client: SpikeSqliteClient;
    info: { database: string; engine: "expo-sqlite" };
  }>,
) {
  return render(
    <ApiClientProvider client={apiClient}>
      <RoutineSpikeDevPanel bootstrap={bootstrap} />
    </ApiClientProvider>,
  );
}

describe("RoutineSpikeDevPanel (mobile)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _getMMKVInstance().clearAll();
    mocks.listPendingOutboxOps.mockResolvedValue([]);
    mocks.recordRoutineCompletion.mockResolvedValue({ idempotencyKey: "k-1" });
    mocks.deleteRoutineCompletion.mockResolvedValue({ idempotencyKey: "k-2" });
    mocks.pushPendingOutbox.mockResolvedValue({
      attempted: 1,
      applied: 1,
      duplicates: 0,
      rejected: 0,
      lastOpId: 7,
    });
    mocks.pullSince.mockResolvedValue({ applied: 2, conflicts: 0, cursor: 7 });
    mocks.listActiveRoutineEntries.mockResolvedValue([]);
    mocks.migrateRoutineSpike.mockResolvedValue(undefined);
  });

  it("disables action buttons until init succeeds", async () => {
    const { getByTestId } = renderPanel(bootstrapOk);
    const recordBtn = getByTestId("routine-spike-action-record");
    expect(recordBtn.props.accessibilityState?.disabled).toBe(true);

    fireEvent.press(getByTestId("routine-spike-init"));

    await waitFor(() => {
      expect(
        getByTestId("routine-spike-action-record").props.accessibilityState
          ?.disabled,
      ).toBe(false);
    });
    expect(
      getByTestId("routine-spike-action-push").props.accessibilityState
        ?.disabled,
    ).toBe(false);
  });

  it("shows runtime info from the bootstrap result", async () => {
    const { getByTestId, getByText } = renderPanel(bootstrapOk);
    fireEvent.press(getByTestId("routine-spike-init"));
    await waitFor(() => {
      expect(getByText("sergeant.db")).toBeTruthy();
    });
    expect(getByText("expo-sqlite")).toBeTruthy();
  });

  it("surfaces bootstrap errors without enabling actions", async () => {
    const { getByTestId } = renderPanel(bootstrapFail);
    fireEvent.press(getByTestId("routine-spike-init"));
    await waitFor(() => {
      expect(getByTestId("routine-spike-init-error").props.children).toBe(
        "expo-sqlite open failed",
      );
    });
    expect(
      getByTestId("routine-spike-action-record").props.accessibilityState
        ?.disabled,
    ).toBe(true);
  });

  it("records a completion and shows a log line with detail", async () => {
    const { getByTestId } = renderPanel(bootstrapOk);
    fireEvent.press(getByTestId("routine-spike-init"));
    await waitFor(() => {
      expect(
        getByTestId("routine-spike-action-record").props.accessibilityState
          ?.disabled,
      ).toBe(false);
    });

    fireEvent.press(getByTestId("routine-spike-action-record"));

    await waitFor(() => {
      expect(mocks.recordRoutineCompletion).toHaveBeenCalledTimes(1);
    });
    const args = mocks.recordRoutineCompletion.mock.calls[0]![1] as {
      userId: string;
      name: string;
    };
    expect(args.userId).toBe("spike-dev-user");
    expect(args.name).toBe("SPIKE dev habit");

    // Scope to the log container — the action label also appears on
    // the button itself, so a global `findByText` would match twice.
    const log = getByTestId("routine-spike-log");
    await waitFor(() =>
      expect(within(log).getByText("Запис тренування (insert)")).toBeTruthy(),
    );
    expect(within(log).getByText(/pending=0/)).toBeTruthy();
  });

  it("forwards the originDeviceId to push and pull", async () => {
    const { getByTestId } = renderPanel(bootstrapOk);
    fireEvent.press(getByTestId("routine-spike-init"));
    await waitFor(() => {
      expect(
        getByTestId("routine-spike-action-push").props.accessibilityState
          ?.disabled,
      ).toBe(false);
    });

    const deviceIdNode = getByTestId("routine-spike-origin-device-id");
    const deviceId = deviceIdNode.props.children as string;
    expect(typeof deviceId).toBe("string");
    expect(deviceId.length).toBeGreaterThan(0);

    fireEvent.press(getByTestId("routine-spike-action-push"));
    await waitFor(() =>
      expect(mocks.pushPendingOutbox).toHaveBeenCalledTimes(1),
    );
    expect(mocks.pushPendingOutbox.mock.calls[0]![2]).toEqual({
      originDeviceId: deviceId,
    });

    fireEvent.press(getByTestId("routine-spike-action-pull"));
    await waitFor(() => expect(mocks.pullSince).toHaveBeenCalledTimes(1));
    expect(mocks.pullSince.mock.calls[0]![2]).toEqual({
      originDeviceId: deviceId,
    });
  });

  it("logs an error when delete is invoked without a recorded entry", async () => {
    const { getByTestId } = renderPanel(bootstrapOk);
    fireEvent.press(getByTestId("routine-spike-init"));
    await waitFor(() => {
      expect(
        getByTestId("routine-spike-action-delete").props.accessibilityState
          ?.disabled,
      ).toBe(false);
    });

    fireEvent.press(getByTestId("routine-spike-action-delete"));
    const log = getByTestId("routine-spike-log");
    await waitFor(() =>
      expect(within(log).getByText(/Спочатку додай запис/)).toBeTruthy(),
    );
    expect(mocks.deleteRoutineCompletion).not.toHaveBeenCalled();
  });

  it("rotates the originDeviceId on demand", async () => {
    const { getByTestId } = renderPanel(bootstrapOk);
    const initial = getByTestId("routine-spike-origin-device-id").props
      .children as string;
    fireEvent.press(getByTestId("routine-spike-rotate-device-id"));
    await waitFor(() => {
      expect(
        getByTestId("routine-spike-origin-device-id").props.children as string,
      ).not.toBe(initial);
    });
  });
});
