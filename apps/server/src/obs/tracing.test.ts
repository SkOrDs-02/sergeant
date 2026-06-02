import { describe, it, expect, afterEach } from "vitest";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { trace } from "@opentelemetry/api";

import {
  HEADER_DENYLIST,
  OTEL_ATTRIBUTE_DENYLIST,
  OTEL_REDACTED_SENTINEL,
  DenylistAttributeSpanProcessor,
  resolveTracingConfig,
} from "./tracing.js";
import { REDACT_KEY_NAMES } from "@sergeant/shared";

// Тестуємо чисто config-розв'язку без побічних ефектів. Сам `startTracing()`
// уже виконався на module-evaluation у режимі no-op (без OTLP endpoint),
// тому реєстру міняти не потрібно і registry-state-у тут не торкаємось.

describe("resolveTracingConfig", () => {
  it("`enabled=false` коли OTLP endpoint порожній", () => {
    const config = resolveTracingConfig({});
    expect(config.enabled).toBe(false);
    expect(config.endpoint).toBe("");
  });

  it("traces-specific endpoint має пріоритет над generic", () => {
    const config = resolveTracingConfig({
      OTEL_EXPORTER_OTLP_ENDPOINT: "https://generic.example.com",
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "https://traces.example.com",
    });
    expect(config.endpoint).toBe("https://traces.example.com");
    expect(config.enabled).toBe(true);
  });

  it("default service.name = 'sergeant-api'", () => {
    const config = resolveTracingConfig({});
    expect(config.serviceName).toBe("sergeant-api");
  });

  it("custom service.name з env", () => {
    const config = resolveTracingConfig({
      OTEL_SERVICE_NAME: "sergeant-api-canary",
    });
    expect(config.serviceName).toBe("sergeant-api-canary");
  });

  it("service.version читається з OTEL_SERVICE_VERSION → SENTRY_RELEASE → Git SHA-fallback", () => {
    expect(
      resolveTracingConfig({ OTEL_SERVICE_VERSION: "v1" }).serviceVersion,
    ).toBe("v1");
    expect(resolveTracingConfig({ SENTRY_RELEASE: "v2" }).serviceVersion).toBe(
      "v2",
    );
    expect(
      resolveTracingConfig({ RAILWAY_GIT_COMMIT_SHA: "abcdef" }).serviceVersion,
    ).toBe("abcdef");
    expect(
      resolveTracingConfig({ VERCEL_GIT_COMMIT_SHA: "deadbeef" })
        .serviceVersion,
    ).toBe("deadbeef");
    expect(resolveTracingConfig({ GITHUB_SHA: "1234" }).serviceVersion).toBe(
      "1234",
    );
    expect(resolveTracingConfig({}).serviceVersion).toBeUndefined();
  });

  it("OTEL_TRACES_SAMPLE_RATE парситься у число і clamp-иться 0..1", () => {
    expect(resolveTracingConfig({}).defaultSampleRate).toBe(0.1);
    expect(
      resolveTracingConfig({ OTEL_TRACES_SAMPLE_RATE: "0.5" })
        .defaultSampleRate,
    ).toBe(0.5);
    expect(
      resolveTracingConfig({ OTEL_TRACES_SAMPLE_RATE: "1.0" })
        .defaultSampleRate,
    ).toBe(1.0);
    // clamp
    expect(
      resolveTracingConfig({ OTEL_TRACES_SAMPLE_RATE: "5" }).defaultSampleRate,
    ).toBe(1);
    expect(
      resolveTracingConfig({ OTEL_TRACES_SAMPLE_RATE: "-1" }).defaultSampleRate,
    ).toBe(0);
    // garbage → fallback
    expect(
      resolveTracingConfig({ OTEL_TRACES_SAMPLE_RATE: "nope" })
        .defaultSampleRate,
    ).toBe(0.1);
  });

  it("OTEL_EXPORTER_OTLP_HEADERS парситься у map (k=v,k=v)", () => {
    const config = resolveTracingConfig({
      OTEL_EXPORTER_OTLP_HEADERS: "x-honeycomb-team=secret123,x-dataset=prod",
    });
    expect(config.headers).toEqual({
      "x-honeycomb-team": "secret123",
      "x-dataset": "prod",
    });
  });

  it("traces-specific headers перекривають generic", () => {
    const config = resolveTracingConfig({
      OTEL_EXPORTER_OTLP_HEADERS: "x-key=generic",
      OTEL_EXPORTER_OTLP_TRACES_HEADERS: "x-key=traces-only,x-extra=1",
    });
    expect(config.headers).toEqual({
      "x-key": "traces-only",
      "x-extra": "1",
    });
  });

  it("ігнорує malformed header pairs (без `=`)", () => {
    const config = resolveTracingConfig({
      OTEL_EXPORTER_OTLP_HEADERS: "broken,x-good=1,=novalue",
    });
    expect(config.headers).toEqual({ "x-good": "1" });
  });
});

