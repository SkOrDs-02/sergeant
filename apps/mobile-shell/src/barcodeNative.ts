/**
 * Native barcode scanning adapter.
 *
 * This module lives in `@sergeant/mobile-shell` on purpose: it is the only
 * place in the workspace where `@capacitor-mlkit/barcode-scanning` is
 * imported statically. `@sergeant/web` MUST load it via dynamic `import()`
 * so the ML Kit code ends up in an async chunk that browsers never fetch
 * (the feature-detect in `@sergeant/shared` gates the call).
 *
 * We normalize the plugin's result into the `BarcodeResult` shape exported
 * by `@sergeant/web`'s `useBarcodeScanner` hook, so callers never need to
 * know which platform produced the scan.
 */

import {
  BarcodeScanner,
  type Barcode,
} from "@capacitor-mlkit/barcode-scanning";

export interface NativeBarcodeResult {
  code: string;
  format: string;
  rawBytes?: Uint8Array;
}

/**
 * Ensure the user has granted camera permission. Returns `true` iff the
 * permission state is `granted` after (optionally) prompting.
 *
 * We only call `requestPermissions()` when the current status is
 * `prompt` / `prompt-with-rationale`; a previously `denied` state is
 * surfaced to the caller untouched so UI can show a helpful message and
 * point the user at system settings instead of silently re-prompting.
 */
export async function ensureCameraPermission(): Promise<boolean> {
  const current = await BarcodeScanner.checkPermissions();
  if (current.camera === "granted" || current.camera === "limited") {
    return true;
  }
  if (current.camera === "denied") {
    return false;
  }
  const requested = await BarcodeScanner.requestPermissions();
  return requested.camera === "granted" || requested.camera === "limited";
}

function firstBarcode(barcodes: Barcode[]): NativeBarcodeResult | null {
  const b = barcodes[0];
  if (!b) return null;
  const result: NativeBarcodeResult = {
    code: b.rawValue ?? b.displayValue ?? "",
    format: String(b.format ?? ""),
  };
  if (b.bytes) {
    result.rawBytes = new Uint8Array(b.bytes);
  }
  return result;
}

/**
 * Kick off a native scan. On Android this uses Google Code Scanner
 * (`scan()`) which presents its own full-screen modal UI and does not
 * require extra camera-permission plumbing; on iOS it falls back to the
 * plugin's `scan()` which opens the camera view as well.
 *
 * Returns `null` if the user cancels or no barcode is detected.
 * Throws if the plugin is unavailable or permissions are denied — the
 * calling hook maps these into user-visible toasts.
 */
export async function scanBarcodeNative(): Promise<NativeBarcodeResult | null> {
  const granted = await ensureCameraPermission();
  if (!granted) {
    throw new Error("camera-permission-denied");
  }
  const { barcodes } = await BarcodeScanner.scan();
  return firstBarcode(barcodes);
}
