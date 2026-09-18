/**
 * Web adapter for the shared file-download contract.
 *
 * Binds `downloadJson` from `@sergeant/shared` to the classic browser
 * `Blob` + `URL.createObjectURL` + `<a download>` dance, with guards
 * against SSR / jsdom-without-DOM environments.
 *
 * Importing this module has the side-effect of registering the web
 * adapter, so the side-effect import in `apps/web/src/main.tsx` is all
 * the app shell needs.
 */

import {
  setFileDownloadAdapter,
  type FileDownloadAdapter,
} from "@sergeant/shared";

export const webFileDownloadAdapter: FileDownloadAdapter = {
  async downloadJson(filename, payload) {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
    } finally {
      // Revoke on next tick so the click has time to initiate the
      // download. Matches what the legacy inline helpers in
      // `RoutineBackupSection` used (setTimeout 1500) — we use
      // `setTimeout(…, 0)` because modern browsers keep the URL alive
      // for the lifetime of the download once `a.click()` returns.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  },
};

setFileDownloadAdapter(webFileDownloadAdapter);
