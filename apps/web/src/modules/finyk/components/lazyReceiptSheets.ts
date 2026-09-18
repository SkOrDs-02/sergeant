/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Lazy chunks for the receipt-scan / bulk-import sheets — mirrors
 * `pages/lazyPages.ts`'s `lazyImport` pattern. Neither sheet is imported
 * eagerly anywhere: `FinykScanEntryPoints` only mounts one once the user
 * actually taps the corresponding FAB action, so `vendor-zxing` and the
 * bulk-import UI stay out of the eager bundle (280 kB gate).
 */
import { lazyImport } from "../../../core/lib/lazyImport";

export const ReceiptScanSheet = lazyImport(
  () => import("./receiptScan/ReceiptScanSheet"),
  "ReceiptScanSheet",
);

export const BulkImportSheet = lazyImport(
  () => import("./bulkImport/BulkImportSheet"),
  "BulkImportSheet",
);
