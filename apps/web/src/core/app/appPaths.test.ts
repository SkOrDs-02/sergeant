import { describe, expect, it } from "vitest";
import {
  KNOWN_PATHS,
  PATH_BASED_MODULE_IDS,
  isPathBasedModulePath,
} from "./appPaths";

describe("PATH_BASED_MODULE_IDS", () => {
  it("includes the modules migrated to path-based URLs (initiative 0006 Phase 2)", () => {
    // The set is the cross-cutting source of truth for `useHubNavigation`
    // (router-side) and `StandaloneRoutes` (404 fallback). Whenever a new
    // module migrates, this expectation is updated and both consumers
    // pick it up automatically.
    expect(PATH_BASED_MODULE_IDS.has("nutrition")).toBe(true);
    expect(PATH_BASED_MODULE_IDS.has("finyk")).toBe(true);
  });

  it("does not include modules still on the legacy `?module=<id>` URL contract", () => {
    expect(PATH_BASED_MODULE_IDS.has("fizruk")).toBe(false);
    expect(PATH_BASED_MODULE_IDS.has("routine")).toBe(false);
  });
});

describe("isPathBasedModulePath()", () => {
  it("matches the bare module root (`/finyk`, `/nutrition`)", () => {
    expect(isPathBasedModulePath("/finyk")).toBe(true);
    expect(isPathBasedModulePath("/nutrition")).toBe(true);
  });

  it("matches nested module URLs (`/finyk/budgets`, `/nutrition/log`)", () => {
    expect(isPathBasedModulePath("/finyk/budgets")).toBe(true);
    expect(isPathBasedModulePath("/finyk/budgets?cat=smoking")).toBe(true);
    expect(isPathBasedModulePath("/nutrition/log")).toBe(true);
    expect(isPathBasedModulePath("/nutrition/pantry/shopping")).toBe(true);
  });

  it("does not match modules that have not migrated yet", () => {
    expect(isPathBasedModulePath("/fizruk")).toBe(false);
    expect(isPathBasedModulePath("/routine")).toBe(false);
    expect(isPathBasedModulePath("/fizruk/exercise/12")).toBe(false);
  });

  it("does not match prefix-aliased URLs (boundary check)", () => {
    // `/finykfoo` is a different surface and must not be aliased to
    // finyk — same boundary `parsePathnameModule()` enforces in
    // `useHubNavigation.ts`.
    expect(isPathBasedModulePath("/finykprofile")).toBe(false);
    expect(isPathBasedModulePath("/nutritionish")).toBe(false);
  });

  it("does not match the root or other surfaces", () => {
    expect(isPathBasedModulePath("/")).toBe(false);
    expect(isPathBasedModulePath("/sign-in")).toBe(false);
    expect(isPathBasedModulePath("/welcome")).toBe(false);
    expect(isPathBasedModulePath("/profile")).toBe(false);
  });

  it("rejects malformed input defensively", () => {
    expect(isPathBasedModulePath("")).toBe(false);
    expect(isPathBasedModulePath("finyk")).toBe(false); // missing leading "/"
    // Cast to bypass the type guard — runtime input from `useLocation()`
    // is always a string, but the function is defensive about it.
    expect(isPathBasedModulePath(null as unknown as string)).toBe(false);
    expect(isPathBasedModulePath(undefined as unknown as string)).toBe(false);
  });

  it("does not consider path-based-module paths members of KNOWN_PATHS", () => {
    // Sanity check on the StandaloneRoutes contract: KNOWN_PATHS owns
    // standalone surfaces only, and the path-based-module exemption
    // is what keeps `/finyk` etc. from short-circuiting into the 404.
    expect(KNOWN_PATHS.has("/finyk")).toBe(false);
    expect(KNOWN_PATHS.has("/nutrition")).toBe(false);
  });
});
