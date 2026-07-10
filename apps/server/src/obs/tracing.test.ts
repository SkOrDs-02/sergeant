import { describe, expect, it } from "vitest";

import { REDACT_KEY_NAMES } from "@sergeant/shared";
import { redactKeysRecursively } from "./logger.js";

/**
 * S5 / S9-S1 parity gate (audit `2026-05-13-security-observability-roast.md`).
 *
 * OpenTelemetry export was removed (ADR-0035 revert), but span-attribute bags
 * still flow through the same `REDACT_KEY_NAMES` contract via pino
 * `formatters.log` and Sentry scrubbers. This suite exhaustively asserts that
 * `redactKeysRecursively` — the non-mutating walker used before any log record
 * leaves the process — masks every canonical key at arbitrary depth, matching
 * the old OTel attribute denylist intent.
 */
describe("tracing attribute redaction parity (REDACT_KEY_NAMES)", () => {
  const secretValue = "leak-must-not-appear-in-export";

  it.each(REDACT_KEY_NAMES)(
    "redactKeysRecursively masks %s at depth 3",
    (key) => {
      const attrs = {
        span: {
          attributes: {
            [key]: secretValue,
            safeField: "visible",
          },
        },
      };

      const redacted = redactKeysRecursively(attrs);
      const serialized = JSON.stringify(redacted);

      expect(serialized).not.toContain(secretValue);
      expect(
        (redacted as { span: { attributes: Record<string, unknown> } }).span
          .attributes[key],
      ).toBe("[redacted]");
      expect(
        (redacted as { span: { attributes: Record<string, unknown> } }).span
          .attributes["safeField"],
      ).toBe("visible");
    },
  );

  it("does not mutate the input object (exporter-safe snapshot)", () => {
    const attrs = {
      nested: { token: secretValue, count: 1 },
    };
    const snapshot = structuredClone(attrs);

    redactKeysRecursively(attrs);

    expect(attrs).toEqual(snapshot);
  });
});
