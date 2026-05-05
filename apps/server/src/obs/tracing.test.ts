import { describe, it, expect } from "vitest";

import { resolveTracingConfig } from "./tracing.js";

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
