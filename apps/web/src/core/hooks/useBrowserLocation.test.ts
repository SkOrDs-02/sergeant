import { describe, it, expect } from "vitest";
import {
  resolveBrowserLocation,
  type BrowserLocationSnapshot,
} from "./useBrowserLocation";

const loc = (
  pathname: string,
  search = "",
  hash = "",
): BrowserLocationSnapshot => ({ pathname, search, hash });

describe("resolveBrowserLocation", () => {
  it("defers to routerLocation before any native event (empty snapshot)", () => {
    expect(resolveBrowserLocation("", loc("/nutrition"))).toEqual(
      loc("/nutrition"),
    );
  });

  it("parses the snapshot when there is no routerLocation", () => {
    expect(resolveBrowserLocation("/finyk?tab=x#frag")).toEqual(
      loc("/finyk", "?tab=x", "#frag"),
    );
  });

  it("follows routerLocation after a pushState nav past a stale snapshot (tabs-redirect-to-nutrition regression)", () => {
    // Snapshot was armed by a browser-back popstate at /nutrition, then the
    // user tapped a bottom-nav tab (pushState) → router advanced to the hub
    // settings tab while the snapshot stayed frozen at /nutrition.
    const resolved = resolveBrowserLocation(
      "/nutrition",
      loc("/", "?tab=settings"),
    );
    expect(resolved).toEqual(loc("/", "?tab=settings"));
  });

  it("follows routerLocation when only the search differs", () => {
    expect(
      resolveBrowserLocation("/?tab=reports", loc("/", "?tab=settings")),
    ).toEqual(loc("/", "?tab=settings"));
  });

  it("still surfaces a direct hash mutation when pathname+search match", () => {
    // Legacy hash-router module mutated window.location.hash directly; the
    // router never saw it, so the snapshot's hash must win for the same route.
    expect(
      resolveBrowserLocation("/nutrition#log", loc("/nutrition", "", "")),
    ).toEqual(loc("/nutrition", "", "#log"));
  });

  it("normalizes an empty parsed pathname to '/'", () => {
    expect(resolveBrowserLocation("?tab=x").pathname).toBe("/");
  });
});
