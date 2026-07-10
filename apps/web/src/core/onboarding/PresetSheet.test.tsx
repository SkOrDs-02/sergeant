/** @vitest-environment jsdom */
/**
 * PresetSheet — FTUX bottom-sheet presets: catalog lookup, analytics,
 * routine persist vs finyk prefill+navigate, and empty-item modules.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const openHubModuleWithAction = vi.hoisted(() => vi.fn());
const applyPreset = vi.hoisted(() => vi.fn());
const writePresetPrefill = vi.hoisted(() => vi.fn());

vi.mock("@shared/lib/modules/hubNav", () => ({ openHubModuleWithAction }));
vi.mock("./presetApply", () => ({ applyPreset }));
vi.mock("./presetPrefill", () => ({ writePresetPrefill }));

vi.mock("../observability/analytics", async () => {
  const actual = await vi.importActual<
    typeof import("../observability/analytics")
  >("../observability/analytics");
  return { ...actual, trackEvent: vi.fn() };
});

import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";
import { PresetSheet, getPresetModule } from "./PresetSheet";

describe("getPresetModule", () => {
  it("returns null for null, undefined, or unknown module ids", () => {
    expect(getPresetModule(null)).toBeNull();
    expect(getPresetModule(undefined)).toBeNull();
    expect(getPresetModule("hub")).toBeNull();
  });

  it("returns catalog config for each supported module", () => {
    expect(getPresetModule("routine")?.title).toBe("Яку звичку почнемо?");
    expect(getPresetModule("finyk")?.fallback.label).toBe("Своя витрата");
    expect(getPresetModule("nutrition")?.items).toEqual([]);
    expect(getPresetModule("fizruk")?.fallback.action).toBe("start_workout");
  });
});

describe("PresetSheet", () => {
  const onClose = vi.fn();
  const onPick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(cleanup);

  it("renders nothing when moduleId is null", () => {
    const { container } = render(
      <PresetSheet open moduleId={null} onClose={onClose} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("fires FTUX_PRESET_SHEET_SHOWN when opened with a valid module", () => {
    render(<PresetSheet open moduleId="routine" onClose={onClose} />);
    expect(trackEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.FTUX_PRESET_SHEET_SHOWN,
      { module: "routine", presetCount: 3 },
    );
  });

  it("persists a routine preset via applyPreset and notifies onPick", () => {
    render(
      <PresetSheet open moduleId="routine" onClose={onClose} onPick={onPick} />,
    );
    fireEvent.click(screen.getByText("Випити воду"));
    expect(applyPreset).toHaveBeenCalledWith("routine", {
      name: "Випити воду",
      emoji: "💧",
    });
    expect(trackEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.FTUX_PRESET_PICKED,
      { module: "routine", presetId: "water" },
    );
    expect(onPick).toHaveBeenCalledWith({
      moduleId: "routine",
      presetId: "water",
      persisted: true,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("prefills finyk data and opens add_expense without persisting", () => {
    render(
      <PresetSheet open moduleId="finyk" onClose={onClose} onPick={onPick} />,
    );
    fireEvent.click(screen.getByText("Кава"));
    expect(writePresetPrefill).toHaveBeenCalledWith("finyk", {
      description: "Кава",
      category: "їжа",
    });
    expect(openHubModuleWithAction).toHaveBeenCalledWith(
      "finyk",
      "add_expense",
    );
    expect(applyPreset).not.toHaveBeenCalled();
    expect(onPick).toHaveBeenCalledWith({
      moduleId: "finyk",
      presetId: "coffee",
      persisted: false,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("clears stale prefill and opens the custom fallback CTA", () => {
    render(
      <PresetSheet open moduleId="finyk" onClose={onClose} onPick={onPick} />,
    );
    fireEvent.click(screen.getByText("Своя витрата"));
    expect(writePresetPrefill).toHaveBeenCalledWith("finyk", null);
    expect(trackEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.FTUX_PRESET_CUSTOM,
      { module: "finyk", via: "fallback" },
    );
    expect(onPick).toHaveBeenCalledWith({
      moduleId: "finyk",
      presetId: null,
      custom: true,
      persisted: false,
    });
    expect(onClose).toHaveBeenCalled();
    expect(openHubModuleWithAction).toHaveBeenCalledWith(
      "finyk",
      "add_expense",
    );
  });

  it("renders only the fallback row for nutrition (no preset tiles)", () => {
    render(<PresetSheet open moduleId="nutrition" onClose={onClose} />);
    expect(screen.getByText("Що з'їв зараз?")).toBeInTheDocument();
    expect(screen.queryByText("Кава")).not.toBeInTheDocument();
    expect(screen.getByText("Додати страву")).toBeInTheDocument();
  });

  it("opens fizruk workout via fallback when items list is empty", () => {
    render(<PresetSheet open moduleId="fizruk" onClose={onClose} />);
    fireEvent.click(screen.getByText("Почати тренування"));
    expect(writePresetPrefill).toHaveBeenCalledWith("fizruk", null);
    expect(openHubModuleWithAction).toHaveBeenCalledWith(
      "fizruk",
      "start_workout",
    );
  });
});
