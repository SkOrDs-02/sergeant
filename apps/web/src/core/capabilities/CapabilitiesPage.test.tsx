// @vitest-environment jsdom
/**
 * AI-CONTEXT: регресія — сторінка не скролилась.
 *
 * `#root` у `base.css` — `height:100dvh; overflow:hidden`, тож скролу
 * документа немає. Перша версія каталогу була звичайним `<div>` без власного
 * скрол-контейнера, і всі записи нижче межі вікна ставали недосяжними.
 * Той самий баг раніше вже ловив `/assistant`.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
