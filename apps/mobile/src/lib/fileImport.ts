/**
 * Mobile adapter for the shared file-import contract.
 *
 * Opens the system document picker filtered to JSON, reads the selected
 * file via `expo-file-system`, parses it, and returns the result. Returns
 * `null` when the user cancels the picker.
 *
 * Importing this module has the side-effect of registering the adapter.
 * Do this once from `app/_layout.tsx`, next to the file-download adapter.
 */

import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";

import { setFileImportAdapter, type FileImportAdapter } from "@sergeant/shared";

export const mobileFileImportAdapter: FileImportAdapter = {
  async pickJson() {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/json",
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.length) {
      return null;
    }

    const asset = result.assets[0]!;
    const raw = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const data: unknown = JSON.parse(raw);
    return { filename: asset.name, data };
  },
};

setFileImportAdapter(mobileFileImportAdapter);
