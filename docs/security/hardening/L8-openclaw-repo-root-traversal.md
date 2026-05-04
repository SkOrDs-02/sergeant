# L8 — OpenClaw `OPENCLAW_REPO_ROOT` path-traversal guard

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Open

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Low                             |
| **Sprint**     | [Sprint 4](./sprint-4.md)       |
| **Owner**      | console                         |
| **Effort**     | 0.25 person-day                 |
| **Status**     | Open                            |
| **Discovered** | 2026-05-03 deep security review |

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

- `tools/console/src/openclaw/tools/safeJoin.ts` (new).
- `tools/console/src/openclaw/tools/*.ts` — replace direct `path.join` with
  `safeJoin`.
- Unit tests for the boundary cases (`..`, `/etc/passwd`, symlink escape).

## Verification

- **Unit:** every entry in the unsafe-path table throws.
- **Manual:** craft a tool call with `path: "../../etc/passwd"`; expect
  rejection and a structured log entry.

## Cross-references

- [`./M19-mobile-deeplink-sanitize.md`](./M19-mobile-deeplink-sanitize.md)
