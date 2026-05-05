import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { context, ROOT_CONTEXT, SpanKind, trace } from "@opentelemetry/api";
import { SamplingDecision } from "@opentelemetry/sdk-trace-base";

import { createRouteAwareSampler } from "./sampler.js";

function attrs(
  route: string | undefined,
  method?: string,
  extra: Record<string, string | number | boolean> = {},
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = { ...extra };
  if (route) out["http.route"] = route;
  if (method) out["http.request.method"] = method;
  return out;
}

describe("createRouteAwareSampler", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("дропає health-checks (livez/readyz/healthz)", () => {
    const sampler = createRouteAwareSampler({ defaultRate: 1.0 });
    for (const path of ["/livez", "/readyz", "/healthz", "/startupz"]) {
      const result = sampler.shouldSample(
        ROOT_CONTEXT,
        "trace-id",
        "GET",
        SpanKind.SERVER,
        attrs(path, "GET"),
        [],
      );
      expect(result.decision).toBe(SamplingDecision.NOT_RECORD);
    }
  });

  it("AI-роути семплюються 100% незалежно від defaultRate", () => {
    const sampler = createRouteAwareSampler({ defaultRate: 0 });
    for (const path of [
      "/api/chat/messages",
      "/api/coach/turn",
      "/api/nutrition/photo",
      "/api/digest/weekly",
      "/api/v1/chat/stream",
    ]) {
      const result = sampler.shouldSample(
        ROOT_CONTEXT,
        "trace-id",
        "POST",
        SpanKind.SERVER,
        attrs(path, "POST"),
        [],
      );
      expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
    }
  });

  it("write-методи (POST/PUT/PATCH/DELETE) семплюються навіть при defaultRate=0", () => {
    const sampler = createRouteAwareSampler({ defaultRate: 0 });
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const result = sampler.shouldSample(
        ROOT_CONTEXT,
        "trace-id",
        method,
        SpanKind.SERVER,
        attrs("/api/finyk/transactions", method),
        [],
      );
      expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
    }
  });

  it("default rate застосовується до GET-ів без AI-prefix", () => {
    const sampler = createRouteAwareSampler({ defaultRate: 0.5 });
    // Math.random=0.5, defaultRate=0.5 → 0.5 < 0.5 === false → NOT_RECORD
    const result = sampler.shouldSample(
      ROOT_CONTEXT,
      "trace-id",
      "GET",
      SpanKind.SERVER,
      attrs("/api/finyk/transactions", "GET"),
      [],
    );
    expect(result.decision).toBe(SamplingDecision.NOT_RECORD);

    vi.spyOn(Math, "random").mockReturnValue(0.49);
    const result2 = sampler.shouldSample(
      ROOT_CONTEXT,
      "trace-id",
      "GET",
      SpanKind.SERVER,
      attrs("/api/finyk/transactions", "GET"),
      [],
    );
    expect(result2.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
  });

  it("defaultRate=0 завжди NOT_RECORD для GET non-AI", () => {
    const sampler = createRouteAwareSampler({ defaultRate: 0 });
    const result = sampler.shouldSample(
      ROOT_CONTEXT,
      "trace-id",
      "GET",
      SpanKind.SERVER,
      attrs("/api/finyk/transactions", "GET"),
      [],
    );
    expect(result.decision).toBe(SamplingDecision.NOT_RECORD);
  });

  it("defaultRate=1.0 завжди семплює GET", () => {
    const sampler = createRouteAwareSampler({ defaultRate: 1.0 });
    const result = sampler.shouldSample(
      ROOT_CONTEXT,
      "trace-id",
      "GET",
      SpanKind.SERVER,
      attrs("/api/finyk/transactions", "GET"),
      [],
    );
    expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
  });

  it("clamp-ить defaultRate >1 до 1", () => {
    const sampler = createRouteAwareSampler({ defaultRate: 5 });
    const result = sampler.shouldSample(
      ROOT_CONTEXT,
      "trace-id",
      "GET",
      SpanKind.SERVER,
      attrs("/api/finyk/transactions", "GET"),
      [],
    );
    expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
  });

  it("поважає sampled парент-context", () => {
    const sampler = createRouteAwareSampler({ defaultRate: 0 });
    const ctx = trace.setSpanContext(ROOT_CONTEXT, {
      traceId: "0123456789abcdef0123456789abcdef",
      spanId: "0123456789abcdef",
      traceFlags: 1, // SAMPLED
      isRemote: true,
    });
    const result = sampler.shouldSample(
      ctx,
      "trace-id",
      "GET",
      SpanKind.SERVER,
      attrs("/livez", "GET"),
      [],
    );
    // Парент сказав sampled → ми поважаємо навіть на /livez.
    expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
  });

  it("non-sampled парент → fallback на route-based вирішення", () => {
    const sampler = createRouteAwareSampler({ defaultRate: 0 });
    const ctx = trace.setSpanContext(ROOT_CONTEXT, {
      traceId: "0123456789abcdef0123456789abcdef",
      spanId: "0123456789abcdef",
      traceFlags: 0, // NOT SAMPLED
      isRemote: true,
    });
    const result = sampler.shouldSample(
      ctx,
      "trace-id",
      "POST",
      SpanKind.SERVER,
      attrs("/api/chat/messages", "POST"),
      [],
    );
    // Парент не sampled, але AI-route → ми все одно семплюємо.
    expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
  });

  it("toString експонує defaultRate (для діагностики SDK init-логів)", () => {
    const sampler = createRouteAwareSampler({ defaultRate: 0.25 });
    expect(sampler.toString()).toContain("0.25");
  });

  // Гарантія використання context-у — не падає на ROOT_CONTEXT.
  it("приймає ROOT_CONTEXT без span-парента", () => {
    const sampler = createRouteAwareSampler({ defaultRate: 0.1 });
    expect(() =>
      sampler.shouldSample(
        context.active(),
        "trace-id",
        "GET",
        SpanKind.SERVER,
        attrs("/api/finyk/transactions", "GET"),
        [],
      ),
    ).not.toThrow();
  });
});
