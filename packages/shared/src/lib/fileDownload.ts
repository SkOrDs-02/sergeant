/**
 * Pure, DOM-free contract for exporting JSON blobs to the user's file
 * system. Mirrors the R7 haptic adapter pattern (see
 * `./haptic.ts`): consumers (UI components, feature modules, domain
 * packages) call `downloadJson(filename, payload)` without caring
 * whether they're running in a browser (`Blob` + `URL.createObjectURL`
 * + `a.click()`) or a React Native app (eventually:
 * `expo-file-system.writeAsStringAsync` in the cache directory plus
 * `expo-sharing.shareAsync`).
 *
 * The app shell registers the appropriate adapter once at startup via
 * `setFileDownloadAdapter`. Until an adapter registers, a built-in
 * no-op is active so that calls from SSR, unit tests, or pure domain
 * code are safe — the default emits a single `console.warn` in
 * development builds so misconfigurations surface early, and is
 * completely silent in production.
 */

export interface FileDownloadAdapter {
  downloadJson(filename: string, payload: unknown): Promise<void>;
}

function isDev(): boolean {
  try {
    // Works under Vite (define'd), Metro, Node, and plain browser —
    // `process` may be undefined in some bundler configs, hence the
    // try/catch + optional chain. Read off `globalThis` instead of the
    // bare `process` identifier so the file type-checks under tsconfigs
    // that don't include `@types/node` (e.g. `apps/web/tsconfig.json`,
    // which scopes `types: ["vite/client"]` only — see initiative 0009
    // PR 1.3 staged-typecheck guard).
    const proc = (globalThis as { process?: { env?: { NODE_ENV?: string } } })
      .process;
    return typeof proc !== "undefined" && proc.env?.NODE_ENV !== "production";
  } catch {
    return false;
  }
}

const noopAdapter: FileDownloadAdapter = {
  async downloadJson(filename) {
    if (isDev()) {
      console.warn(
        `[@sergeant/shared] downloadJson("${filename}") called before a file-download adapter was registered. ` +
          `Register one from apps/web/src/main.jsx or apps/mobile/app/_layout.tsx.`,
      );
    }
  },
};

let currentAdapter: FileDownloadAdapter = noopAdapter;

/**
 * Registers the active file-download adapter. Call once at app startup
 * (web: `apps/web/src/main.jsx`, mobile: `apps/mobile/app/_layout.tsx`).
 * Later calls replace the previously-registered adapter, which is
 * useful for test harnesses.
 */
export function setFileDownloadAdapter(adapter: FileDownloadAdapter): void {
  currentAdapter = adapter;
}

/**
 * Restores the built-in no-op adapter. Intended for unit tests;
 * production code should not need this.
 */
export function resetFileDownloadAdapter(): void {
  currentAdapter = noopAdapter;
}

/**
 * Serialises `payload` to pretty-printed JSON and hands it to the
 * registered adapter for platform-specific delivery:
 *   - web   → blob download via `a.click()`;
 *   - mobile (eventually, Phase 4+) → write to cache + share sheet.
 *
 * Callers pass the desired default filename (including extension —
 * e.g. `"hub-backup-2026-04-20.json"`); the adapter is free to sanitise
 * it for the target platform.
 */
export async function downloadJson(
  filename: string,
  payload: unknown,
): Promise<void> {
  await currentAdapter.downloadJson(filename, payload);
}
