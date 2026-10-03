// @vitest-environment jsdom
/**
 * BodyAtlas tests — pure-SVG renderer (no body-highlighter).
 *
 * Covers:
 *  - Mode + side segmented button-groups render and toggle aria-pressed.
 *  - Switching side swaps the muscle set (front-only vs back-only groups).
 *  - Muscle groups are keyboard-focusable role="button" with a UA aria-label.
 *  - Enter / Space / click select a muscle and populate the detail card.
 *  - The detail card surfaces status, fatigue and exercise chips.
 *
 * Fizruk audit wave 2 (2026-08-08) regression guards:
 *  - defect #1: the silhouette `<svg>` no longer carries `role="img"` (which
 *    forces ARIA descendants presentational and hides the muscle buttons
 *    from AT — a bug jsdom/RTL doesn't emulate, so only an explicit
 *    assertion on the attribute catches a regression).
 *  - defect #2: selecting a muscle sets `aria-pressed` and fires a
 *    `useAnnounce()` message into the shared live region.
 *  - defect #3: the mode/side pickers are a plain `role="group"` of toggle
 *    buttons (`aria-pressed`), not a fake `tablist`/`tab` pair.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { ScreenReaderAnnouncerProvider } from "@shared/components/ui/ScreenReaderAnnouncer";
import { BodyAtlas, type AtlasMuscleDatum } from "./BodyAtlas";

const DATA: Partial<Record<string, AtlasMuscleDatum>> = {
  chest: {
    fatigue: 0.9,
    daysSince: 1,
    load7d: 5000,
    status: "red",
    exercises: ["Жим лежачи"],
  },
  biceps: {
    fatigue: 0.5,
    daysSince: 2,
    load7d: 2000,
    status: "yellow",
    exercises: [],
  },
  abs: {
    fatigue: 0.1,
    daysSince: 4,
    load7d: 500,
    status: "green",
    exercises: [],
  },
  "upper-back": {
    fatigue: 0.6,
    daysSince: 2,
    load7d: 4000,
    status: "yellow",
    exercises: [],
  },
  gluteal: {
    fatigue: 0.35,
    daysSince: 3,
    load7d: 3000,
    status: "yellow",
    exercises: [],
  },
};

const renderAtlas = () =>
  render(
    <ScreenReaderAnnouncerProvider>
      <BodyAtlas data={DATA as Record<string, AtlasMuscleDatum>} />
    </ScreenReaderAnnouncerProvider>,
  );

beforeEach(() => {
  cleanup();
  // jsdom doesn't implement `scrollIntoView` — stubbed same as
  // `SearchResults.test.tsx` for the `focusMuscleId` mount effect below.
  Element.prototype.scrollIntoView = vi.fn();
});

describe("BodyAtlas · segmented controls", () => {
  it("renders mode + side toggle groups with the front view selected by default", () => {
    renderAtlas();
    // defect #3: real button groups, not a fake tablist/tab pair — no
    // aria-controls/tabpanel/roving-tabindex machinery to half-implement.
    expect(
      screen.getByRole("group", { name: "Режим карти мʼязів" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Відновлення" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Спереду" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Ззаду" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("switching side swaps muscle groups (front-only chest → back-only gluteal)", () => {
    renderAtlas();
    expect(screen.getByRole("button", { name: "Груди" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ззаду" }));

    expect(screen.getByRole("button", { name: "Ззаду" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Сідниці" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Груди" }),
    ).not.toBeInTheDocument();
  });
});

describe("BodyAtlas · muscle selection", () => {
  it("keeps the compact recovery preview non-interactive", () => {
    render(
      <BodyAtlas compact data={DATA as Record<string, AtlasMuscleDatum>} />,
    );

    expect(screen.queryByRole("button", { name: "Груди" })).toBeNull();
    expect(screen.queryByText(/Обери м.?яз/)).toBeNull();
  });

  it("muscle groups are role=button with Ukrainian aria-labels", () => {
    renderAtlas();
    expect(screen.getByRole("button", { name: "Груди" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Прес" })).toBeInTheDocument();
  });

  it("Enter activates a muscle and fills the detail card", () => {
    renderAtlas();
    fireEvent.keyDown(screen.getByRole("button", { name: "Груди" }), {
      key: "Enter",
    });
    expect(screen.getByText("потребує відпочинку")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getByText("Жим лежачи")).toBeInTheDocument();
  });

  it("Space activates a muscle", () => {
    renderAtlas();
    fireEvent.keyDown(screen.getByRole("button", { name: "Прес" }), {
      key: " ",
    });
    expect(screen.getByText("готовий до роботи")).toBeInTheDocument();
  });

  it("click selects a muscle and shows its fatigue", () => {
    renderAtlas();
    fireEvent.click(screen.getByRole("button", { name: "Біцепс" }));
    expect(screen.getByText("відновлюється")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("changing side clears the current selection", () => {
    renderAtlas();
    fireEvent.click(screen.getByRole("button", { name: "Груди" }));
    expect(screen.getByText("потребує відпочинку")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ззаду" }));
    expect(screen.getByText(/Обери м.?яз/)).toBeInTheDocument();
  });
});

describe("BodyAtlas · muscle a11y (fizruk audit wave 2)", () => {
  // defect #1: role="img" on the silhouette forces every descendant
  // presentational per ARIA (svg elements are in the "presentational
  // children" table for the `img` role), which makes the muscle
  // role="button"s unreachable for AT even though DOM-level queries in
  // jsdom still find them. The fix is removing the role, not swapping it.
  it("does not put role=img on the silhouette svg (would hide muscle buttons from AT)", () => {
    const { container } = renderAtlas();
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).not.toHaveAttribute("role", "img");
    expect(svg).toHaveAttribute("aria-label", "Атлас мʼязів, вигляд спереду");
  });

  // defect #2: selection needs both an on-demand state (aria-pressed) and
  // an announced state change (useAnnounce, since selecting a muscle isn't
  // a native form control with its own SR feedback).
  it("marks the selected muscle with aria-pressed and announces the change", async () => {
    renderAtlas();
    const chest = screen.getByRole("button", { name: "Груди" });
    expect(chest).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(chest);

    expect(chest).toHaveAttribute("aria-pressed", "true");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Обрано: Груди, потребує відпочинку",
      ),
    );
  });

  it("does not carry a fake tablist/tab pair for the mode/side pickers", () => {
    renderAtlas();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getAllByRole("group").length).toBeGreaterThanOrEqual(2);
  });
});

describe("BodyAtlas · over-trained muscle (QA 2026-08-23)", () => {
  /**
   * `fatigue` — накопичувальний бал, не частка: після двох грудних вправ
   * за день картка показувала «Втома 160%», а градієнт отримував
   * `color-mix(in oklab, … 219%, …)`. Відсоток понад 100 невалідний, тож
   * `stop-color` мовчки падав у ЧОРНИЙ і група ставала чорною плямою.
   */
  const OVERTRAINED = {
    ...DATA,
    chest: {
      fatigue: 1.6,
      daysSince: 0,
      load7d: 9000,
      status: "red",
      exercises: ["Жим лежачи"],
    },
  } as Record<string, AtlasMuscleDatum>;

  it("keeps every gradient stop colour a valid CSS colour", () => {
    const { container } = render(
      <ScreenReaderAnnouncerProvider>
        <BodyAtlas data={OVERTRAINED} />
      </ScreenReaderAnnouncerProvider>,
    );

    const stops = Array.from(container.querySelectorAll("stop"));
    expect(stops.length).toBeGreaterThan(0);
    for (const stop of stops) {
      const color = stop.getAttribute("stop-color") ?? "";
      expect(color).not.toBe("");
      expect(color).not.toContain("NaN");
      for (const match of color.matchAll(/(-?\d+(?:\.\d+)?)%/g)) {
        const pct = Number(match[1]);
        expect(pct, color).toBeGreaterThanOrEqual(0);
        expect(pct, color).toBeLessThanOrEqual(100);
      }
    }
  });

  it("saturates the fatigue readout at 100% instead of printing 160%", () => {
    render(
      <ScreenReaderAnnouncerProvider>
        <BodyAtlas data={OVERTRAINED} />
      </ScreenReaderAnnouncerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Груди" }));
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.queryByText("160%")).toBeNull();
  });
});

