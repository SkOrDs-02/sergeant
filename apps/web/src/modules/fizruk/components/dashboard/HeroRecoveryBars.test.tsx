// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { HeroRecoveryRow } from "@sergeant/fizruk-domain";
import { HeroRecoveryBars } from "./HeroRecoveryBars";

afterEach(() => cleanup());

function muscleRow(over: Partial<HeroRecoveryRow> = {}): HeroRecoveryRow {
  return {
    atlasId: "chest",
    label: "Груди",
    kind: "muscle",
    status: "green",
    fatigue: 0.4,
    domainMuscleId: "pectoralis_major",
    ...over,
  };
}

function injuryRow(over: Partial<HeroRecoveryRow> = {}): HeroRecoveryRow {
  return {
    atlasId: "knee",
    label: "Коліно",
    kind: "injury",
    status: "red",
    fatigue: 0,
    domainMuscleId: null,
    ...over,
  };
}

describe("HeroRecoveryBars", () => {
  it("renders the empty-body message when there are no rows", () => {
    render(
      <HeroRecoveryBars rows={[]} recoverByDate={{}} onOpenAtlas={vi.fn()} />,
    );
    expect(screen.getByText(/Тіло ще не має історії/)).toBeInTheDocument();
  });

  it("bar width equals fatiguePercent(fatigue)", () => {
    const { container } = render(
      <HeroRecoveryBars
        rows={[muscleRow({ fatigue: 0.4 })]}
        recoverByDate={{}}
        onOpenAtlas={vi.fn()}
      />,
    );
    // atlasIntensity(0.4) * 100 = 40
    const fill = container.querySelector('span[style*="width"]') as HTMLElement;
    expect(fill).not.toBeNull();
    expect(fill.style.width).toBe("40%");
  });

  it("saturates fatigue above the ATLAS_FATIGUE_FULL ceiling at 100%", () => {
    const { container } = render(
      <HeroRecoveryBars
        rows={[muscleRow({ fatigue: 1.6 })]}
        recoverByDate={{}}
        onOpenAtlas={vi.fn()}
      />,
    );
    const fill = container.querySelector('span[style*="width"]') as HTMLElement;
    expect(fill.style.width).toBe("100%");
  });

  it("each row is a >=44px button", () => {
    render(
      <HeroRecoveryBars
        rows={[muscleRow(), injuryRow()]}
        recoverByDate={{}}
        onOpenAtlas={vi.fn()}
      />,
    );
    for (const btn of screen.getAllByRole("button")) {
      expect(btn).toHaveClass("min-h-[44px]");
    }
  });

  it("calls onOpenAtlas with the row's atlasId on click", () => {
    const onOpenAtlas = vi.fn();
    render(
      <HeroRecoveryBars
        rows={[muscleRow({ atlasId: "biceps", label: "Біцепс" })]}
        recoverByDate={{}}
        onOpenAtlas={onOpenAtlas}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Біцепс/ }));
    expect(onOpenAtlas).toHaveBeenCalledWith("biceps");
  });

  it("injury rows render without a fatigue bar", () => {
    const { container } = render(
      <HeroRecoveryBars
        rows={[injuryRow()]}
        recoverByDate={{}}
        onOpenAtlas={vi.fn()}
      />,
    );
    expect(container.querySelector('span[style*="width"]')).toBeNull();
    expect(screen.getByText("травма")).toBeInTheDocument();
  });

  it("captions: green -> свіжа, yellow -> майже, injury -> травма", () => {
    render(
      <HeroRecoveryBars
        rows={[
          muscleRow({ atlasId: "chest", status: "green" }),
          muscleRow({ atlasId: "biceps", label: "Біцепс", status: "yellow" }),
          injuryRow(),
        ]}
        recoverByDate={{}}
        onOpenAtlas={vi.fn()}
      />,
    );
    expect(screen.getByText("свіжа")).toBeInTheDocument();
    expect(screen.getByText("майже")).toBeInTheDocument();
    expect(screen.getByText("травма")).toBeInTheDocument();
  });

  it("red caption resolves the recovery-by forecast into a weekday abbreviation", () => {
    render(
      <HeroRecoveryBars
        rows={[
          muscleRow({
            status: "red",
            domainMuscleId: "pectoralis_major",
          }),
        ]}
        // 2026-09-07 is a Monday.
        recoverByDate={{ pectoralis_major: "2026-09-07" }}
        onOpenAtlas={vi.fn()}
      />,
    );
    expect(screen.getByText("до пн")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Груди: відновлюється, до понеділка\. Відкрити в атласі/,
      }),
    ).toBeInTheDocument();
  });

  it("red caption falls back to 'відновлюється' when no forecast is found", () => {
    render(
      <HeroRecoveryBars
        rows={[
          muscleRow({ status: "red", domainMuscleId: "pectoralis_major" }),
        ]}
        recoverByDate={{ pectoralis_major: null }}
        onOpenAtlas={vi.fn()}
      />,
    );
    expect(screen.getByText("відновлюється")).toBeInTheDocument();
  });
});
