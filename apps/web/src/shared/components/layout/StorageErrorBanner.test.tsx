/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import { StorageErrorBanner } from "./StorageErrorBanner";

afterEach(cleanup);

const EVENT = "TEST_STORAGE_ERROR";

function dispatchError(message?: string) {
  act(() => {
    window.dispatchEvent(
      new CustomEvent(EVENT, message ? { detail: { message } } : undefined),
    );
  });
}

describe("StorageErrorBanner", () => {
  it("renders nothing until the storage-error event fires", () => {
    const { container } = render(<StorageErrorBanner eventName={EVENT} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the catalog copy without the raw reason on the event", () => {
    render(<StorageErrorBanner eventName={EVENT} />);
    dispatchError("QuotaExceededError");
    const alert = screen.getByRole("alert");
    // Сира причина лишається в події для телеметрії, людині її не показуємо
    // (аудит копі 2026-09-23 §2.5).
    expect(alert.textContent).not.toContain("QuotaExceededError");
    expect(alert.textContent).toContain("Не вдалося зберегти дані");
  });

  it("shows the same catalog copy when the event has no detail", () => {
    render(<StorageErrorBanner eventName={EVENT} />);
    dispatchError(undefined);
    const text = screen.getByRole("alert").textContent ?? "";
    expect(text).toContain("Не вдалося зберегти дані");
    expect(text).not.toContain("невідома помилка");
  });

  it("uses a custom formatMessage when provided", () => {
    render(
      <StorageErrorBanner
        eventName={EVENT}
        formatMessage={(reason) => `Custom: ${reason}`}
      />,
    );
    dispatchError("boom");
    expect(screen.getByRole("alert").textContent).toContain("Custom: boom");
  });

  it("dismiss button hides the banner and uses the custom dismiss label", () => {
    render(<StorageErrorBanner eventName={EVENT} dismissLabel="Сховати" />);
    dispatchError("err");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Сховати" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("only listens for its own event name", () => {
    render(<StorageErrorBanner eventName={EVENT} />);
    act(() => {
      window.dispatchEvent(
        new CustomEvent("OTHER_EVENT", { detail: { message: "nope" } }),
      );
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
