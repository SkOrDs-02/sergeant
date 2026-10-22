/** @vitest-environment jsdom */
/**
 * Last validated: 2026-10-22
 * Status: Active
 *
 * AI-CONTEXT: follow-up CodeRabbit до #1574 (data-05). Два провали:
 *   * банер брав рядки напряму з `uk.ts`, тож EN-локаль бачила українську;
 *   * «закрито» жило в `useState` і губилось при розмонтуванні `ModuleShell`
 *     (перехід між модулями), тож закритий банер вертався без нового збою.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { messagesEn } from "@shared/i18n/en";
import { messages as uk } from "@shared/i18n/uk";

import { StorageDegradedBanner } from "./StorageDegradedBanner";
import {
  __resetStorageDegradedForTests,
  noteStorageWriteFailed,
  noteStorageWriteRecovered,
} from "./storageDegradedState";

const ukM = uk.durability.storageDegraded;

beforeEach(() => {
  __resetStorageDegradedForTests();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  __resetStorageDegradedForTests();
});

describe("StorageDegradedBanner", () => {
  it("нічого не показує без збою", () => {
    const { container } = render(<StorageDegradedBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("показує українські рядки за замовчуванням", () => {
    render(<StorageDegradedBanner />);
    act(() => noteStorageWriteFailed());
    expect(screen.getByText(ukM.title)).toBeTruthy();
  });

  it("показує англійські рядки в EN-локалі", () => {
    localStorage.setItem("sergeant:locale", "en");
    render(<StorageDegradedBanner />);
    act(() => noteStorageWriteFailed());
    const enM = messagesEn.durability?.storageDegraded;
    expect(enM).toBeTruthy();
    expect(screen.getByText(enM!.title)).toBeTruthy();
    expect(screen.queryByText(ukM.title)).toBeNull();
    expect(
      screen.getByRole("button", { name: enM!.dismissLabel }),
    ).toBeTruthy();
  });

  it("закритий банер не вертається після розмонтування й нового монтування", () => {
    const first = render(<StorageDegradedBanner />);
    act(() => noteStorageWriteFailed());
    fireEvent.click(screen.getByRole("button", { name: ukM.dismissLabel }));
    expect(screen.queryByRole("alert")).toBeNull();

    first.unmount(); // перехід між модулями розмонтовує ModuleShell
    render(<StorageDegradedBanner />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("новий збій (більший seq) показує закритий банер знову", () => {
    render(<StorageDegradedBanner />);
    act(() => noteStorageWriteFailed());
    fireEvent.click(screen.getByRole("button", { name: ukM.dismissLabel }));
    expect(screen.queryByRole("alert")).toBeNull();

    act(() => noteStorageWriteFailed());
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("зникає сам після відновлення запису", () => {
    render(<StorageDegradedBanner />);
    act(() => noteStorageWriteFailed());
    expect(screen.getByRole("alert")).toBeTruthy();
    act(() => noteStorageWriteRecovered());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
