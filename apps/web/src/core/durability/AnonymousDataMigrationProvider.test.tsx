/** @vitest-environment jsdom */
import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const migrate = vi.fn<() => Promise<{ migratedRows: number }>>();
const success = vi.fn();
const bootReader = vi.fn(async () => ({ pullOnce: vi.fn() }));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    status: "authenticated",
  }),
}));
vi.mock("./anonymousDataMigration.js", () => ({
  migrateAnonymousDataToProfile: () => migrate(),
}));
vi.mock("../syncEngine/singleton.js", () => ({
  bootSyncEngineReader: () => bootReader(),
}));
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ success }),
}));

import {
  AnonymousDataMigrationProvider,
  __resetAnonymousMigrationSingleFlightForTests,
} from "./AnonymousDataMigrationProvider";

describe("AnonymousDataMigrationProvider", () => {
  beforeEach(() => {
    migrate.mockReset();
    success.mockReset();
    bootReader.mockClear();
    __resetAnonymousMigrationSingleFlightForTests();
  });

  it("blocks module children and runs one migration under StrictMode", async () => {
    let resolve!: (value: { migratedRows: number }) => void;
    migrate.mockReturnValue(new Promise((done) => (resolve = done)));
    render(
      <StrictMode>
        <AnonymousDataMigrationProvider>
          <div>module content</div>
        </AnonymousDataMigrationProvider>
      </StrictMode>,
    );

    expect(screen.queryByText("module content")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(migrate).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve({ migratedRows: 2 });
      await Promise.resolve();
    });
    await screen.findByText("module content");
    expect(success).toHaveBeenCalledTimes(1);
  });

  it("keeps the gate closed on failure and retries explicitly", async () => {
    migrate
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ migratedRows: 0 });
    render(
      <AnonymousDataMigrationProvider>
        <div>module content</div>
      </AnonymousDataMigrationProvider>,
    );

    const retry = await screen.findByRole("button", { name: "Повторити" });
    expect(screen.queryByText("module content")).not.toBeInTheDocument();
    await userEvent.click(retry);
    await screen.findByText("module content");
    await waitFor(() => expect(migrate).toHaveBeenCalledTimes(2));
    expect(success).not.toHaveBeenCalled();
  });
});
