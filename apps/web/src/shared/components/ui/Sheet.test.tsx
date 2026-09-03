/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import {
  resetVisualKeyboardInsetAdapter,
  setVisualKeyboardInsetAdapter,
} from "@sergeant/shared";
import { Sheet } from "./Sheet";

afterEach(() => {
  cleanup();
  resetVisualKeyboardInsetAdapter();
});

/**
 * Contract tests for the DS Sheet primitive. Focus: open ⇄ unmount,
 * role=dialog + aria-modal, aria-labelledby wiring, scrim-dismiss,
 * body scroll lock, and handle visibility toggle.
 */
describe("Sheet", () => {
  it("renders nothing when open=false", () => {
    const { queryByRole } = render(
      <Sheet open={false} onClose={() => {}} title="T">
        body
      </Sheet>,
    );
    expect(queryByRole("dialog")).toBeNull();
  });

  it("renders role='dialog' + aria-modal='true' when open", () => {
    const { getByRole } = render(
      <Sheet open onClose={() => {}} title="Новий запис">
        body
      </Sheet>,
    );
    const dialog = getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("wires aria-labelledby to the title element", () => {
    const { getByRole, getByText } = render(
      <Sheet open onClose={() => {}} title="Назва">
        body
      </Sheet>,
    );
    const dialog = getByRole("dialog");
    const labelId = dialog.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    expect(getByText("Назва").getAttribute("id")).toBe(labelId);
  });

  it("clicking the scrim invokes onClose", () => {
    const onClose = vi.fn();
    const { getAllByRole } = render(
      <Sheet open onClose={onClose} title="T">
        body
      </Sheet>,
    );
    // Sheet exposes two close-affordance buttons with aria-label="Закрити":
    // the scrim (first) and the header icon button (last). Either should
    // dispatch onClose.
    fireEvent.click(getAllByRole("button")[0]!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders a drag-handle by default and omits it when hideHandle=true", () => {
    const { rerender } = render(
      <Sheet open onClose={() => {}} title="T">
        body
      </Sheet>,
    );
    // Sheet is portaled to <body>, so query against the document, not the
    // RTL container (which only owns the mount wrapper).
    const handleSelector = 'div[aria-hidden][class*="rounded-full"]';
    expect(document.body.querySelector(handleSelector)).not.toBeNull();
    rerender(
      <Sheet open onClose={() => {}} title="T" hideHandle>
        body
      </Sheet>,
    );
    expect(document.body.querySelector(handleSelector)).toBeNull();
  });

  it("portals the sheet to document.body so it escapes a transformed ancestor", () => {
    // Mirrors the real-world `.page-enter` containing-block bug: the
    // ancestor below has a non-`none` `transform`, which would anchor a
    // non-portaled `position: fixed` overlay to its box (rendering the
    // sheet clipped above or below the viewport). Portaling to <body>
    // bypasses every such ancestor; the sheet must live outside the host
    // node. Mirrors Modal's identical contract test for parity.
    const { container, getByRole } = render(
      <div style={{ transform: "translateY(0)" }}>
        <Sheet open onClose={() => {}} title="Portaled">
          body
        </Sheet>
      </div>,
    );
    const dialog = getByRole("dialog");
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it("locks body scroll while open and restores on unmount", () => {
    const prev = document.body.style.overflow;
    const { unmount } = render(
      <Sheet open onClose={() => {}} title="T">
        body
      </Sheet>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe(prev);
  });

  it("applies a slide-up animation class on the panel", () => {
    const { getByRole } = render(
      <Sheet open onClose={() => {}} title="T">
        body
      </Sheet>,
    );
    // Panel ships with a slide-up keyframe animation. PR 4 adds the
    // motion-safe: guard on top; either form is acceptable here.
    expect(getByRole("dialog").className).toMatch(
      /\banimate-slide-up\b|\bmotion-safe:animate-slide-up\b/,
    );
  });

  // Звіт власника 2026-09-03: чат-аркуш висів над навбаром зі смужкою
  // сторінки зверху. `fullScreen` — панель на весь вʼюпорт без відступу
  // під навігацію, safe-area несе сама.
  it("fullScreen: fills the viewport, drops the bottom-nav margin and rounding", () => {
    const { getByRole } = render(
      <Sheet open onClose={() => {}} title="T" fullScreen>
        body
      </Sheet>,
    );
    const dialog = getByRole("dialog");
    expect(dialog.style.marginBottom).toBe("0px");
    expect(dialog.style.height).toBe("100dvh");
    expect(dialog.style.maxHeight).toBe("100dvh");
    // `env(safe-area-inset-*)` jsdom відкидає як невалідне значення, тож
    // safe-area-падінги панелі тут не перевірити — лише геометрію.
    expect(dialog.className).toContain("rounded-none");
  });

  it("fullScreen під клавіатурою: тулиться до неї без нижнього safe-area", () => {
    const { getByRole } = render(
      <Sheet open onClose={() => {}} title="T" fullScreen kbInsetPx={300}>
        body
      </Sheet>,
    );
    const dialog = getByRole("dialog");
    expect(dialog.style.marginBottom).toBe("300px");
    expect(dialog.style.maxHeight).toBe("calc(100dvh - 300px)");
    expect(dialog.style.paddingBottom).toBe("0px");
  });

  it("shrinks to the visible area when the software keyboard is open", () => {
    const { getByRole } = render(
      <Sheet open onClose={() => {}} title="T" kbInsetPx={320}>
        body
      </Sheet>,
    );

    const dialog = getByRole("dialog");
    expect(dialog.style.marginBottom).toBe("320px");
    expect(dialog.style.maxHeight).toContain("100dvh - 320px");
  });

  it("резервує у скрол-контейнері запас на висоту клавіатури", () => {
    // Бета-фідбек №5 (2026-08-18): без запасу поле в кінці списку нікуди
    // підняти — під ним просто нема контенту, і скрол упирається в межу
    // (§ докстрінг `useKeyboardAwareOverlay`, четвертий симптом).
    const { getByText, rerender } = render(
      <Sheet open onClose={() => {}} title="T" kbInsetPx={320}>
        body
      </Sheet>,
    );
    const scrollBody = getByText("body");
    expect(scrollBody.style.paddingBottom).toContain("320px");

    // Клавіатура зникла — запас теж, інакше під списком назавжди
    // лишалась би порожня діра.
    rerender(
      <Sheet open onClose={() => {}} title="T" kbInsetPx={0}>
        body
      </Sheet>,
    );
    expect(getByText("body").style.paddingBottom).toBe("");
  });

  it("closes on browser Back without changing the route", () => {
    const onClose = vi.fn();
    const pathBefore = window.location.pathname;
    render(
      <Sheet open onClose={onClose} title="T">
        body
      </Sheet>,
    );
    // Opening pushes an entry that belongs to the sheet; popping it must
    // dismiss the sheet, not navigate the user out of the module.
    fireEvent.popState(window);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe(pathBefore);
  });

  it("does not push a history entry while closed", () => {
    const onClose = vi.fn();
    render(
      <Sheet open={false} onClose={onClose} title="T">
        body
      </Sheet>,
    );
    fireEvent.popState(window);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("detects the software-keyboard inset without caller wiring", () => {
    setVisualKeyboardInsetAdapter((active) => (active ? 280 : 0));

    const { getByRole } = render(
      <Sheet open onClose={() => {}} title="T">
        body
      </Sheet>,
    );

    const dialog = getByRole("dialog");
    expect(dialog.style.marginBottom).toBe("280px");
    expect(dialog.style.maxHeight).toContain("100dvh - 280px");
  });
});
