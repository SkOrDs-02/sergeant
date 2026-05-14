// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { createRef } from "react";
import { useDialogFocusTrap } from "./useDialogFocusTrap";

/**
 * Spec: restoring focus to the dialog trigger on close is a WCAG 2.4.3
 * requirement. These tests lock the behavior in so future refactors
 * don't silently regress to dropping focus on <body>.
 */
describe("useDialogFocusTrap — focus restoration", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns focus to the previously-focused element when the trap closes", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const panel = document.createElement("div");
    const inner = document.createElement("button");
    inner.textContent = "Inside";
    panel.appendChild(inner);
    document.body.appendChild(panel);

    const ref = createRef<HTMLDivElement>();
    Object.defineProperty(ref, "current", { value: panel, writable: true });

    const { rerender, unmount } = renderHook(
      ({ open }) => useDialogFocusTrap(open, ref),
      { initialProps: { open: true } },
    );

    // Simulate the app moving focus into the dialog while it is open.
    inner.focus();
    expect(document.activeElement).toBe(inner);

    rerender({ open: false });

    expect(document.activeElement).toBe(trigger);
    unmount();
  });

  it("does not throw when the trigger has unmounted before close", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const panel = document.createElement("div");
    document.body.appendChild(panel);

    const ref = createRef<HTMLDivElement>();
    Object.defineProperty(ref, "current", { value: panel, writable: true });

    const { rerender, unmount } = renderHook(
      ({ open }) => useDialogFocusTrap(open, ref),
      { initialProps: { open: true } },
    );

    // Trigger disappears while dialog is open.
    trigger.remove();

    expect(() => rerender({ open: false })).not.toThrow();
    unmount();
  });

  it("does not yank focus out of the dialog when onEscape identity changes while open", () => {
    // Regression: putting `onEscape` in the effect deps caused every
    // parent re-render (which creates a new inline arrow) to tear down
    // the trap and run the focus-restore cleanup, stealing focus from
    // inside the open dialog back to the trigger.
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const panel = document.createElement("div");
    const inner = document.createElement("button");
    inner.textContent = "Inside";
    panel.appendChild(inner);
    document.body.appendChild(panel);

    const ref = createRef<HTMLDivElement>();
    Object.defineProperty(ref, "current", { value: panel, writable: true });

    const { rerender, unmount } = renderHook(
      ({ onEscape }: { onEscape: () => void }) =>
        useDialogFocusTrap(true, ref, { onEscape }),
      { initialProps: { onEscape: () => {} } },
    );

    // User has tabbed into the dialog.
    inner.focus();
    expect(document.activeElement).toBe(inner);

    // Parent re-renders with a new inline arrow — dialog is still open.
    rerender({ onEscape: () => {} });

    // Focus must NOT have been yanked out to the trigger.
    expect(document.activeElement).toBe(inner);
    unmount();
  });

  it("uses the latest onEscape callback when Escape is pressed", () => {
    const panel = document.createElement("div");
    document.body.appendChild(panel);
    const ref = createRef<HTMLDivElement>();
    Object.defineProperty(ref, "current", { value: panel, writable: true });

    const first = { called: 0 };
    const second = { called: 0 };

    const { rerender, unmount } = renderHook(
      ({ onEscape }: { onEscape: () => void }) =>
        useDialogFocusTrap(true, ref, { onEscape }),
      { initialProps: { onEscape: () => first.called++ } },
    );

    rerender({ onEscape: () => second.called++ });

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(first.called).toBe(0);
    expect(second.called).toBe(1);
    unmount();
  });

  it("moves initial focus to the first focusable inside the panel on open", () => {
    // Regression: modals that auto-open without a user-driven trigger
    // (e.g. the WhatsNew release-notes overlay) used to leave focus on
    // `<body>` or the skip-link, so Tab walked the page chrome behind
    // the dialog instead of cycling inside it.
    const outside = document.createElement("button");
    outside.textContent = "Outside";
    document.body.appendChild(outside);

    const panel = document.createElement("div");
    const first = document.createElement("button");
    first.textContent = "First";
    const second = document.createElement("button");
    second.textContent = "Second";
    panel.appendChild(first);
    panel.appendChild(second);
    document.body.appendChild(panel);

    const ref = createRef<HTMLDivElement>();
    Object.defineProperty(ref, "current", { value: panel, writable: true });

    const { unmount } = renderHook(() => useDialogFocusTrap(true, ref));

    expect(document.activeElement).toBe(first);
    unmount();
  });

  it("falls back to focusing the panel itself when it has no focusable children", () => {
    // Content-only dialogs (e.g. a message with no buttons) still need
    // focus inside the panel so Escape works and Tab can't escape.
    const panel = document.createElement("div");
    const text = document.createElement("p");
    text.textContent = "Just a message.";
    panel.appendChild(text);
    document.body.appendChild(panel);

    const ref = createRef<HTMLDivElement>();
    Object.defineProperty(ref, "current", { value: panel, writable: true });

    const { unmount } = renderHook(() => useDialogFocusTrap(true, ref));

    expect(document.activeElement).toBe(panel);
    expect(panel.getAttribute("tabindex")).toBe("-1");
    unmount();
  });

  it("pulls focus back into the panel when Tab is pressed while focus is outside", () => {
    // Defence-in-depth: if focus somehow escapes the panel while the
    // trap is open (e.g. programmatic `.focus()` from a stray effect),
    // the next Tab keypress must return it to the dialog instead of
    // continuing through the page.
    const outside = document.createElement("button");
    outside.textContent = "Outside";
    document.body.appendChild(outside);

    const panel = document.createElement("div");
    const inside = document.createElement("button");
    inside.textContent = "Inside";
    panel.appendChild(inside);
    document.body.appendChild(panel);

    const ref = createRef<HTMLDivElement>();
    Object.defineProperty(ref, "current", { value: panel, writable: true });

    const { unmount } = renderHook(() => useDialogFocusTrap(true, ref));

    // Simulate a stray effect yanking focus outside the dialog.
    outside.focus();
    expect(document.activeElement).toBe(outside);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));

    expect(document.activeElement).toBe(inside);
    unmount();
  });

  it("does not attempt to restore focus to <body>", () => {
    document.body.focus();
    expect(document.activeElement).toBe(document.body);

    const panel = document.createElement("div");
    document.body.appendChild(panel);
    const ref = createRef<HTMLDivElement>();
    Object.defineProperty(ref, "current", { value: panel, writable: true });

    const { rerender, unmount } = renderHook(
      ({ open }) => useDialogFocusTrap(open, ref),
      { initialProps: { open: true } },
    );

    const inner = document.createElement("input");
    panel.appendChild(inner);
    inner.focus();
    expect(document.activeElement).toBe(inner);

    rerender({ open: false });

    // No recorded trigger → focus is not yanked back to body-level;
    // whatever was focused at close time (here: nothing meaningful)
    // is left alone.
    expect(document.activeElement).not.toBe(document.body);
    unmount();
  });
});
