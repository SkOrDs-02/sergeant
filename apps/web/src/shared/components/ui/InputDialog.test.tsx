/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { InputDialog } from "./InputDialog";

afterEach(() => {
  cleanup();
});

describe("InputDialog — useApiForm + zod (Item #8 round-13)", () => {
  it("renders nothing when closed", () => {
    render(<InputDialog open={false} title="Введи код" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("submits typed value via Enter / form-submit", async () => {
    const onConfirm = vi.fn();
    render(
      <InputDialog
        open
        title="Введи код"
        defaultValue=""
        onConfirm={onConfirm}
      />,
    );

    const input = screen.getByRole("dialog").querySelector("input");
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { value: "secret" } });
    fireEvent.submit(input!.closest("form")!);

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith("secret");
    });
  });

  it("submits the default value when user makes no edits", async () => {
    const onConfirm = vi.fn();
    render(
      <InputDialog
        open
        title="Підтверди"
        defaultValue="42"
        confirmLabel="ОК"
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "ОК" }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith("42");
    });
  });

  it("cancel button calls onCancel without submitting", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <InputDialog
        open
        title="Введи код"
        cancelLabel="Скасувати"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    // `cancelLabel` is reused on the scrim button (so AT users can dismiss
    // by clicking the backdrop) AND the explicit cancel control inside the
    // form. We click the form one — the second match in DOM order.
    const cancelButtons = screen.getAllByRole("button", {
      name: "Скасувати",
    });
    expect(cancelButtons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(cancelButtons[cancelButtons.length - 1]!);
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
