import { describe, expect, it } from "vitest";
import { PATH_BASED_MODULE_IDS, isPathBasedModulePath } from "./appPaths";

// Note: tests that cross-check `KNOWN_PATHS` ↔ `isPathBasedModulePath`
// live in `StandaloneRoutes.test.tsx` (which already imports the full
// routing graph). `appPaths.test.ts` stays lightweight — it only imports
// from `appPaths.ts` so it can run without the StandaloneRoutes dependency
// chain (which requires `@sergeant/db-schema/sqlite` to be built).

describe("PATH_BASED_MODULE_IDS", () => {
  it("includes the modules migrated to path-based URLs (initiative 0006 Phase 2)", () => {
    // The set is the cross-cutting source of truth for `useHubNavigation`
    // (router-side) and `StandaloneRoutes` (404 fallback). Whenever a new
    // module migrates, this expectation is updated and both consumers
    // pick it up automatically.
    expect(PATH_BASED_MODULE_IDS.has("nutrition")).toBe(true);
    expect(PATH_BASED_MODULE_IDS.has("finyk")).toBe(true);
    expect(PATH_BASED_MODULE_IDS.has("fizruk")).toBe(true);
    expect(PATH_BASED_MODULE_IDS.has("routine")).toBe(true);
  });

  it("does not include unknown / non-domain ids", () => {
    expect(PATH_BASED_MODULE_IDS.has("welcome")).toBe(false);
    expect(PATH_BASED_MODULE_IDS.has("profile")).toBe(false);
  });
});

describe("isPathBasedModulePath()", () => {
  it("matches the bare module root (`/finyk`, `/nutrition`, `/fizruk`, `/routine`)", () => {
    expect(isPathBasedModulePath("/finyk")).toBe(true);
    expect(isPathBasedModulePath("/nutrition")).toBe(true);
    expect(isPathBasedModulePath("/fizruk")).toBe(true);
    expect(isPathBasedModulePath("/routine")).toBe(true);
  });

  it("matches nested module URLs (`/finyk/budgets`, `/nutrition/log`, `/fizruk/exercise/12`, `/routine/stats`)", () => {
    expect(isPathBasedModulePath("/finyk/budgets")).toBe(true);
    expect(isPathBasedModulePath("/finyk/budgets?cat=smoking")).toBe(true);
    expect(isPathBasedModulePath("/nutrition/log")).toBe(true);
    expect(isPathBasedModulePath("/nutrition/pantry/shopping")).toBe(true);
    expect(isPathBasedModulePath("/fizruk/workouts")).toBe(true);
    expect(isPathBasedModulePath("/fizruk/exercise/12")).toBe(true);
    expect(isPathBasedModulePath("/routine/stats")).toBe(true);
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
});
