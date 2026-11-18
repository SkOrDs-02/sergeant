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
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { onHubBus } from "@shared/lib/modules/hubBus";

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

  // PR-A8 (аудит 2026-09-13, хвиля 7): рішення D5 — чат є аркушем над
  // маршрутом, `/chat` лише для диплінків. Картка каталогу була єдиним
  // in-app входом у повну сторінку; тепер вона, як шапка й пошук, шле
  // `openChat` на шину, і маршрут лишається тим самим.
  it("картка «Чат із Сержантом» відкриває аркуш чату, а не сторінку /chat", () => {
    const events: unknown[] = [];
    const off = onHubBus("openChat", (detail) => events.push(detail));
    function Where() {
      return <span data-testid="where">{useLocation().pathname}</span>;
    }
    render(
      <MemoryRouter initialEntries={["/capabilities"]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <CapabilitiesPage />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("capability-chat"));
    off();
    expect(events).toEqual([{ message: null, autoSend: false }]);
    expect(screen.getByTestId("where")).toHaveTextContent("/capabilities");

    // Решта карток і далі ведуть маршрутом.
    fireEvent.click(screen.getByTestId("capability-routine"));
    expect(screen.getByTestId("where")).toHaveTextContent("/routine");
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
