import { describe, expect, it } from "vitest";

import { REDACT_KEY_NAMES } from "@sergeant/shared";
import { redactKeysRecursively } from "./logger.js";

/**
 * S5 / S9-S1 parity gate (audit `2026-05-13-security-observability-roast.md`).
 *
 * OpenTelemetry export прибрано (revert ADR-0035), але span-attribute bags
 * досі проходять через той самий контракт `REDACT_KEY_NAMES` через pino
 * `formatters.log` і Sentry scrubbers. Цей suite вичерпно перевіряє, що
 * `redactKeysRecursively` — немутуючий walker перед експортом лог-запису —
 * маскує кожен канонічний ключ на довільній глибині, зберігаючи намір
 * старого OTel attribute denylist.
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

  it("replaces object-valued canonical keys with null", () => {
    const key = REDACT_KEY_NAMES[0];
    if (!key) throw new Error("REDACT_KEY_NAMES must not be empty");

    const attrs = {
      [key]: { hash: secretValue, algo: "bcrypt" },
      safeField: "visible",
    };

    const redacted = redactKeysRecursively(attrs) as Record<string, unknown>;

    expect(JSON.stringify(redacted)).not.toContain(secretValue);
    expect(redacted[key]).toBeNull();
    expect(redacted["safeField"]).toBe("visible");
  });

  it("redacts canonical keys nested inside arrays", () => {
    const key = REDACT_KEY_NAMES[0];
    if (!key) throw new Error("REDACT_KEY_NAMES must not be empty");

    const attrs = {
      items: [{ [key]: secretValue, label: "keep" }, { label: "also-keep" }],
    };

    const redacted = redactKeysRecursively(attrs) as {
      items: Array<Record<string, unknown>>;
    };

    expect(JSON.stringify(redacted)).not.toContain(secretValue);
    expect(redacted.items[0]?.[key]).toBe("[redacted]");
    expect(redacted.items[0]?.["label"]).toBe("keep");
    expect(redacted.items[1]?.["label"]).toBe("also-keep");
  });

  it("does not mutate the input object (exporter-safe snapshot)", () => {
    const attrs = {
      nested: { token: secretValue, count: 1 },
    };
    const snapshot = structuredClone(attrs);

    redactKeysRecursively(attrs);

    expect(attrs).toEqual(snapshot);
  });
});
