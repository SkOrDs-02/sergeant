import Ajv from "ajv";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

type RoundtripRoute =
  "/api/me" | "/api/billing/status" | "/api/billing/providers";

function responseValidator(
  route: RoundtripRoute,
  method: "get",
  status: 200 | 401,
) {
  const response = document.paths?.[route]?.[method]?.responses?.[status];
  const schema = response?.content?.["application/json"]?.schema;
  if (!schema) {
    throw new Error(
      `Missing JSON response schema for ${method} ${route} ${status}`,
    );
  }

  const encodedPath = route.replaceAll("/", "~1");
  return ajv.compile({
    $ref: `openapi://sergeant#/paths/${encodedPath}/${method}/responses/${status}/content/application~1json/schema`,
  });
}

function expectMatchesOpenApi(
  route: RoundtripRoute,
  status: 200 | 401,
  body: unknown,
) {
  const validate = responseValidator(route, "get", status);
  expect(
    validate(body),
    validate.errors?.map((error) => error.message).join("; "),
  ).toBe(true);
}

const SESSION_USER = {
  id: "contract-user",
  email: "contract@example.com",
  name: "Contract User",
  image: null,
  emailVerified: true,
  createdAt: new Date("2026-07-01T12:00:00.000Z"),
};

describe("OpenAPI roundtrip: representative live responses", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  });

  it("validates the authenticated /api/me response against the generated OpenAPI schema", async () => {
    getSessionUserMock.mockResolvedValueOnce(SESSION_USER);

    const response = await request(createApp())
      .get("/api/me")
      .set("Authorization", "Bearer contract-stub");

    expect(response.status).toBe(200);
    expectMatchesOpenApi("/api/me", 200, response.body);
  });

  it("validates the unauthenticated /api/me error envelope against OpenAPI", async () => {
    getSessionUserMock.mockResolvedValueOnce(null);

    const response = await request(createApp()).get("/api/me");

    expect(response.status).toBe(401);
    expectMatchesOpenApi("/api/me", 401, response.body);
  });

  it("validates authenticated /api/billing/status (free / no row) against OpenAPI", async () => {
    getSessionUserMock.mockResolvedValueOnce(SESSION_USER);
    // liqpayProvider.getSubscriptionStatus → SELECT … LIMIT 1 → empty.
    queryMock.mockResolvedValueOnce({ rows: [] });

    const response = await request(createApp())
      .get("/api/billing/status")
      .set("Authorization", "Bearer contract-stub");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      subscription: {
        id: null,
        provider: null,
        plan: null,
        status: null,
        active: false,
        currentPeriodEnd: null,
      },
    });
    expectMatchesOpenApi("/api/billing/status", 200, response.body);
  });

  it("validates authenticated /api/billing/status (active Pro) against OpenAPI", async () => {
    getSessionUserMock.mockResolvedValueOnce(SESSION_USER);
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "42",
          provider: "liqpay",
          plan: "pro",
          status: "active",
          current_period_end: new Date("2026-08-01T00:00:00.000Z"),
        },
      ],
    });

    const response = await request(createApp())
      .get("/api/billing/status")
      .set("Authorization", "Bearer contract-stub");

    expect(response.status).toBe(200);
    expect(response.body.subscription).toMatchObject({
      id: 42,
      provider: "liqpay",
      plan: "pro",
      status: "active",
      active: true,
    });
    expectMatchesOpenApi("/api/billing/status", 200, response.body);
  });

  it("validates unauthenticated /api/billing/status error envelope against OpenAPI", async () => {
    getSessionUserMock.mockResolvedValueOnce(null);

    const response = await request(createApp()).get("/api/billing/status");

    expect(response.status).toBe(401);
    expectMatchesOpenApi("/api/billing/status", 401, response.body);
  });

  it("validates authenticated /api/billing/providers (non-UA → stripe) against OpenAPI", async () => {
    getSessionUserMock.mockResolvedValueOnce(SESSION_USER);

    const response = await request(createApp())
      .get("/api/billing/providers")
      .set("Authorization", "Bearer contract-stub")
      .set("x-vercel-ip-country", "US");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ providers: ["stripe"] });
    expectMatchesOpenApi("/api/billing/providers", 200, response.body);
  });

  it("validates unauthenticated /api/billing/providers error envelope against OpenAPI", async () => {
    getSessionUserMock.mockResolvedValueOnce(null);

    const response = await request(createApp()).get("/api/billing/providers");

    expect(response.status).toBe(401);
    expectMatchesOpenApi("/api/billing/providers", 401, response.body);
  });
});
