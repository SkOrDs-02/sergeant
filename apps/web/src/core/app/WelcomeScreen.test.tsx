// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { WelcomeScreen } from "./WelcomeScreen";

/**
 * Audit-guard for the 2026-05-08 fix on `/welcome`.
 *
 * Issue: коли користувач у `/welcome` тиснув «Що це за розділи?»,
 * splash-картка з модулями ставала вищою за viewport, а page-wrapper
 * був `min-h-dvh ... overflow-hidden` — і `html/body/#root` уже
 * зафіксовані на `height: 100dvh` у `apps/web/src/styles/base.css`,
 * тож natural body-scroll вимкнений. У результаті картку обрізало і
 * зверху (логотип), і знизу (CTA + «Згорнути»), без можливості
 * прокрутки.
 *
 * Контракт фіксу — структурний, тому пінимо саме структуру:
 *   - page-wrapper має бути scroll-контейнером (`overflow-y-auto`,
 *     `overscroll-contain`), а не `overflow-hidden`;
 *   - `PeekBackdrop` — `fixed inset-0` (живе у viewport, не їде з
 *     scroll-шаром), не `absolute inset-0`;
 *   - внутрішній flex-шар використовує `min-h-full` (відносно
 *     scroll-контейнера), щоб short-content центрувалось як раніше,
 *     а overflow прокручувався у зовнішньому шарі.
 *
 * Регресія легко повертається невинним рефактором тих самих утиліт,
 * тож фіксуємо її unit-тестом, а не лише коментарем.
 */
describe("WelcomeScreen — /welcome scroll-layer audit-guard", () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("page-wrapper is the scroll container (overflow-y-auto + overscroll-contain), not overflow-hidden", () => {
    const { container } = render(
      <WelcomeScreen onDone={() => {}} onOpenAuth={() => {}} />,
    );
    const pageWrapper = container.firstElementChild as HTMLElement;
    expect(pageWrapper).not.toBeNull();
    // Scroll layer.
    expect(pageWrapper.className).toMatch(/\boverflow-y-auto\b/);
    // iOS body-bounce / overscroll-chain guard.
    expect(pageWrapper.className).toMatch(/\boverscroll-contain\b/);
    // The pre-fix class must NOT resurrect — `overflow-hidden` on the
    // page wrapper is the exact regression that caused the modules to
    // be cropped without any scroll affordance.
    expect(pageWrapper.className).not.toMatch(/\boverflow-hidden\b/);
    // The wrapper must own viewport height so its `overflow-y-auto`
    // has a finite scroll viewport. `h-dvh` (not `min-h-dvh`) is the
    // contract — `min-h-dvh` would let the wrapper grow with content
    // and defeat the inner scroll.
    expect(pageWrapper.className).toMatch(/\bh-dvh\b/);
    expect(pageWrapper.className).not.toMatch(/\bmin-h-dvh\b/);
  });

  it("PeekBackdrop is fixed inset-0 (decoupled from the scroll layer)", () => {
    const { container } = render(
      <WelcomeScreen onDone={() => {}} onOpenAuth={() => {}} />,
    );
    // The backdrop is the page-wrapper's first child with
    // `aria-hidden="true"` (decorative shapes + bento blur).
    const pageWrapper = container.firstElementChild as HTMLElement;
    const backdrop = pageWrapper.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    expect(backdrop?.className).toMatch(/\bfixed\b/);
    expect(backdrop?.className).toMatch(/\binset-0\b/);
    // Pre-fix it was `absolute inset-0` — pin against resurrection so
    // floating shapes don't re-couple to the scroll layer and drag
    // along when modules expand.
    expect(backdrop?.className).not.toMatch(/\babsolute\b/);
  });

  it("inner flex layer uses min-h-full so short content centres but tall content scrolls", () => {
    const { container } = render(
      <WelcomeScreen onDone={() => {}} onOpenAuth={() => {}} />,
    );
    const pageWrapper = container.firstElementChild as HTMLElement;
    // Inner flex layer is the page-wrapper's second child (sibling
    // after the fixed backdrop). Selecting via class avoids depending
    // on PeekBackdrop's internal DOM.
    const innerLayer = pageWrapper.querySelector(
      ":scope > .relative.min-h-full",
    );
    expect(innerLayer).not.toBeNull();
    expect((innerLayer as HTMLElement).className).toMatch(/\bflex\b/);
    expect((innerLayer as HTMLElement).className).toMatch(/\bitems-end\b/);
    expect((innerLayer as HTMLElement).className).toMatch(
      /\bsm:items-center\b/,
    );
  });
});
