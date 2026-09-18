/**
 * Unit tests for the mobile file-import adapter.
 *
 * Verifies that `mobileFileImportAdapter.pickJson`:
 *  - returns parsed JSON data with the original filename on success;
 *  - returns null when the user cancels the document picker;
 *  - propagates JSON.parse errors for malformed files.
 */

import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";

import { mobileFileImportAdapter } from "./fileImport";

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock("expo-file-system", () => ({
  EncodingType: { UTF8: "utf8" },
  readAsStringAsync: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe("mobileFileImportAdapter.pickJson", () => {
  it("returns parsed JSON and filename on success", async () => {
    const payload = { kind: "hub-backup", schemaVersion: 1 };
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///cache/backup.json", name: "backup.json" }],
    });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(
      JSON.stringify(payload),
    );

    const result = await mobileFileImportAdapter.pickJson();

    expect(result).toEqual({ filename: "backup.json", data: payload });
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith({
      type: "application/json",
      copyToCacheDirectory: true,
    });
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith(
      "file:///cache/backup.json",
      { encoding: "utf8" },
    );
  });

  it("returns null when the user cancels the picker", async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: true,
      assets: [],
    });

    const result = await mobileFileImportAdapter.pickJson();

    expect(result).toBeNull();
    expect(FileSystem.readAsStringAsync).not.toHaveBeenCalled();
  });

  it("throws on malformed JSON", async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///cache/bad.json", name: "bad.json" }],
    });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(
      "not valid json",
    );

    await expect(mobileFileImportAdapter.pickJson()).rejects.toThrow();
  });
});
