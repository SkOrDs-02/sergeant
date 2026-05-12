/**
 * Unit tests for `loadCheapRouterSystemPrompt` + `stripHtmlComments`.
 * Validates HTML-comment stripping, undefined-path passthrough, missing-
 * file error reporting, and empty-file detection.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  loadCheapRouterSystemPrompt,
  stripHtmlComments,
} from "./system-prompt.js";

describe("stripHtmlComments", () => {
  it("removes single-line HTML comments", () => {
    expect(stripHtmlComments("<!-- meta -->classify A vs B")).toBe(
      "classify A vs B",
    );
  });

  it("removes multi-line HTML comments", () => {
    const input = "<!--\n  Last validated: 2026-05-11\n-->\nactual prompt";
    expect(stripHtmlComments(input).trim()).toBe("actual prompt");
  });

  it("is a no-op when no comments present", () => {
    expect(stripHtmlComments("plain prompt")).toBe("plain prompt");
  });
});

describe("loadCheapRouterSystemPrompt", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "openclaw-cheap-router-prompt-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns { attempted: false, prompt: undefined } when path is undefined", () => {
    const result = loadCheapRouterSystemPrompt(undefined);
    expect(result).toEqual({ prompt: undefined, attempted: false });
  });

  it("returns { attempted: false, prompt: undefined } when path is empty string", () => {
    const result = loadCheapRouterSystemPrompt("");
    expect(result).toEqual({ prompt: undefined, attempted: false });
  });

  it("loads and strips comments when file exists", () => {
    const file = join(dir, "prompt.md");
    writeFileSync(
      file,
      "<!-- Header doc-only block -->\n\nClassify input into A/B/C.\n",
    );
    const result = loadCheapRouterSystemPrompt(file);
    expect(result.attempted).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.prompt).toBe("Classify input into A/B/C.");
  });

  it("reports error when file does not exist", () => {
    const result = loadCheapRouterSystemPrompt(join(dir, "missing.md"));
    expect(result.attempted).toBe(true);
    expect(result.prompt).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/ENOENT/);
  });

  it("reports error when file is empty after comment-stripping", () => {
    const file = join(dir, "empty.md");
    writeFileSync(file, "<!-- only docs -->");
    const result = loadCheapRouterSystemPrompt(file);
    expect(result.attempted).toBe(true);
    expect(result.prompt).toBeUndefined();
    expect(result.error).toMatch(/empty/);
  });
});