describe("BodyAtlas · hit targets (QA 2026-08-23)", () => {
  it("gives every muscle button a transparent widened hit layer", () => {
    renderAtlas();
    const chest = screen.getByRole("button", { name: "Груди" });
    const hitPaths = Array.from(chest.querySelectorAll("path"));
    expect(hitPaths.length).toBeGreaterThan(0);
    for (const path of hitPaths) {
      expect(path.getAttribute("pointer-events")).toBe("all");
      expect(path.getAttribute("stroke")).toBe("transparent");
      // Половини грудей розділені ≈2.8 одиниці viewBox — штрих мусить
      // перекрити проміжок, інакше тап у центр групи падає у голий <svg>.
      expect(Number(path.getAttribute("stroke-width"))).toBeGreaterThan(2.8);
    }
  });

  it("keeps the painted muscle layer clickable and hidden from AT", () => {
    const { container } = renderAtlas();
    const painted = container.querySelectorAll('g[aria-hidden="true"] title');
    expect(painted.length).toBeGreaterThan(0);
  });
});

describe("BodyAtlas · legend", () => {
  it("renders the mode legend captions", () => {
    renderAtlas();
    expect(screen.getByText("відновлено")).toBeInTheDocument();
    expect(screen.getByText("втомлено")).toBeInTheDocument();
  });
});

// Спека `fizruk-hero-recovery-bars.md` рішення 4 — тап по hero-рядку веде
// сюди з `focusMuscleId`.
describe("BodyAtlas · focusMuscleId (fizruk-hero-recovery-bars.md рішення 4)", () => {
  it("selects and announces a front-side group on mount without changing side", () => {
    render(
      <ScreenReaderAnnouncerProvider>
        <BodyAtlas
          data={DATA as Record<string, AtlasMuscleDatum>}
          focusMuscleId="chest"
        />
      </ScreenReaderAnnouncerProvider>,
    );
    expect(screen.getByRole("button", { name: "Груди" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Спереду" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("switches to the back side to focus a back-only group", () => {
    render(
      <ScreenReaderAnnouncerProvider>
        <BodyAtlas
          data={DATA as Record<string, AtlasMuscleDatum>}
          focusMuscleId="gluteal"
        />
      </ScreenReaderAnnouncerProvider>,
    );
    expect(screen.getByRole("button", { name: "Ззаду" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Сідниці" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("silently ignores an id the atlas cannot draw (injury zone like knee)", () => {
    render(
      <ScreenReaderAnnouncerProvider>
        <BodyAtlas
          data={DATA as Record<string, AtlasMuscleDatum>}
          focusMuscleId="knee"
        />
      </ScreenReaderAnnouncerProvider>,
    );
    // No crash, no muscle selected — page renders its normal empty-selection copy.
    expect(screen.getByText(/Обери м.?яз/)).toBeInTheDocument();
  });

  it("does nothing when focusMuscleId is absent", () => {
    renderAtlas();
    expect(screen.getByText(/Обери м.?яз/)).toBeInTheDocument();
  });
});
