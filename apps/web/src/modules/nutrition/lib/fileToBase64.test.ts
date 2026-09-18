// @vitest-environment jsdom
/**
 * Last validated: 2026-06-24
 * Status: Active
 * Unit tests for the FileReader-backed base64 extractor.
 */
import { describe, expect, it } from "vitest";

import { fileToBase64 } from "./fileToBase64";

describe("fileToBase64", () => {
  it("strips the data-URL prefix and returns the base64 payload", async () => {
    // "hi" → data:application/octet-stream;base64,aGk=
    const blob = new Blob(["hi"], { type: "text/plain" });
    const out = await fileToBase64(blob);
    // jsdom's FileReader produces a real data URL; everything after
    // "base64," must be the encoded payload.
    expect(out).toBe(btoa("hi"));
    expect(out).not.toContain("base64,");
  });

  it("returns an empty string for an empty blob payload", async () => {
    const out = await fileToBase64(new Blob([], { type: "text/plain" }));
    expect(out).toBe("");
  });

  it("returns the whole string when there is no base64 marker", async () => {
    // A FileReader that resolves a plain (non data-URL) string exercises
    // the `idx < 0` branch.
    class PlainReader {
      result: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        this.result = "plain-no-marker";
        this.onload?.();
      }
    }
    const original = globalThis.FileReader;
    (globalThis as { FileReader: unknown }).FileReader =
      PlainReader as unknown as typeof FileReader;
    try {
      const out = await fileToBase64(new Blob(["x"]));
      expect(out).toBe("plain-no-marker");
    } finally {
      (globalThis as { FileReader: unknown }).FileReader = original;
    }
  });

  it("rejects with a friendly error when the reader errors", async () => {
    class FailingReader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        this.onerror?.();
      }
    }
    const original = globalThis.FileReader;
    (globalThis as { FileReader: unknown }).FileReader =
      FailingReader as unknown as typeof FileReader;
    try {
      await expect(fileToBase64(new Blob(["x"]))).rejects.toThrow(
        "Не вдалося прочитати файл",
      );
    } finally {
      (globalThis as { FileReader: unknown }).FileReader = original;
    }
  });
});
