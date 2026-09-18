/**
 * Unit tests for the mobile file-download adapter.
 *
 * Verifies that `mobileFileDownloadAdapter.downloadJson`:
 *  - writes the JSON payload to `cacheDirectory` via `writeAsStringAsync`;
 *  - invokes `shareAsync` with the correct URI and MIME type;
 *  - gracefully falls back (no throw) when sharing is unavailable.
 */

import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

import { mobileFileDownloadAdapter } from "./fileDownload";

jest.mock("expo-file-system", () => ({
  cacheDirectory: "file:///tmp/cache/",
  EncodingType: { UTF8: "utf8" },
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe("mobileFileDownloadAdapter.downloadJson", () => {
  it("writes JSON to cacheDirectory and invokes shareAsync", async () => {
    const payload = { kind: "hub-backup", data: [1, 2, 3] };

    await mobileFileDownloadAdapter.downloadJson("backup.json", payload);

    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      "file:///tmp/cache/backup.json",
      JSON.stringify(payload, null, 2),
      { encoding: "utf8" },
    );
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      "file:///tmp/cache/backup.json",
      {
        mimeType: "application/json",
        dialogTitle: "backup.json",
        UTI: "public.json",
      },
    );
  });

  it("skips shareAsync and warns when sharing is unavailable", async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    await mobileFileDownloadAdapter.downloadJson("x.json", {});

    expect(FileSystem.writeAsStringAsync).toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Sharing is not available"),
    );

    warnSpy.mockRestore();
  });
});
