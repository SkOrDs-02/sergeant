// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { copyRequestIdToClipboard } from "./requestId";

const realClipboardDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);

afterEach(() => {
  vi.restoreAllMocks();
  if (realClipboardDescriptor) {
    Object.defineProperty(navigator, "clipboard", realClipboardDescriptor);
  } else {
    delete (navigator as { clipboard?: unknown }).clipboard;
  }
});

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", {
    value,
    configurable: true,
    writable: true,
  });
}

describe("copyRequestIdToClipboard", () => {
  beforeEach(() => {
    document.execCommand = vi.fn(() => true);
  });

  it("uses navigator.clipboard.writeText on success", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    setClipboard({ writeText });
    const onDone = vi.fn();
    copyRequestIdToClipboard("req_1", onDone);
    await Promise.resolve();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith("req_1");
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("falls back to execCommand when writeText rejects", async () => {
    const writeText = vi.fn(() => Promise.reject(new Error("denied")));
    setClipboard({ writeText });
    const onDone = vi.fn();
    copyRequestIdToClipboard("req_2", onDone);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("falls back to execCommand when clipboard API is unavailable", () => {
    setClipboard(undefined);
    const onDone = vi.fn();
    copyRequestIdToClipboard("req_3", onDone);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
