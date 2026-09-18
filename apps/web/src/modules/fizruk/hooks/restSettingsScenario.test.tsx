// @vitest-environment jsdom
/**
 * Integration test (T-7): component + hook + storage.
 *
 * Last validated: 2026-06-15
 * Status: Active
 *
 * fizruk is local-first — there is no server endpoint behind rest settings, so
 * this integration test wires a component to `useRestSettings` and asserts the
 * full round-trip through localStorage instead of MSW (which is N/A here):
 * a control component renders the current compound default, the user bumps it,
 * and a *separate* reader component — mounted fresh — reflects the persisted
 * value. This proves the hook's localStorage write is the shared source of
 * truth across independently-mounted consumers, the local-first analogue of the
 * MSW network round-trip used by the finyk/nutrition integration suites.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRestSettings } from "./useRestSettings";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  cleanup();
});

function RestEditor() {
  const { settings, updateSetting } = useRestSettings();
  return (
    <div>
      <span data-testid="editor-compound">{settings.compound}</span>
      <button type="button" onClick={() => updateSetting("compound", 150)}>
        bump compound
      </button>
    </div>
  );
}

function RestReader() {
  const { getDefaultForGroup } = useRestSettings();
  // "chest" classifies as a compound group.
  return <span data-testid="reader-chest">{getDefaultForGroup("chest")}</span>;
}

describe("rest settings · component + hook + storage round-trip", () => {
  it("a persisted edit is observed by a freshly-mounted reader", () => {
    const editor = render(<RestEditor />);
    expect(screen.getByTestId("editor-compound")).toHaveTextContent("90");

    fireEvent.click(screen.getByRole("button", { name: "bump compound" }));
    expect(screen.getByTestId("editor-compound")).toHaveTextContent("150");

    // Unmount the editor; mount an independent reader that initialises from
    // the same localStorage slot.
    editor.unmount();

    render(<RestReader />);
    expect(screen.getByTestId("reader-chest")).toHaveTextContent("150");
  });
});
