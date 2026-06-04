import { Component, type ReactNode } from "react";
import { messages } from "@shared/i18n/uk";
import { isChunkLoadError, reloadOnceForChunkError } from "../lib/chunkReload";

interface ChunkErrorBoundaryProps {
  /**
   * Min-height (px) so the recovery card occupies the same footprint as the
   * Suspense skeleton it replaces — avoids a layout jump when the boundary
   * swaps the skeleton for the error state.
   */
  minH?: number;
  children?: ReactNode;
}

interface ChunkErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches a failed `lazy(() => import(...))` chunk load from the `<Suspense>`
 * it wraps. After a deploy rotates chunk hashes mid-session (PWA + stale
 * service-worker `index.html`), the import rejects; Suspense swallows the
 * rejection and re-throws it as a render error, so it never reaches the global
 * `unhandledrejection` recovery in `chunkReload.ts`. Without a boundary right
 * here the `<Suspense fallback>` skeleton hangs forever.
 *
 * Recovery reuses the guarded `reloadOnceForChunkError` (cooldown + reload-cap)
 * so a persistently broken chunk can't loop the tab. If that guard refuses the
 * automatic reload, the manual card below lets the user trigger one.
 *
 * Non-chunk errors are re-thrown so the app-level ErrorBoundary owns them —
 * this boundary is deliberately narrow.
 */
export default class ChunkErrorBoundary extends Component<
  ChunkErrorBoundaryProps,
  ChunkErrorBoundaryState
> {
  constructor(props: ChunkErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ChunkErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error) {
    // Auto-recover: one guarded reload pulls fresh HTML + chunk hashes. The
    // guard inside reloadOnceForChunkError prevents a reload loop; when it
    // refuses, the render() fallback below offers a manual reload instead.
    if (isChunkLoadError(error)) reloadOnceForChunkError();
  }

  private handleReload = () => {
    window.location.reload();
  };

  override render() {
    const { error } = this.state;
    if (error) {
      // Re-throw anything that is not a chunk-load failure so the global
      // ErrorBoundary handles it — keep this boundary's blast radius small.
      if (!isChunkLoadError(error)) throw error;
      const { minH } = this.props;
      return (
        <div
          role="alert"
          style={minH ? { minHeight: `${minH}px` } : undefined}
          className="bg-panel border border-line rounded-2xl p-4 flex flex-col items-center justify-center gap-3 text-center"
        >
          <p className="text-sm text-muted">
            {messages.errors.generic.sectionFailed}
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="px-4 py-2 rounded-xl bg-primary text-bg text-style-label shadow-card hover:brightness-110 transition-[filter] focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/50"
          >
            {messages.actions.reload}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
