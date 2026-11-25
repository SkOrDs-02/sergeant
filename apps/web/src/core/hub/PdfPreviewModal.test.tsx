/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PdfPreviewModal } from "./PdfPreviewModal";

const HTML = "<!DOCTYPE html><html><body><h1>Звіт</h1></body></html>";

describe("PdfPreviewModal", () => {
  it("renders a dialog with the report inside an iframe", () => {
    render(<PdfPreviewModal html={HTML} onClose={() => undefined} />);

    const dialog = screen.getByRole("dialog", { name: /Перегляд PDF-звіту/i });
    expect(dialog).toBeInTheDocument();

    const iframe = screen.getByTitle("PDF-звіт") as HTMLIFrameElement;
    expect(iframe.getAttribute("srcdoc")).toBe(HTML);
  });

  it("locks page scroll while open and releases it on unmount", () => {
    const view = render(
      <PdfPreviewModal html={HTML} onClose={() => undefined} />,
    );
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.style.position).toBe("fixed");

    view.unmount();
    expect(document.body.style.overflow).toBe("");
    expect(document.body.style.position).toBe("");
  });

  it("closes via the Назад button", () => {
    const onClose = vi.fn();
    render(<PdfPreviewModal html={HTML} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /Назад/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<PdfPreviewModal html={HTML} onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("honestly labels and opens the system save/print dialog", () => {
    render(<PdfPreviewModal html={HTML} onClose={() => undefined} />);

    const iframe = screen.getByTitle("PDF-звіт") as HTMLIFrameElement;
    const printSpy = vi.fn();
    // jsdom does not implement window.print on the iframe's contentWindow;
    // stub it so the click path is exercised without a real print dialog.
    Object.defineProperty(iframe.contentWindow, "print", {
      configurable: true,
      value: printSpy,
    });

    fireEvent.click(screen.getByRole("button", { name: /Зберегти \/ друк/i }));
    expect(printSpy).toHaveBeenCalledTimes(1);
  });
});
