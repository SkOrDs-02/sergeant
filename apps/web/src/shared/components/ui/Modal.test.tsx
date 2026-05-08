/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { Modal } from "./Modal";

afterEach(cleanup);

/**
 * Contract tests for the DS Modal primitive. Focus: open ⇄ unmount,
 * role=dialog + aria-modal + aria-labelledby wiring, overlay dismiss
 * toggle, body scroll lock, and hideClose.
 */
describe("Modal", () => {
  it("renders nothing when open=false", () => {
    const { queryByRole } = render(
      <Modal open={false} onClose={() => {}} title="Hi">
        body
      </Modal>,
    );
    expect(queryByRole("dialog")).toBeNull();
  });

  it("renders role='dialog' + aria-modal='true' when open", () => {
    const { getByRole } = render(
      <Modal open onClose={() => {}} title="Привіт">
        body
      </Modal>,
    );
    const dialog = getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("wires aria-labelledby to the rendered title element", () => {
    const { getByRole, getByText } = render(
      <Modal open onClose={() => {}} title="Назва">
        body
      </Modal>,
    );
    const dialog = getByRole("dialog");
    const labelId = dialog.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    const titleEl = getByText("Назва");
    expect(titleEl.getAttribute("id")).toBe(labelId);
  });

  it("wires aria-describedby when `description` is provided", () => {
    const { getByRole, getByText } = render(
      <Modal open onClose={() => {}} title="T" description="Опис">
        body
      </Modal>,
    );
    const dialog = getByRole("dialog");
    const descId = dialog.getAttribute("aria-describedby");
    expect(descId).toBeTruthy();
    expect(getByText("Опис").getAttribute("id")).toBe(descId);
  });

  it("clicking the scrim calls onClose by default", () => {
    const onClose = vi.fn();
    const { getAllByRole } = render(
      <Modal open onClose={onClose} title="T">
        body
      </Modal>,
    );
    // The overlay button is the first role=button (scrim) — close button is
    // the second (inside the dialog).
    fireEvent.click(getAllByRole("button")[0]!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("dismissOnOverlayClick=false disables scrim dismiss", () => {
    const onClose = vi.fn();
    const { getAllByRole } = render(
      <Modal open onClose={onClose} title="T" dismissOnOverlayClick={false}>
        body
      </Modal>,
    );
    fireEvent.click(getAllByRole("button")[0]!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("hideClose=true omits the close button (only scrim remains)", () => {
    const { getAllByRole } = render(
      <Modal open onClose={() => {}} title="T" hideClose>
        body
      </Modal>,
    );
    // Only the scrim button is rendered.
    expect(getAllByRole("button")).toHaveLength(1);
  });

  it("locks body scroll while open and restores on unmount", () => {
    const prev = document.body.style.overflow;
    const { unmount } = render(
      <Modal open onClose={() => {}} title="T">
        body
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe(prev);
  });

  it("portals the dialog to document.body so it escapes a transformed ancestor", () => {
    // Mirrors the real-world `.page-enter` containing-block bug: the
    // ancestor below has a non-`none` `transform`, which would anchor a
    // non-portaled `position: fixed` overlay to its box (rendering the
    // dialog far below the viewport). Portaling to <body> bypasses
    // every such ancestor; the dialog must live outside the host node.
    const { container, getByRole } = render(
      <div style={{ transform: "translateY(0)" }}>
        <Modal open onClose={() => {}} title="Portaled">
          body
        </Modal>
      </div>,
    );
    const dialog = getByRole("dialog");
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });
});
