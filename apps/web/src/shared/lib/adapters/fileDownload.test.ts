// @vitest-environment jsdom
/**
 * Tests for the web file-download adapter (`downloadJson`).
 *
 * The adapter does the classic `Blob` + `URL.createObjectURL` +
 * `<a download>` dance and revokes the object URL on the next tick. We
 * stub the URL factory + the anchor's `.click()` so no real navigation
 * happens, and assert the wiring (filename, href, JSON payload, revoke).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { webFileDownloadAdapter } from "./fileDownload";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("webFileDownloadAdapter.downloadJson", () => {
  it("creates a JSON blob URL, clicks a download anchor, and revokes it", async () => {
    vi.useFakeTimers();
    const createSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:fake-url");
    const revokeSpy = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});

    let downloadAnchor: HTMLAnchorElement | null = null;
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "a") {
        downloadAnchor = el as HTMLAnchorElement;
        vi.spyOn(el as HTMLAnchorElement, "click").mockImplementation(() => {});
      }
      return el;
    });

    await webFileDownloadAdapter.downloadJson("backup.json", {
      hello: "world",
    });

    // A blob URL was minted and wired onto the anchor.
    expect(createSpy).toHaveBeenCalledTimes(1);
    const blobArg = createSpy.mock.calls[0]![0] as Blob;
    expect(blobArg).toBeInstanceOf(Blob);
    expect(blobArg.type).toBe("application/json");

    expect(downloadAnchor).not.toBeNull();
    expect(downloadAnchor!.download).toBe("backup.json");
    expect(downloadAnchor!.href).toContain("blob:fake-url");
    expect(
      downloadAnchor!.click as ReturnType<typeof vi.fn>,
    ).toHaveBeenCalledTimes(1);

    // Revoke is deferred to the next tick.
    expect(revokeSpy).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeSpy).toHaveBeenCalledWith("blob:fake-url");
  });

  it("serializes the payload as pretty-printed JSON", async () => {
    const createSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:fake-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "a") {
        vi.spyOn(el as HTMLAnchorElement, "click").mockImplementation(() => {});
      }
      return el;
    });

    await webFileDownloadAdapter.downloadJson("data.json", { a: 1, b: [2, 3] });

    const blob = createSpy.mock.calls[0]![0] as Blob;
    const text = await blob.text();
    expect(JSON.parse(text)).toEqual({ a: 1, b: [2, 3] });
    // 2-space indentation → multi-line output.
    expect(text).toContain("\n");
  });

  it("revokes the URL even if the anchor click throws", async () => {
    vi.useFakeTimers();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake-url");
    const revokeSpy = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "a") {
        vi.spyOn(el as HTMLAnchorElement, "click").mockImplementation(() => {
          throw new Error("popup blocked");
        });
      }
      return el;
    });

    await expect(
      webFileDownloadAdapter.downloadJson("x.json", {}),
    ).rejects.toThrow("popup blocked");

    // The `finally` block still schedules the revoke.
    vi.runAllTimers();
    expect(revokeSpy).toHaveBeenCalledWith("blob:fake-url");
  });
});
