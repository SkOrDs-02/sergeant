// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { createRef } from "react";
import {
  useDialogFocusTrap,
  __resetDialogInertForTests,
} from "./useDialogFocusTrap";

/**
 * Spec: restoring focus to the dialog trigger on close is a WCAG 2.4.3
 * requirement. These tests lock the behavior in so future refactors
 * don't silently regress to dropping focus on <body>.
 */
describe("useDialogFocusTrap — focus restoration", () => {
  afterEach(() => {
    __resetDialogInertForTests();
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

/**
 * Spec: the keyboard trap above only contains Tab. The screen-reader
 * virtual cursor ignores Tab and would otherwise wander the controls
 * behind an open modal. With `inertBackground`, everything outside the
 * dialog's overlay is marked `inert` + `aria-hidden` (WCAG 4.1.2 /
 * 1.3.1). These tests lock in that the background is hidden on open,
 * restored on close, the dialog's own scrim stays live, pre-existing
 * inert is never clobbered, and stacked dialogs don't trap each other.
 */
describe("useDialogFocusTrap — background inert", () => {
  afterEach(() => {
    __resetDialogInertForTests();
    document.body.innerHTML = "";
  });

  function makeRef(el: HTMLElement) {
    const ref = createRef<HTMLElement>();
    Object.defineProperty(ref, "current", { value: el, writable: true });
    return ref;
  }

  it("does nothing unless inertBackground is opted in", () => {
    const bg = document.createElement("button");
    document.body.appendChild(bg);

    const panel = document.createElement("div");
    panel.appendChild(document.createElement("button"));
    document.body.appendChild(panel);

    const { unmount } = renderHook(() =>
      useDialogFocusTrap(true, makeRef(panel)),
    );

    expect(bg.hasAttribute("inert")).toBe(false);
    expect(bg.hasAttribute("aria-hidden")).toBe(false);
    unmount();
  });

  it("marks background siblings inert + aria-hidden on open and clears them on close", () => {
    const bg1 = document.createElement("button");
    const bg2 = document.createElement("button");
    document.body.append(bg1, bg2);

    const panel = document.createElement("div");
    panel.appendChild(document.createElement("button"));
    document.body.appendChild(panel);

    const { rerender, unmount } = renderHook(
      ({ open }) =>
        useDialogFocusTrap(open, makeRef(panel), { inertBackground: true }),
      { initialProps: { open: true } },
    );

    // No fixed overlay in this flat fixture → the panel itself is the
    // dialog root, so its body-level siblings are the background.
    expect(bg1.hasAttribute("inert")).toBe(true);
    expect(bg2.hasAttribute("inert")).toBe(true);
    expect(bg1.getAttribute("aria-hidden")).toBe("true");
    // The dialog itself is never inerted.
    expect(panel.hasAttribute("inert")).toBe(false);

    rerender({ open: false });

    expect(bg1.hasAttribute("inert")).toBe(false);
    expect(bg2.hasAttribute("inert")).toBe(false);
    expect(bg1.hasAttribute("aria-hidden")).toBe(false);
    unmount();
  });

  it("inerts outside the fixed overlay, keeping the dialog's own scrim interactive", () => {
    const bg = document.createElement("button");
    document.body.appendChild(bg);

    // overlay (fixed) > [scrim, panel] — mirrors Sheet/Modal/ConfirmDialog.
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    const scrim = document.createElement("button");
    const panel = document.createElement("div");
    panel.appendChild(document.createElement("button"));
    overlay.append(scrim, panel);
    document.body.appendChild(overlay);

    const { rerender, unmount } = renderHook(
      ({ open }) =>
        useDialogFocusTrap(open, makeRef(panel), { inertBackground: true }),
      { initialProps: { open: true } },
    );

    expect(bg.hasAttribute("inert")).toBe(true);
    // Scrim is a child of the overlay (the dialog root) — it must stay
    // live so tap-outside-to-dismiss keeps working.
    expect(scrim.hasAttribute("inert")).toBe(false);
    expect(panel.hasAttribute("inert")).toBe(false);
    expect(overlay.hasAttribute("inert")).toBe(false);

    rerender({ open: false });
    expect(bg.hasAttribute("inert")).toBe(false);
    unmount();
  });

  it("never clears inert that was already present before the dialog opened", () => {
    const bg = document.createElement("button");
    bg.setAttribute("inert", "");
    bg.setAttribute("aria-hidden", "true");
    document.body.appendChild(bg);

    const panel = document.createElement("div");
    panel.appendChild(document.createElement("button"));
    document.body.appendChild(panel);

    const { rerender, unmount } = renderHook(
      ({ open }) =>
        useDialogFocusTrap(open, makeRef(panel), { inertBackground: true }),
      { initialProps: { open: true } },
    );

    expect(bg.hasAttribute("inert")).toBe(true);

    rerender({ open: false });
    // We did not set it → we must not clear it.
    expect(bg.hasAttribute("inert")).toBe(true);
    expect(bg.getAttribute("aria-hidden")).toBe("true");
    unmount();
  });

  it("un-inerts the background before restoring focus to an inerted trigger", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const panel = document.createElement("div");
    panel.appendChild(document.createElement("button"));
    document.body.appendChild(panel);

    const { rerender, unmount } = renderHook(
      ({ open }) =>
        useDialogFocusTrap(open, makeRef(panel), { inertBackground: true }),
      { initialProps: { open: true } },
    );

    // Trigger is a background sibling → inerted while the dialog is open.
    expect(trigger.hasAttribute("inert")).toBe(true);

    rerender({ open: false });

    // Cleanup un-inerts first, then restores focus (focus() is a no-op on
    // an element still inside an inert subtree).
    expect(trigger.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(trigger);
    unmount();
  });

  it("keeps a stacked dialog reachable: a second dialog releases the branch that now contains it", () => {
    // Portaled "sheet": its fixed overlay is a direct child of <body>.
    // Inline "confirm": its fixed overlay lives inside the app root, as a
    // sibling of page content. This is the real Фінік/Рутина
    // "ConfirmDialog over edit-sheet" shape.
    const appRoot = document.createElement("div");
    const pageBg = document.createElement("button");
    const confirmOverlay = document.createElement("div");
    confirmOverlay.style.position = "fixed";
    const confirmScrim = document.createElement("button");
    const confirmPanel = document.createElement("div");
    confirmPanel.appendChild(document.createElement("button"));
    confirmOverlay.append(confirmScrim, confirmPanel);
    appRoot.append(pageBg, confirmOverlay);
    document.body.appendChild(appRoot);

    const sheetOverlay = document.createElement("div");
    sheetOverlay.style.position = "fixed";
    const sheetPanel = document.createElement("div");
    sheetPanel.appendChild(document.createElement("button"));
    sheetOverlay.appendChild(sheetPanel);
    document.body.appendChild(sheetOverlay);

    // 1) Sheet opens — the whole app root is inerted behind it.
    const sheetHook = renderHook(
      ({ open }) =>
        useDialogFocusTrap(open, makeRef(sheetPanel), {
          inertBackground: true,
        }),
      { initialProps: { open: true } },
    );
    expect(appRoot.hasAttribute("inert")).toBe(true);

    // 2) Confirm opens *inside* the (currently inerted) app root.
    const confirmHook = renderHook(
      ({ open }) =>
        useDialogFocusTrap(open, makeRef(confirmPanel), {
          inertBackground: true,
        }),
      { initialProps: { open: true } },
    );
    // App root must be released (it now leads to the open confirm)…
    expect(appRoot.hasAttribute("inert")).toBe(false);
    // …the confirm and its scrim stay live…
    expect(confirmPanel.hasAttribute("inert")).toBe(false);
    expect(confirmScrim.hasAttribute("inert")).toBe(false);
    // …but the page content beside it is inerted.
    expect(pageBg.hasAttribute("inert")).toBe(true);

    // 3) Confirm closes — app root is inerted again behind the sheet.
    confirmHook.rerender({ open: false });
    expect(appRoot.hasAttribute("inert")).toBe(true);
    expect(pageBg.hasAttribute("inert")).toBe(false);

    // 4) Sheet closes — everything is restored.
    sheetHook.rerender({ open: false });
    expect(appRoot.hasAttribute("inert")).toBe(false);

    confirmHook.unmount();
    sheetHook.unmount();
  });
});
