// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { HashRedirect, parseRootLegacyHash } from "./HashRedirect";

function LocationProbe(): JSX.Element {
  const location = useLocation();
  return (
    <span data-testid="loc">
      {location.pathname + location.search + location.hash}
    </span>
  );
}

function renderWithHash(
  hash: string,
  initialEntries: string[] = ["/"],
): HTMLElement {
  // MemoryRouter doesn't model `window.location.hash` (its own router-
  // state lives in memory), so we set the real DOM hash directly. The
  // shim reads `window.location.hash` for the legacy URL parse and
  // `useLocation().pathname` from react-router for the root-gate.
  if (hash) window.location.hash = hash;
  const utils = render(
    <MemoryRouter initialEntries={initialEntries}>
      <HashRedirect />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
  return utils.getByTestId("loc");
}

beforeEach(() => {
  window.location.hash = "";
});
afterEach(() => {
  window.location.hash = "";
});

describe("parseRootLegacyHash()", () => {
  it("returns null for an empty hash", () => {
    expect(parseRootLegacyHash("")).toBeNull();
    expect(parseRootLegacyHash("#")).toBeNull();
    expect(parseRootLegacyHash("#/")).toBeNull();
  });

  it("returns null for hashes whose first segment is not a path-based module", () => {
    // Legacy `#welcome` or other non-module hashes should keep their
    // existing semantics — the shim is narrowly scoped to the four
    // Phase 2 modules.
    expect(parseRootLegacyHash("#welcome")).toBeNull();
    expect(parseRootLegacyHash("#section-2")).toBeNull();
    expect(parseRootLegacyHash("#profile")).toBeNull();
  });

  it("redirects bare module hashes to the canonical path", () => {
    expect(parseRootLegacyHash("#fizruk")).toBe("/fizruk");
    expect(parseRootLegacyHash("#finyk")).toBe("/finyk");
    expect(parseRootLegacyHash("#nutrition")).toBe("/nutrition");
    expect(parseRootLegacyHash("#routine")).toBe("/routine");
  });

  it("redirects module + page hashes to the canonical nested path", () => {
    expect(parseRootLegacyHash("#fizruk/workouts")).toBe("/fizruk/workouts");
    expect(parseRootLegacyHash("#fizruk/exercise/12")).toBe(
      "/fizruk/exercise/12",
    );
    expect(parseRootLegacyHash("#finyk/budgets")).toBe("/finyk/budgets");
    expect(parseRootLegacyHash("#nutrition/pantry/shopping")).toBe(
      "/nutrition/pantry/shopping",
    );
    expect(parseRootLegacyHash("#routine/stats")).toBe("/routine/stats");
  });

  it("strips a leading slash inside the hash (`#/fizruk` ≡ `#fizruk`)", () => {
    expect(parseRootLegacyHash("#/fizruk/workouts")).toBe("/fizruk/workouts");
    expect(parseRootLegacyHash("#/finyk/budgets")).toBe("/finyk/budgets");
  });

  it("preserves query strings encoded inside the hash", () => {
    // Legacy share-cards from Hub recommendations encoded the deep-link
    // params after the `?` inside the hash so that hashchange listeners
    // could read them. The redirect hoists them onto the regular URL.
    expect(parseRootLegacyHash("#finyk/budgets?cat=smoking")).toBe(
      "/finyk/budgets?cat=smoking",
    );
    expect(parseRootLegacyHash("#fizruk/exercise/abc-123?ref=push")).toBe(
      "/fizruk/exercise/abc-123?ref=push",
    );
  });

  it("does not redirect prefix-aliased module-like hashes", () => {
    // `#fizrukfoo` is not a fizruk URL; the shim must require an exact
    // first-segment match (mirrors `parsePathnameModule()` and
    // `isPathBasedModulePath()` boundaries).
    expect(parseRootLegacyHash("#fizrukfoo")).toBeNull();
    expect(parseRootLegacyHash("#finykprofile")).toBeNull();
    expect(parseRootLegacyHash("#routinemax")).toBeNull();
  });

  it("tolerates accidental input without a leading `#`", () => {
    // `window.location.hash` always includes the `#` when non-empty, but
    // the parser is defensive about callers feeding it the body only.
    expect(parseRootLegacyHash("fizruk/workouts")).toBe("/fizruk/workouts");
  });
});

describe("<HashRedirect />", () => {
  it("redirects `/#fizruk/workouts` to `/fizruk/workouts` on mount", () => {
    const loc = renderWithHash("#fizruk/workouts");
    // The redirect uses `replace: true`, so by the time the probe
    // renders the next frame the canonical pathname is in place.
    expect(loc.textContent).toBe("/fizruk/workouts");
  });

  it("redirects `/#finyk/budgets?cat=smoking` preserving the query", () => {
    const loc = renderWithHash("#finyk/budgets?cat=smoking");
    expect(loc.textContent).toBe("/finyk/budgets?cat=smoking");
  });

  it("redirects `/#routine/stats` to `/routine/stats`", () => {
    const loc = renderWithHash("#routine/stats");
    expect(loc.textContent).toBe("/routine/stats");
  });

  it("does not redirect when the pathname is not root", () => {
    // Module-internal hashes (e.g. `/fizruk#workouts`) are handled by
    // each module's own redirect-on-mount shim, not this one. The
    // root-gate keeps the two layers from double-navigating.
    const loc = renderWithHash("#workouts", ["/fizruk"]);
    // The shim is a no-op so the probe still sees the original entry
    // (the in-module shim runs separately when the module mounts).
    expect(loc.textContent?.startsWith("/fizruk")).toBe(true);
  });

  it("leaves non-module hashes alone (`/#welcome` keeps its existing semantics)", () => {
    const loc = renderWithHash("#welcome");
    // The shim must not redirect — `#welcome` is not a known
    // path-based module id. The probe stays at the initial entry
    // (router's own location does not include the DOM hash under
    // MemoryRouter, so we assert on pathname only here; the
    // `window.location.hash` is preserved at the DOM level which is
    // what the real BrowserRouter would see).
    expect(loc.textContent).toBe("/");
    expect(window.location.hash).toBe("#welcome");
  });

  it("is a no-op when no hash is present", () => {
    const loc = renderWithHash("");
    expect(loc.textContent).toBe("/");
  });
});
