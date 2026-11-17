// @vitest-environment jsdom
/**
 * AI-CONTEXT: регресія — сторінка не скролилась.
 *
 * `#root` у `base.css` — `height:100dvh; overflow:hidden`, тож скролу
 * документа немає. Перша версія каталогу була звичайним `<div>` без власного
 * скрол-контейнера, і всі записи нижче межі вікна ставали недосяжними.
 * Той самий баг раніше вже ловив `/assistant`.
 */
import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { useAuthOptional } = vi.hoisted(() => ({
  useAuthOptional: vi.fn((): { user: unknown } | null => null),
}));
vi.mock("../auth/AuthContext", () => ({ useAuthOptional }));

import { CapabilitiesPage } from "./CapabilitiesPage";
import { CAPABILITY_GROUPS } from "./capabilityRegistry";

function renderPage() {
  return render(
    <MemoryRouter>
      <CapabilitiesPage />
    </MemoryRouter>,
  );
}

describe("CapabilitiesPage", () => {
  beforeEach(() => {
    useAuthOptional.mockReturnValue(null);
  });

  // Рішення власника 2026-11-17: PIN лише для акаунта. Гостю картка вела в
  // Профіль, якого в нього немає, і повертала на «Головну».
  it("гостю не показує картки PIN, акаунту показує", () => {
    useAuthOptional.mockReturnValue({ user: null });
    const { unmount } = renderPage();
    expect(screen.queryByTestId("capability-privacy")).toBeNull();
    expect(screen.getByTestId("capability-export")).toBeInTheDocument();
    unmount();

    useAuthOptional.mockReturnValue({ user: { id: "usr_1" } });
    renderPage();
    expect(screen.getByTestId("capability-privacy")).toBeInTheDocument();
  });

  it("renders factual capability rows without decorative glyphs", () => {
    const { container } = renderPage();
    expect(container.querySelectorAll("svg")).toHaveLength(0);
  });

  it("володіє власним скрол-контейнером на всю висоту вікна", () => {
    const { container } = renderPage();
    const main = container.querySelector("main");
    expect(main).not.toBeNull();
    const classes = main!.className;
    expect(classes).toContain("h-dvh");
    expect(classes).toContain("overflow-y-auto");
  });

  it("рендерить усі записи реєстру", () => {
    renderPage();
    const total = CAPABILITY_GROUPS.reduce(
      (sum, group) => sum + group.items.length,
      0,
    );
    for (const group of CAPABILITY_GROUPS) {
      for (const item of group.items) {
        expect(screen.getByTestId(`capability-${item.id}`)).toBeInTheDocument();
      }
    }
    expect(total).toBeGreaterThan(0);
  });

  // Founder-ux-review round 2 (O4): "scenario first, details after" — the
  // 30-second `quickAction` must render, and it must come BEFORE the
  // supporting `description` in reading order, not just be present
  // somewhere in the card.
  it("рендерить quickAction перед description (сценарій зверху, подробиці далі)", () => {
    renderPage();
    const first = CAPABILITY_GROUPS[0]?.items[0];
    expect(first).toBeDefined();
    const card = screen.getByTestId(`capability-${first!.id}`);
    expect(card.textContent).toContain(first!.quickAction);
    const quickActionIndex = card.textContent!.indexOf(first!.quickAction);
    const descriptionIndex = card.textContent!.indexOf(first!.description);
    expect(quickActionIndex).toBeGreaterThanOrEqual(0);
    expect(descriptionIndex).toBeGreaterThan(quickActionIndex);
  });
});
