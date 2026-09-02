/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { messages } from "@shared/i18n/uk";

const { reloadOnceForChunkError } = vi.hoisted(() => ({
  reloadOnceForChunkError: vi.fn(() => true),
}));

vi.mock("../lib/chunkReload", async () => {
  const actual =
    await vi.importActual<typeof import("../lib/chunkReload")>(
      "../lib/chunkReload",
    );
  return { ...actual, reloadOnceForChunkError };
});

// Брендована сторінка помилки — важкий lazy-чанк; тут важливо лише те, що
// не-chunk помилка йде в НАШ фолбек, а не в дефолтний React Router-а.
vi.mock("../errors/ServerErrorPage", () => ({
  ServerErrorPage: () => <div>server-error-page</div>,
}));

import { RouteErrorElement } from "./RouteErrorElement";

function renderWithLazyError(error: Error) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        errorElement: <RouteErrorElement />,
        children: [
          {
            path: "assistant",
            lazy: () => Promise.reject(error),
          },
        ],
      },
    ],
    { initialEntries: ["/assistant"] },
  );
  return render(<RouterProvider router={router} />);
}

describe("RouteErrorElement (UX-3, аудит 2026-09)", () => {
  beforeEach(() => {
    reloadOnceForChunkError.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("chunk-помилка lazy-маршруту → guarded reload + картка з «Перезавантажити»", async () => {
    renderWithLazyError(
      new TypeError(
        "Failed to fetch dynamically imported module: http://x/assets/HubPage-abc.js",
      ),
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(messages.errors.generic.sectionFailed);
    expect(
      screen.getByRole("button", { name: messages.actions.reload }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(reloadOnceForChunkError).toHaveBeenCalledTimes(1),
    );
    // Дефолтної сторінки роутера («Unexpected Application Error!») немає.
    expect(screen.queryByText(/Unexpected Application Error/i)).toBeNull();
  });

  it("інша помилка lazy-маршруту → брендований ServerErrorPage без reload", async () => {
    renderWithLazyError(new Error("boom"));
    expect(await screen.findByText("server-error-page")).toBeInTheDocument();
    expect(reloadOnceForChunkError).not.toHaveBeenCalled();
    expect(screen.queryByText(/Unexpected Application Error/i)).toBeNull();
  });
});
