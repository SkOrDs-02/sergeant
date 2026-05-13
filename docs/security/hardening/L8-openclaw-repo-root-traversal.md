# L8 — OpenClaw `OPENCLAW_REPO_ROOT` path-traversal guard

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Closed (2026-05-05)

| Field          | Value                                                                                                                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**   | Low                                                                                                                                                                                                              |
| **Sprint**     | [Sprint 4](./sprint-4.md)                                                                                                                                                                                        |
| **Owner**      | console                                                                                                                                                                                                          |
| **Effort**     | 0.25 person-day _(closed 2026-05-05 — batched M17 + L8 + L10 hardening PR)_                                                                                                                                      |
| **Status**     | Closed (2026-05-05)                                                                                                                                                                                              |
| **Discovered** | 2026-05-03 deep security review                                                                                                                                                                                  |
| **Resolved**   | 2026-05-05 — `apps/server/src/modules/openclaw/safeJoin.ts` (rejects empty input, NUL bytes, absolute paths, prefix-collisions, and `..` escapes). `readStrategyDoc` wraps traversal errors as allowlist denials |

## Summary

`OPENCLAW_REPO_ROOT=/app` is pinned in production — fine. Repo-tools that
take a relative path argument from the LLM should reject any path that
escapes the root via `..` or absolute roots.

## Recommendation

Wrap every path argument in a `safeJoin(root, candidate)` helper:

```ts
import path from "node:path";
export function safeJoin(root: string, candidate: string) {
  const resolved = path.resolve(root, candidate);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) {
    throw new Error("path_traversal_blocked");
  }
  return resolved;
}
```

## Correction points

- `tools/openclaw/src/openclaw/tools/safeJoin.ts` (new).
- `tools/openclaw/src/openclaw/tools/*.ts` — replace direct `path.join` with
  `safeJoin`.
- Unit tests for the boundary cases (`..`, `/etc/passwd`, symlink escape).

## Verification

- **Unit:** every entry in the unsafe-path table throws.
- **Manual:** craft a tool call with `path: "../../etc/passwd"`; expect
  rejection and a structured log entry.

## Cross-references

- [`./M19-mobile-deeplink-sanitize.md`](./M19-mobile-deeplink-sanitize.md)
