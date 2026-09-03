/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RejectedOutboxRow } from "@sergeant/db-schema/sqlite";

const listRejected = vi.fn<() => Promise<readonly RejectedOutboxRow[]>>();
const runtimeRef: { value: { listRejected: typeof listRejected } | null } = {
  value: { listRejected },
};

vi.mock("../syncEngine/singleton", () => ({
  getSyncEngineWriter: () => runtimeRef.value,
}));

import { SyncRejectedList, describeRejectedRow } from "./SyncRejectedList";

function renderList() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SyncRejectedList />
    </QueryClientProvider>,
  );
}

const row = (over: Partial<RejectedOutboxRow>): RejectedOutboxRow => ({
  id: 1,
  tableName: "fizruk_measurements",
  op: "upsert",
  rejectReason: "invalid_weight_kg",
  createdAt: "2026-09-03 10:00:00",
  ...over,
});

describe("SyncRejectedList", () => {
  afterEach(() => {
    cleanup();
    listRejected.mockReset();
    runtimeRef.value = { listRejected };
  });

  it("lists rejected rows as module + human reason, keeping the code in title", async () => {
    listRejected.mockResolvedValue([
      row({ id: 2 }),
      row({
        id: 1,
        tableName: "routine_completions",
        rejectReason: "user_id_mismatch",
      }),
    ]);
    renderList();

    await waitFor(() =>
      expect(screen.getAllByRole("listitem")).toHaveLength(2),
    );
    expect(screen.getByText("Фізрук")).toBeInTheDocument();
    expect(screen.getByText("значення поза межами")).toBeInTheDocument();
    expect(screen.getByText("Рутина")).toBeInTheDocument();
    expect(screen.getByText("запис іншого акаунта")).toBeInTheDocument();
    expect(screen.getByTitle("invalid_weight_kg")).toBeInTheDocument();
  });

  it("shows the empty line instead of a list when nothing is rejected", async () => {
    listRejected.mockResolvedValue([]);
    renderList();
    await waitFor(() =>
      expect(screen.getByText("Список порожній")).toBeInTheDocument(),
    );
  });

  it("shows an error line instead of a false «empty» when reading fails", async () => {
    listRejected.mockRejectedValue(new Error("sqlite locked"));
    renderList();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent).toContain(
      "Не вдалося прочитати список",
    );
    expect(screen.queryByText("Список порожній")).not.toBeInTheDocument();
  });

  it("falls back to empty when the sync runtime is not booted", async () => {
    runtimeRef.value = null;
    renderList();
    await waitFor(() =>
      expect(screen.getByText("Список порожній")).toBeInTheDocument(),
    );
    expect(listRejected).not.toHaveBeenCalled();
  });
});

describe("describeRejectedRow", () => {
  it("maps unknown tables and reasons without crashing", () => {
    expect(
      describeRejectedRow(
        row({ tableName: "hub_prefs", rejectReason: "weird_reason" }),
      ),
    ).toEqual({ module: "hub_prefs", reason: "weird reason" });
    expect(describeRejectedRow(row({ rejectReason: null })).reason).toBe(
      "невідома причина",
    );
  });
});
