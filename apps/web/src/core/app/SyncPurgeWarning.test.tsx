/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StaleTerminalOutboxPurgeForecast } from "@sergeant/db-schema/sqlite";

const getPurgeForecast =
  vi.fn<() => Promise<StaleTerminalOutboxPurgeForecast>>();
const runtimeRef: {
  value: { getPurgeForecast: typeof getPurgeForecast } | null;
} = { value: { getPurgeForecast } };

vi.mock("../syncEngine/singleton", () => ({
  getSyncEngineWriter: () => runtimeRef.value,
}));

import { SyncPurgeWarning, purgeWarningBody } from "./SyncPurgeWarning";

function renderWarning(canRetry: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SyncPurgeWarning canRetry={canRetry} />
    </QueryClientProvider>,
  );
}

const NOW = new Date("2026-11-17T12:00:00Z");

describe("purgeWarningBody", () => {
  it("називає кількість, дату чистки й повтор для dead-letter", () => {
    const body = purgeWarningBody(
      { count: 3, earliestPurgeAtIso: "2026-11-21T09:00:00Z" },
      true,
      NOW,
    );
    expect(body).toContain("3 записи так і не дійшли на сервер.");
    expect(body).toContain("Після 21 листопада");
    expect(body).toContain("«Повторити синхронізацію»");
    expect(body).not.toContain("—");
  });

  it("однина і підказка для відхилених без повтору", () => {
    const body = purgeWarningBody(
      { count: 1, earliestPurgeAtIso: "2026-11-21T09:00:00Z" },
      false,
      NOW,
    );
    expect(body).toContain("1 запис так і не дійшов на сервер.");
    expect(body).toContain("Перепиши їх зі списку вище");
  });

  it("дата в минулому означає наступний запуск", () => {
    const body = purgeWarningBody(
      { count: 5, earliestPurgeAtIso: "2026-11-01T00:00:00Z" },
      true,
      NOW,
    );
    expect(body).toContain("5 записів так і не дійшли");
    expect(body).toContain("Під час наступного запуску");
  });
});

describe("SyncPurgeWarning", () => {
  afterEach(() => {
    cleanup();
    getPurgeForecast.mockReset();
    runtimeRef.value = { getPurgeForecast };
  });

  it("показує попередження, коли чистка щось забере", async () => {
    getPurgeForecast.mockResolvedValue({
      count: 2,
      earliestPurgeAtIso: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    });
    renderWarning(true);

    await waitFor(() =>
      expect(screen.getByTestId("sync-purge-warning")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Записи скоро зникнуть з пристрою"),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "2 записи так і не дійшли на сервер.",
    );
  });

  it("мовчить, коли чистити нічого", async () => {
    getPurgeForecast.mockResolvedValue({ count: 0, earliestPurgeAtIso: null });
    renderWarning(true);
    await waitFor(() => expect(getPurgeForecast).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("sync-purge-warning")).not.toBeInTheDocument();
  });

  it("мовчить без рантайму і при збої читання", async () => {
    runtimeRef.value = null;
    renderWarning(true);
    expect(screen.queryByTestId("sync-purge-warning")).not.toBeInTheDocument();

    cleanup();
    runtimeRef.value = { getPurgeForecast };
    getPurgeForecast.mockRejectedValue(new Error("SQLITE_BUSY"));
    renderWarning(true);
    await waitFor(() => expect(getPurgeForecast).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("sync-purge-warning")).not.toBeInTheDocument();
  });
});
