// @vitest-environment jsdom
/**
 * BodyAtlas tests — pure-SVG renderer (no body-highlighter).
 *
 * Covers:
 *  - Mode + side segmented controls render and toggle aria-selected.
 *  - Switching side swaps the muscle set (front-only vs back-only groups).
 *  - Muscle groups are keyboard-focusable role="button" with a UA aria-label.
 *  - Enter / Space / click select a muscle and populate the detail card.
 *  - The detail card surfaces status, fatigue and exercise chips.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
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
  render(<BodyAtlas data={DATA as Record<string, AtlasMuscleDatum>} />);

beforeEach(cleanup);

describe("BodyAtlas · segmented controls", () => {
  it("renders mode + side tabs with the front view selected by default", () => {
    renderAtlas();
    expect(screen.getByRole("tab", { name: "Відновлення" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Спереду" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Ззаду" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("switching side swaps muscle groups (front-only chest → back-only gluteal)", () => {
    renderAtlas();
    expect(screen.getByRole("button", { name: "Груди" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Ззаду" }));

    expect(screen.getByRole("tab", { name: "Ззаду" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("button", { name: "Сідниці" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Груди" }),
    ).not.toBeInTheDocument();
  });
});

describe("BodyAtlas · muscle selection", () => {
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

    fireEvent.click(screen.getByRole("tab", { name: "Ззаду" }));
    expect(screen.getByText(/Оберіть м.?яз/)).toBeInTheDocument();
  });
});

describe("BodyAtlas · legend", () => {
  it("renders the mode legend captions", () => {
    renderAtlas();
    expect(screen.getByText("відновлено")).toBeInTheDocument();
    expect(screen.getByText("втомлено")).toBeInTheDocument();
  });
});
