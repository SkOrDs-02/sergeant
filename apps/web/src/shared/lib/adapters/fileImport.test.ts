// @vitest-environment jsdom
/**
 * Tests for the web file-import adapter (`pickJson`).
 *
 * Drives the hidden `<input type=file>` the adapter creates: we intercept
 * its `.click()`, set `files`, and dispatch the relevant events. A
 * controllable `FileReader` stub lets us exercise the success / parse-error
 * / read-error / cancel branches deterministically.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { webFileImportAdapter } from "./fileImport";

class FakeFileReader {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  result: string | null = null;
  static nextResult = "";
  static shouldError = false;
  readAsText() {
    queueMicrotask(() => {
      if (FakeFileReader.shouldError) {
        this.onerror?.();
        return;
      }
      this.result = FakeFileReader.nextResult;
      this.onload?.();
    });
  }
}

function makeFile(name: string): File {
  return new File(["{}"], name, { type: "application/json" });
}

describe("webFileImportAdapter.pickJson", () => {
  let appended: HTMLInputElement | null;

  beforeEach(() => {
    appended = null;
    FakeFileReader.shouldError = false;
    FakeFileReader.nextResult = "";
    vi.stubGlobal("FileReader", FakeFileReader as unknown as typeof FileReader);
    // Capture the file input the adapter creates, and no-op its click() so the
    // real file-picker never opens. We grab the element via createElement
    // rather than aliasing `this` inside click() (eslint no-this-alias).
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "input") {
        appended = el as HTMLInputElement;
        vi.spyOn(el as HTMLInputElement, "click").mockImplementation(() => {});
      }
      return el;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("resolves with the parsed payload and filename on a valid pick", async () => {
    FakeFileReader.nextResult = JSON.stringify({ hello: "world" });
    const promise = webFileImportAdapter.pickJson();
    // input.click() has run synchronously inside pickJson
    expect(appended).not.toBeNull();
    Object.defineProperty(appended!, "files", {
      configurable: true,
      value: [makeFile("backup.json")],
    });
    appended!.dispatchEvent(new Event("change"));
    await expect(promise).resolves.toEqual({
      filename: "backup.json",
      data: { hello: "world" },
    });
  });

  it("resolves null when no file is selected", async () => {
    const promise = webFileImportAdapter.pickJson();
    Object.defineProperty(appended!, "files", {
      configurable: true,
      value: [],
    });
    appended!.dispatchEvent(new Event("change"));
    await expect(promise).resolves.toBeNull();
  });

  it("resolves null on invalid JSON", async () => {
    FakeFileReader.nextResult = "{ not valid";
    const promise = webFileImportAdapter.pickJson();
    Object.defineProperty(appended!, "files", {
      configurable: true,
      value: [makeFile("bad.json")],
    });
    appended!.dispatchEvent(new Event("change"));
    await expect(promise).resolves.toBeNull();
  });

  it("resolves null on a FileReader error", async () => {
    FakeFileReader.shouldError = true;
    const promise = webFileImportAdapter.pickJson();
    Object.defineProperty(appended!, "files", {
      configurable: true,
      value: [makeFile("err.json")],
    });
    appended!.dispatchEvent(new Event("change"));
    await expect(promise).resolves.toBeNull();
  });

  it("resolves null when the picker is cancelled", async () => {
    const promise = webFileImportAdapter.pickJson();
    appended!.dispatchEvent(new Event("cancel"));
    await expect(promise).resolves.toBeNull();
  });
});
