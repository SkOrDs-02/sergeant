/**
 * Pure, DOM-free contract for importing JSON files from the user's
 * device. Mirrors the `FileDownloadAdapter` pattern (see
 * `./fileDownload.ts`): consumers call `pickJson()` without caring
 * whether they're running in a browser (`<input type="file">` +
 * `FileReader`) or a React Native app (`expo-document-picker` +
 * `expo-file-system.readAsStringAsync`).
 *
 * The app shell registers the appropriate adapter once at startup via
 * `setFileImportAdapter`. Until an adapter registers, a built-in no-op
 * is active that returns `null` (no file picked) and emits a
 * development-mode warning.
 */

export interface FileImportResult {
  filename: string;
  data: unknown;
}

export interface FileImportAdapter {
  pickJson(): Promise<FileImportResult | null>;
}

function isDev(): boolean {
  try {
    // Read off `globalThis` so the file type-checks under tsconfigs that
    // don't include `@types/node` (apps/web scopes `types: ["vite/client"]`
    // only). Mirrors the same guard in `fileDownload.ts:isDev`.
    const proc = (globalThis as { process?: { env?: { NODE_ENV?: string } } })
      .process;
    return typeof proc !== "undefined" && proc.env?.NODE_ENV !== "production";
  } catch {
    return false;
  }
}

const noopAdapter: FileImportAdapter = {
  async pickJson() {
    if (isDev()) {
      console.warn(
        `[@sergeant/shared] pickJson() called before a file-import adapter was registered. ` +
          `Register one from apps/web or apps/mobile at startup.`,
      );
    }
    return null;
  },
};

let currentAdapter: FileImportAdapter = noopAdapter;

/**
 * Registers the active file-import adapter. Call once at app startup
 * (web: `apps/web/src/main.jsx`, mobile: `apps/mobile/app/_layout.tsx`).
 */
export function setFileImportAdapter(adapter: FileImportAdapter): void {
  currentAdapter = adapter;
}

/**
 * Restores the built-in no-op adapter. Intended for unit tests;
 * production code should not need this.
 */
export function resetFileImportAdapter(): void {
  currentAdapter = noopAdapter;
}

/**
 * Opens a platform-native file picker restricted to JSON files and
 * returns the parsed contents, or `null` if the user cancelled.
 */
export async function pickJson(): Promise<FileImportResult | null> {
  return currentAdapter.pickJson();
}
