/**
 * Mobile adapter for the shared file-download contract.
 *
 * Writes the JSON payload to `expo-file-system`'s `cacheDirectory` and
 * hands the file URI to `expo-sharing.shareAsync` so the user picks a
 * target app (Files, iMessage, email, Drive, …).
 *
 * Falls back gracefully when the platform reports sharing as unavailable
 * (`Sharing.isAvailableAsync()` returns false) — logs a warning and
 * shows no native sheet.
 *
 * Importing this module has the side-effect of registering the adapter.
 * Do this once from `app/_layout.tsx`, next to the haptic adapter.
 */

import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

import {
  setFileDownloadAdapter,
  type FileDownloadAdapter,
} from "@sergeant/shared";

export const mobileFileDownloadAdapter: FileDownloadAdapter = {
  async downloadJson(filename, payload) {
    const json = JSON.stringify(payload, null, 2);
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;

    await FileSystem.writeAsStringAsync(fileUri, json, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const sharingAvailable = await Sharing.isAvailableAsync();
    if (!sharingAvailable) {
      console.warn(
        `[@sergeant/mobile] Sharing is not available on this device. ` +
          `File was written to ${fileUri} but cannot be shared.`,
      );
      return;
    }

    await Sharing.shareAsync(fileUri, {
      mimeType: "application/json",
      dialogTitle: filename,
      UTI: "public.json",
    });
  },
};

setFileDownloadAdapter(mobileFileDownloadAdapter);
