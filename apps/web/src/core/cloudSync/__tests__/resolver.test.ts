// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { resolveInitialSync } from "../conflict/resolver";

const noopGetLocal = () => 0;

// PR #030 retired `fizruk`, PR #034 retired `nutrition` and PR #039
// retired `finyk` from SYNC_MODULES (storage-roadmap Stage 4); only
// `profile` remains. The resolver itself doesn't validate module
// names — it just classifies a generic
// `Record<string, PullAllModuleBody>` — but using the post-retirement
// set keeps fixtures honest. Multi-module assertions use a synthetic
// `_legacy_finyk` placeholder that does NOT collide with any active
// SYNC_MODULES entry.
describe("resolveInitialSync", () => {
  it("adopts cloud when there's no local data", () => {
    const plan = resolveInitialSync({
      cloud: {
        profile: { data: { a: 1 }, version: 7 },
      },
      hasAnyLocalData: false,
      migrated: false,
      userId: "u1",
      modifiedTimes: {},
      getLocalVersion: noopGetLocal,
      dirtyModules: {},
    });
    expect(plan.kind).toBe("adoptCloud");
    if (plan.kind === "adoptCloud") {
      expect(plan.applyModules).toEqual([
        { mod: "profile", data: { a: 1 }, version: 7 },
      ]);
    }
  });

  it("requests migration when there's local data but empty cloud and not migrated", () => {
    const plan = resolveInitialSync({
      cloud: {},
      hasAnyLocalData: true,
      migrated: false,
      userId: "u1",
      modifiedTimes: {},
      getLocalVersion: noopGetLocal,
      dirtyModules: {},
    });
    expect(plan.kind).toBe("needMigration");
  });

  it("merges when both sides have data — cloud wins on higher version", () => {
    const plan = resolveInitialSync({
      cloud: {
        profile: { data: { a: 2 }, version: 10 },
      },
      hasAnyLocalData: true,
      migrated: true,
      userId: "u1",
      modifiedTimes: { profile: "2024-01-01T00:00:00.000Z" },
      getLocalVersion: (_u, mod) => (mod === "profile" ? 5 : 0),
      dirtyModules: {},
    });
    expect(plan.kind).toBe("merge");
    if (plan.kind === "merge") {
      expect(plan.applyModules).toEqual([{ mod: "profile", data: { a: 2 } }]);
      expect(plan.setVersions).toEqual([{ mod: "profile", version: 10 }]);
      expect(plan.dirtyMods).toEqual([]);
    }
  });

  it("merges when both sides have data — cloud wins on newer serverUpdatedAt", () => {
    const plan = resolveInitialSync({
      cloud: {
        profile: {
          data: { w: 1 },
          version: 5,
          serverUpdatedAt: "2024-06-01T00:00:00.000Z",
        },
      },
      hasAnyLocalData: true,
      migrated: true,
      userId: "u1",
      modifiedTimes: { profile: "2024-01-01T00:00:00.000Z" },
      getLocalVersion: () => 5,
      dirtyModules: {},
    });
    expect(plan.kind).toBe("merge");
    if (plan.kind === "merge") {
      expect(plan.applyModules).toEqual([{ mod: "profile", data: { w: 1 } }]);
    }
  });

  it("merges but does not apply when local is newer than cloud", () => {
    const plan = resolveInitialSync({
      cloud: {
        profile: {
          data: { w: 1 },
          version: 5,
          serverUpdatedAt: "2024-01-01T00:00:00.000Z",
        },
      },
      hasAnyLocalData: true,
      migrated: true,
      userId: "u1",
      modifiedTimes: { profile: "2024-06-01T00:00:00.000Z" },
      getLocalVersion: () => 5,
      dirtyModules: {},
    });
    expect(plan.kind).toBe("merge");
    if (plan.kind === "merge") {
      expect(plan.applyModules).toEqual([]);
      expect(plan.setVersions).toEqual([{ mod: "profile", version: 5 }]);
    }
  });

  it("surfaces dirty modules in the merge plan", () => {
    const plan = resolveInitialSync({
      cloud: {
        profile: { data: { a: 1 }, version: 1 },
      },
      hasAnyLocalData: true,
      migrated: true,
      userId: "u1",
      modifiedTimes: {},
      getLocalVersion: () => 0,
      dirtyModules: { _legacy_routine: true, _legacy_nutrition: true },
    });
    expect(plan.kind).toBe("merge");
    if (plan.kind === "merge") {
      expect(plan.dirtyMods.sort()).toEqual([
        "_legacy_nutrition",
        "_legacy_routine",
      ]);
      expect(plan.skippedDirty).toEqual([]);
    }
  });

  it("does NOT apply cloud data for dirty modules (protects unpushed local changes)", () => {
    const plan = resolveInitialSync({
      cloud: {
        // cloud-version новіша, але локально є непушнуті зміни → skip, не apply
        profile: { data: { cloud: 1 }, version: 9 },
        // не dirty → має накотитись з хмари як зазвичай
        _legacy_finyk: { data: { cloud: 2 }, version: 3 },
      },
      hasAnyLocalData: true,
      migrated: true,
      userId: "u1",
      modifiedTimes: { profile: "2024-01-01T00:00:00.000Z" },
      getLocalVersion: () => 0,
      dirtyModules: { profile: true },
    });
    expect(plan.kind).toBe("merge");
    if (plan.kind === "merge") {
      expect(plan.applyModules).toEqual([
        { mod: "_legacy_finyk", data: { cloud: 2 } },
      ]);
      expect(plan.skippedDirty).toEqual(["profile"]);
      expect(plan.dirtyMods).toEqual(["profile"]);
    }
  });

  it("returns noop when neither side has data", () => {
    const plan = resolveInitialSync({
      cloud: undefined,
      hasAnyLocalData: false,
      migrated: true,
      userId: "u1",
      modifiedTimes: {},
      getLocalVersion: noopGetLocal,
      dirtyModules: {},
    });
    expect(plan.kind).toBe("noop");
  });

  it("treats cloud with only empty-data entries as no cloud data", () => {
    const plan = resolveInitialSync({
      cloud: { profile: { data: {} } },
      hasAnyLocalData: true,
      migrated: false,
      userId: "u1",
      modifiedTimes: {},
      getLocalVersion: noopGetLocal,
      dirtyModules: {},
    });
    expect(plan.kind).toBe("needMigration");
  });
});