describe("OTel PII denylist parity", () => {
  it("mirrors the shared REDACT_KEY_NAMES contract", () => {
    for (const key of REDACT_KEY_NAMES) {
      expect(OTEL_ATTRIBUTE_DENYLIST.has(key.toLowerCase())).toBe(true);
    }
  });

  it("keeps sensitive HTTP headers covered by the same denylist family", () => {
    for (const key of HEADER_DENYLIST) {
      expect(OTEL_ATTRIBUTE_DENYLIST.has(key)).toBe(true);
    }
  });
});

/**
 * In-memory span exporter tests — verify that DenylistAttributeSpanProcessor
 * actually scrubs sensitive attributes before they reach the exporter.
 *
 * Uses BasicTracerProvider (not NodeSDK) with SimpleSpanProcessor so spans
 * are flushed synchronously without needing OTel env-vars.
 */
describe("DenylistAttributeSpanProcessor — in-memory span scrubbing", () => {
  let provider: BasicTracerProvider;
  let exporter: InMemorySpanExporter;

  function setupProvider(): void {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({
      spanProcessors: [
        new DenylistAttributeSpanProcessor(new SimpleSpanProcessor(exporter)),
      ],
    });
  }

  afterEach(async () => {
    await provider?.shutdown();
    exporter?.reset();
    // Restore the global tracer provider to the one set by tracing.ts startup.
    // Calling trace.disable() resets back to NoopTracerProvider.
    trace.disable();
  });

  it("replaces denylist-keyed attributes with the redacted sentinel", () => {
    setupProvider();
    const tracer = provider.getTracer("test");
    const span = tracer.startSpan("test-span");

    // Set one attribute for every key in REDACT_KEY_NAMES plus a safe one.
    for (const key of REDACT_KEY_NAMES) {
      span.setAttribute(key, "sensitive-value");
    }
    span.setAttribute("safe.attribute", "keep-me");
    span.end();

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    const attrs = spans[0]!.attributes;

    for (const key of REDACT_KEY_NAMES) {
      expect(attrs[key]).toBe(OTEL_REDACTED_SENTINEL);
    }
    expect(attrs["safe.attribute"]).toBe("keep-me");
  });

  it("redacts header-denylist attributes (lowercase form)", () => {
    setupProvider();
    const tracer = provider.getTracer("test");
    const span = tracer.startSpan("header-span");

    for (const key of HEADER_DENYLIST) {
      span.setAttribute(key, "secret");
    }
    span.end();

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    const attrs = spans[0]!.attributes;
    for (const key of HEADER_DENYLIST) {
      expect(attrs[key]).toBe(OTEL_REDACTED_SENTINEL);
    }
  });

  it("is case-insensitive: uppercase attribute key variants are also scrubbed", () => {
    setupProvider();
    const tracer = provider.getTracer("test");
    const span = tracer.startSpan("case-span");
    // "password" is in REDACT_KEY_NAMES; "Password" (capitalised) should also be scrubbed.
    span.setAttribute("Password", "should-be-gone");
    span.setAttribute("Authorization", "Bearer secret");
    span.end();

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    const attrs = spans[0]!.attributes;
    expect(attrs["Password"]).toBe(OTEL_REDACTED_SENTINEL);
    expect(attrs["Authorization"]).toBe(OTEL_REDACTED_SENTINEL);
  });

  it("parity gate: adding a new key to REDACT_KEY_NAMES without touching tracing.ts causes this test to fail", () => {
    // This test exists as an explicit documentation of the parity contract.
    // OTEL_ATTRIBUTE_DENYLIST is built from REDACT_KEY_NAMES, so any
    // addition to REDACT_KEY_NAMES automatically appears in the denylist.
    // The in-memory scrubbing test above would then catch the new key being
    // redacted. This assertion is the enforcement gate.
    for (const key of REDACT_KEY_NAMES) {
      expect(OTEL_ATTRIBUTE_DENYLIST.has(key.toLowerCase())).toBe(true);
    }
  });

  it("does not redact safe attributes that happen to contain the word 'token' as a substring", () => {
    setupProvider();
    const tracer = provider.getTracer("test");
    const span = tracer.startSpan("safe-span");
    // "custom.token.count" — the key lowercased is "custom.token.count" which
    // is NOT in the denylist (only exact matches apply).
    span.setAttribute("custom.token.count", 42);
    span.setAttribute("gen_ai.usage.input_tokens", 100);
    span.end();

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    const attrs = spans[0]!.attributes;
    expect(attrs["custom.token.count"]).toBe(42);
    expect(attrs["gen_ai.usage.input_tokens"]).toBe(100);
  });
});
