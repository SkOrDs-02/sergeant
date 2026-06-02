/**
 * Singleton streaming-state store for Hub chat.
 *
 * Framework-agnostic (no React imports) so that `useSWUpdate` — which
 * runs at app-shell level, outside any chat component — can read the
 * streaming flag without threading props or context.
 *
 * Usage:
 *   - `useChatSend` calls `setHubStreaming(true)` when it starts a send
 *     and `setHubStreaming(false)` in the `finally` block.
 *   - `useSWUpdate` calls `isHubStreaming()` before showing the PWA
 *     update-prompt to avoid interrupting a live stream.
 */

let _streaming = false;

/** Returns `true` while Hub chat has an in-flight request / SSE stream. */
export function isHubStreaming(): boolean {
  return _streaming;
}

/** Set the streaming flag. Called by `useChatSend` on send start/end. */
export function setHubStreaming(value: boolean): void {
  _streaming = value;
}
