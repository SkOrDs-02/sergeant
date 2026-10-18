import type { SyncV2PushOp } from "./syncV2";

/** Fit a FIFO prefix into the UTF-8 size of the actual `{ops}` envelope. */
export function fittingPushPrefixLength(
  ops: readonly SyncV2PushOp[],
  maxBodyBytes: number | undefined,
): number {
  if (maxBodyBytes === undefined) return ops.length;
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes <= 0) {
    throw new Error("sync push: maxBodyBytes must be a positive safe integer");
  }
  const encoder = new TextEncoder();
  let bytes = encoder.encode(JSON.stringify({ ops: [] })).byteLength;
  let count = 0;
  for (const op of ops) {
    const added =
      encoder.encode(JSON.stringify(op)).byteLength + (count > 0 ? 1 : 0);
    const fits = bytes + added <= maxBodyBytes;
    if (count > 0 && !fits) break;
    // An oversized individual row goes alone: the server can reject it
    // without also rejecting otherwise valid neighbouring operations.
    count += 1;
    bytes += added;
    if (!fits) break;
  }
  return count;
}
