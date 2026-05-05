import path from "node:path";
import { describe, expect, it } from "vitest";
import { OpenClawPathTraversalError, safeJoin } from "./safeJoin.js";

// L8 — `docs/security/hardening/L8-openclaw-repo-root-traversal.md`. Cover
// the boundary cases the hardening review called out (`..`, absolute roots,
// NUL bytes, empty input) plus a couple of non-obvious quirks of `path`
// semantics (collapsing `..` mid-string still passes when it stays inside
// root; sibling-prefix `/app-other` does NOT match `/app`).
describe("safeJoin (L8 path-traversal guard)", () => {
  const root = "/app";

  it("returns the resolved path for a simple relative file", () => {
    expect(safeJoin(root, "docs/strategy/openclaw.md")).toBe(
      path.resolve(root, "docs/strategy/openclaw.md"),
    );
  });

  it("normalises `./` segments in candidate", () => {
    expect(safeJoin(root, "./docs/strategy.md")).toBe(
      path.resolve(root, "docs/strategy.md"),
    );
  });

  it("collapses `..` segments that stay inside root", () => {
    expect(safeJoin(root, "docs/strategy/../launch/foo.md")).toBe(
      path.resolve(root, "docs/launch/foo.md"),
    );
  });

  it("rejects `..` that escapes root", () => {
    expect(() => safeJoin(root, "../etc/passwd")).toThrow(
      OpenClawPathTraversalError,
    );
  });

  it("rejects deep `..` chains that escape root", () => {
    expect(() => safeJoin(root, "docs/../../etc/passwd")).toThrow(
      OpenClawPathTraversalError,
    );
  });

  it("rejects POSIX absolute candidate", () => {
    expect(() => safeJoin(root, "/etc/passwd")).toThrow(
      OpenClawPathTraversalError,
    );
  });

  it("rejects empty candidate", () => {
    expect(() => safeJoin(root, "")).toThrow(OpenClawPathTraversalError);
  });

  it("rejects NUL byte in candidate", () => {
    expect(() => safeJoin(root, "docs/foo\u0000.md")).toThrow(
      OpenClawPathTraversalError,
    );
  });

  it("does NOT match a sibling prefix (e.g. /app-other vs /app)", () => {
    // path.resolve('/app', '../app-other/foo') resolves to /app-other/foo,
    // which is NOT inside /app even though the prefix `/app` matches as
    // a substring. The guard uses `root + path.sep` to enforce a real
    // directory boundary.
    expect(() => safeJoin(root, "../app-other/foo")).toThrow(
      OpenClawPathTraversalError,
    );
  });

  it("returns root itself when candidate normalises to '.'", () => {
    expect(safeJoin(root, ".")).toBe(path.resolve(root));
  });

  it("works with a non-canonical root (path.resolve normalises it)", () => {
    // `safeJoin` resolves `root` itself, so passing it with redundant
    // separators or `..`-segments still works the same way.
    expect(safeJoin("/app/./", "docs/strategy.md")).toBe(
      path.resolve("/app/docs/strategy.md"),
    );
  });

  it("error name is OpenClawPathTraversalError (for catch-typing)", () => {
    try {
      safeJoin(root, "../etc/passwd");
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OpenClawPathTraversalError);
      expect((err as Error).name).toBe("OpenClawPathTraversalError");
    }
  });
});
