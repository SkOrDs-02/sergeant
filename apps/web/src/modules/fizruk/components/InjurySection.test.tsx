// @vitest-environment jsdom
/**
 * `InjurySection` — read-only зріз позначок болю на сторінці Атласа.
 *
 * Пікер зон звідси прибрано 2026-08-08: він дублював `InjuryManager` на
 * «Моє тіло», ще й з іншою механікою (тут тап позначав зразу, там —
 * накопичував вибір до кнопки). Тести нижче тримають саме цю межу: список
 * і зняття лишаються, ставити позначку звідси не можна.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { InjurySection } from "./InjurySection";
import { useInjuries } from "../hooks/useInjuries";

vi.mock("../hooks/useInjuries", () => ({ useInjuries: vi.fn() }));

const mockUseInjuries = vi.mocked(useInjuries);

function setup(
  over: Partial<ReturnType<typeof useInjuries>> = {},
  props: React.ComponentProps<typeof InjurySection> = {},
) {
  const mark = vi.fn();
  const clear = vi.fn();
  mockUseInjuries.mockReturnValue({
    all: [],
    active: [],
    activeSites: new Set(),
    mark,
    clear,
    remove: vi.fn(),
    ...over,
  });
  render(<InjurySection {...props} />);
  return { mark, clear };
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("InjurySection", () => {
  it("invites the user to mark a zone when nothing is marked", () => {
    setup();
    expect(screen.getByText(/Нічого не позначено/)).toBeInTheDocument();
  });

  it("lists an active mark with a way to lift it", () => {
    const { clear } = setup({
      active: [
        {
          id: "inj_1",
          site: "knee",
          startedAt: "2026-08-01T10:00:00.000Z",
          clearedAt: null,
        },
      ],
      activeSites: new Set(["knee"] as const),
    });
    expect(screen.getByText("Коліно")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Зняти: Коліно/ }));
    expect(clear).toHaveBeenCalledWith("inj_1");
  });

  it("does not duplicate the zone picker that lives on «Моє тіло»", () => {
    setup();
    // Ні тогла пікера…
    expect(
      screen.queryByRole("button", { name: "Позначити зону" }),
    ).not.toBeInTheDocument();
    // …ні самих чипів зон — ані суглобових, ані мʼязових.
    expect(
      screen.queryByRole("button", { name: /Позначити зону: / }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Коліно" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Груди" }),
    ).not.toBeInTheDocument();
  });

  it("routes marking to «Моє тіло» when navigation is wired", () => {
    const onOpenBody = vi.fn();
    setup({}, { onOpenBody });
    fireEvent.click(
      screen.getByRole("button", { name: /Позначити на «Моє тіло»/ }),
    );
    expect(onOpenBody).toHaveBeenCalledTimes(1);
  });

  it("omits the navigation CTA when no target is wired", () => {
    setup();
    expect(
      screen.queryByRole("button", { name: /Позначити на «Моє тіло»/ }),
    ).not.toBeInTheDocument();
  });

  it("states the limits instead of promising safety", () => {
    setup();
    const note = screen.getByText(/не діагностує й не лікує/);
    expect(note).toBeInTheDocument();
    // The custom-exercise gap must be visible, not buried (ADR-0083).
    expect(note.textContent).toMatch(/перевірка за суглобом неможлива/);
  });
});
