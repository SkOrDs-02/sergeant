import Ajv from "ajv";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";

import { buildOpenApiDocument } from "@sergeant/shared/openapi";

const { mockPool, queryMock, getSessionUserMock } = vi.hoisted(() => {
  const queryMock = vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] });
  const mockPool = {
    query: queryMock,
    connect: vi.fn(),
    on: vi.fn(),
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
  };
  const getSessionUserMock = vi.fn();
  return { mockPool, queryMock, getSessionUserMock };
});

vi.mock("../../db.js", () => ({
  default: mockPool,
  pool: mockPool,
  query: queryMock,
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../auth.js", () => ({
  auth: { handler: async () => new Response(null, { status: 404 }) },
  getSessionUser: getSessionUserMock,
  getSessionUserSoft: vi.fn().mockResolvedValue(null),
}));

import { createApp } from "../../app.js";

const document = buildOpenApiDocument();
const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addSchema(document, "openapi://sergeant");

function responseValidator(route: "/api/me", method: "get", status: 200 | 401) {
  const response = document.paths?.[route]?.[method]?.responses?.[status];
  const schema = response?.content?.["application/json"]?.schema;
  if (!schema) {
    throw new Error(
      `Missing JSON response schema for ${method} ${route} ${status}`,
    );
  }

  return ajv.compile({
    $ref: `openapi://sergeant#/paths/~1api~1me/get/responses/${status}/content/application~1json/schema`,
  });
}

describe("OpenAPI roundtrip: representative live responses", () => {
  it("validates the authenticated /api/me response against the generated OpenAPI schema", async () => {
    getSessionUserMock.mockResolvedValueOnce({
      id: "contract-user",
      email: "contract@example.com",
      name: "Contract User",
      image: null,
      emailVerified: true,
      createdAt: new Date("2026-07-01T12:00:00.000Z"),
    });

    const response = await request(createApp())
      .get("/api/me")
      .set("Authorization", "Bearer contract-stub");

    expect(response.status).toBe(200);
    const validate = responseValidator("/api/me", "get", 200);
    expect(
      validate(response.body),
      validate.errors?.map((error) => error.message),
    ).toBe(true);
  });

  it("validates the unauthenticated /api/me error envelope against OpenAPI", async () => {
    getSessionUserMock.mockResolvedValueOnce(null);

    const response = await request(createApp()).get("/api/me");

    expect(response.status).toBe(401);
    const validate = responseValidator("/api/me", "get", 401);
    expect(
      validate(response.body),
      validate.errors?.map((error) => error.message),
    ).toBe(true);
  });
});
