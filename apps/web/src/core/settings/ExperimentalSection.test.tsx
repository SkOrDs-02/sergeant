// @vitest-environment jsdom
//
// PR-36 ux-roast 2026-Q2 / §9.3 — гейт перед увімкненням expermental-toggles:
// до першого ack чекбокс видно, тумблери ігнорують зміну стану; після ack
// чекбокс зникає, тумблери поводяться як звичайна група.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { messages } from "@shared/i18n/uk";

import {
  __experimentalAcknowledgmentStoreForTests,
  ExperimentalSection,
} from "./ExperimentalSection";
import { __flagsStoreForTests, FLAG_REGISTRY } from "../lib/featureFlags";

const COPY = messages.experimentalSection;

function expandSection(): void {
  fireEvent.click(screen.getByText(COPY.title));
}

beforeEach(() => {
  localStorage.clear();
  __experimentalAcknowledgmentStoreForTests.reset();
  __flagsStoreForTests.reset();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("ExperimentalSection (PR-36 / §9.3)", () => {
  it("renders the warning banner copy from the i18n catalog", () => {
    render(<ExperimentalSection />);
    expandSection();

    expect(screen.getByText(COPY.warningBanner)).toBeTruthy();
    // banner sits as a `role="note"` so screen-readers announce it as
    // ancillary content, not a pushed alert.
    const note = screen.getByRole("note");
    expect(note.textContent).toContain(COPY.warningBanner);
  });

  it("requires the opt-in checkbox before any toggle can flip", () => {
    render(<ExperimentalSection />);
    expandSection();

    // Acceptance: «Перший раз — checkbox обов'язковий…»
    expect(screen.getByText(COPY.optInLabel)).toBeTruthy();
    expect(screen.getByTestId("experimental-opt-in")).toBeTruthy();

    const firstFlag = FLAG_REGISTRY.find((f) => f.experimental);
    if (!firstFlag) throw new Error("expected at least one experimental flag");

    // Tap the first toggle while still locked — нічого не міняється у store.
    const row = screen.getByText(firstFlag.label).closest("label");
    if (!row) throw new Error("toggle row missing");
    const toggleInput = row.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement | null;
    if (!toggleInput) throw new Error("toggle input missing");
    fireEvent.click(toggleInput);

    expect(__flagsStoreForTests.get()[firstFlag.id]).toBeUndefined();
  });

  it("hides the opt-in once acknowledged and persists the ack", () => {
    render(<ExperimentalSection />);
    expandSection();

    // «… потім toggle відкритий»: ack stays in storage, поки користувач не
    // очистив сайт-дату.
    fireEvent.click(screen.getByTestId("experimental-opt-in"));

    expect(screen.queryByText(COPY.optInLabel)).toBeNull();
    expect(screen.queryByTestId("experimental-opt-in")).toBeNull();
    expect(__experimentalAcknowledgmentStoreForTests.get().acknowledged).toBe(
      true,
    );

    // Тумблер тепер реагує на клік.
    const firstFlag = FLAG_REGISTRY.find((f) => f.experimental);
    if (!firstFlag) throw new Error("expected at least one experimental flag");
    const row = screen.getByText(firstFlag.label).closest("label");
    if (!row) throw new Error("toggle row missing");
    const toggleInput = row.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement | null;
    if (!toggleInput) throw new Error("toggle input missing");
    fireEvent.click(toggleInput);

    expect(__flagsStoreForTests.get()[firstFlag.id]).toBe(
      !firstFlag.defaultValue,
    );
  });
});
