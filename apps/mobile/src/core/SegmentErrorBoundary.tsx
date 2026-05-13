/**
 * Sergeant Hub-core — Expo Router segment-level error boundary.
 *
 * Expo Router uses the named `ErrorBoundary` export from a layout file
 * (`docs.expo.dev/router/error-handling/`) to render a fallback when
 * *route children* throw during render. That signature is `{ error,
 * retry: () => Promise<unknown> }`, which is different from the
 * in-tree React class boundary in `./ErrorBoundary.tsx` (which uses
 * `{ error, resetError }`).
 *
 * This helper bridges the two so the same Card + Button + reset
 * markup is rendered for both surfaces. Keeping it in its own module
 * (instead of inline in `app/_layout.tsx`) makes the wiring easy to
 * unit-test without dragging the entire mobile provider stack into
 * Jest — see `SegmentErrorBoundary.test.tsx`.
 */

import { RootErrorFallback } from "./ErrorBoundary";

export interface SegmentErrorBoundaryProps {
  error: Error;
  retry: () => Promise<unknown>;
}

/**
 * Stable wrapper around `RootErrorFallback` for Expo Router's
 * segment-level error boundary export. `retry` is async by design —
 * re-mounting the segment may need to wait on data loaders — but the
 * fallback fires it synchronously and discards the returned promise
 * so the press handler stays `() => void`-shaped.
 */
export function SegmentErrorBoundary({
  error,
  retry,
}: SegmentErrorBoundaryProps) {
  return (
    <RootErrorFallback
      error={error}
      resetError={() => {
        void retry();
      }}
    />
  );
}
