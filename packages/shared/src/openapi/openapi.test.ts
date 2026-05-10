import { describe, expect, it } from "vitest";

import { buildOpenApiDocument } from "./index";

describe("OpenAPI document", () => {
  const doc = buildOpenApiDocument();

  it("returns a valid OpenAPI 3.1 root", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info).toMatchObject({
      title: "Sergeant API",
      version: "v1",
    });
    expect(Array.isArray(doc.servers)).toBe(true);
    expect((doc.servers ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("registers expected named components", () => {
    const schemas = doc.components?.schemas ?? {};
    // Sample-перевірка ключових компонентів — повний список — у registry.ts.
    expect(schemas).toHaveProperty("MeResponse");
    expect(schemas).toHaveProperty("ChatRequest");
    expect(schemas).toHaveProperty("PushRegister");
    expect(schemas).toHaveProperty("ApiError");
  });

  it("does not register the v1 sync schemas (PR #076 — sunset since 2026-05-06)", () => {
    const schemas = doc.components?.schemas ?? {};
    expect(schemas).not.toHaveProperty("SyncPush");
    expect(schemas).not.toHaveProperty("SyncPull");
    expect(schemas).not.toHaveProperty("SyncPushAll");
  });

  it("declares cookieAuth and bearerAuth security schemes", () => {
    const security = doc.components?.securitySchemes ?? {};
    expect(security).toHaveProperty("cookieAuth");
    expect(security).toHaveProperty("bearerAuth");
  });

  it("includes core public endpoints with expected methods", () => {
    const paths = doc.paths ?? {};
    expect(paths).toHaveProperty("/api/me");
    expect(paths).toHaveProperty("/api/chat");
    expect(paths).toHaveProperty("/api/push/register");
    expect(paths["/api/me"]?.get).toBeTruthy();
    expect(paths["/api/chat"]?.post).toBeTruthy();
  });

  it("does not advertise v1 sync routes (PR #076 — they return 410 Gone)", () => {
    const paths = doc.paths ?? {};
    expect(paths).not.toHaveProperty("/api/sync/push");
    expect(paths).not.toHaveProperty("/api/sync/pull");
    expect(paths).not.toHaveProperty("/api/sync/pull-all");
    expect(paths).not.toHaveProperty("/api/sync/push-all");
  });

  it("uses $ref for named components in /api/me response", () => {
    const meGet = doc.paths?.["/api/me"]?.get;
    const schema =
      meGet?.responses?.["200"] && "content" in meGet.responses["200"]
        ? meGet.responses["200"].content?.["application/json"]?.schema
        : undefined;
    expect(schema).toEqual({ $ref: "#/components/schemas/MeResponse" });
  });

  it("attaches validationError 400 to body-validated routes", () => {
    const chatPost = doc.paths?.["/api/chat"]?.post;
    const r400 = chatPost?.responses?.["400"];
    expect(r400).toBeTruthy();
    if (r400 && "content" in r400) {
      expect(r400.content?.["application/json"]?.schema).toEqual({
        $ref: "#/components/schemas/ApiError",
      });
    }
  });
});
