import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { Request, Response } from "express";
import {
  cachingMiddleware,
  noStoreMiddleware,
  publicCacheMiddleware,
} from "./cacheMiddleware";

describe("cacheMiddleware", () => {
  const createMockRes = (): Response => {
    const headers: Record<string, string> = {};
    return {
      setHeader: vi.fn((name: string, value: string) => {
        headers[name] = value;
      }),
    } as unknown as Response;
  };

  const mockNext = () => {};

  describe("cachingMiddleware", () => {
    it("sets no-store by default", () => {
      const req = {} as Request;
      const res = createMockRes();
      cachingMiddleware()(req, res, mockNext);
      expect(res.setHeader).toHaveBeenCalledWith(
        "Cache-Control",
        "private, no-store, no-cache, must-revalidate",
      );
    });

    it("sets no-cache with custom maxAgeSeconds", () => {
      const req = {} as Request;
      const res = createMockRes();
      cachingMiddleware({ policy: "no-cache", maxAgeSeconds: 60 })(
        req,
        res,
        mockNext,
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        "Cache-Control",
        "no-cache, max-age=60, must-revalidate",
      );
    });

    it("sets stale-while-revalidate with custom maxAgeSeconds", () => {
      const req = {} as Request;
      const res = createMockRes();
      cachingMiddleware({
        policy: "stale-while-revalidate",
        maxAgeSeconds: 120,
      })(req, res, mockNext);
      expect(res.setHeader).toHaveBeenCalledWith(
        "Cache-Control",
        "public, max-age=120, stale-while-revalidate=300",
      );
    });

    it("sets public with custom maxAgeSeconds", () => {
      const req = {} as Request;
      const res = createMockRes();
      cachingMiddleware({ policy: "public", maxAgeSeconds: 600 })(
        req,
        res,
        mockNext,
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        "Cache-Control",
        "public, max-age=600",
      );
    });
  });

  describe("noStoreMiddleware", () => {
    it("sets no-store header", () => {
      const req = {} as Request;
      const res = createMockRes();
      noStoreMiddleware(req, res, mockNext);
      expect(res.setHeader).toHaveBeenCalledWith(
        "Cache-Control",
        "no-store, no-cache, must-revalidate",
      );
    });
  });

  describe("publicCacheMiddleware", () => {
    it("sets public cache with default maxAgeSeconds", () => {
      const req = {} as Request;
      const res = createMockRes();
      publicCacheMiddleware()(req, res, mockNext);
      expect(res.setHeader).toHaveBeenCalledWith(
        "Cache-Control",
        "public, max-age=300",
      );
    });

    it("sets public cache with custom maxAgeSeconds", () => {
      const req = {} as Request;
      const res = createMockRes();
      publicCacheMiddleware(600)(req, res, mockNext);
      expect(res.setHeader).toHaveBeenCalledWith(
        "Cache-Control",
        "public, max-age=600",
      );
    });
  });

  describe("cachingMiddleware — публічний кеш лише для 2xx (rel-21)", () => {
    // Реальний Express: `writeHead` викликається саме Node/Express, а не моком.
    function appWith(
      status: number,
      policy: "stale-while-revalidate" | "no-store",
    ) {
      const app = express();
      app.get(
        "/x",
        cachingMiddleware({ policy, maxAgeSeconds: 300 }),
        (_req, res) => {
          res.status(status).json({ status });
        },
      );
      return app;
    }
    const PUBLIC = "public, max-age=300, stale-while-revalidate=300";

    it("200 зберігає public, max-age=300", async () => {
      const res = await request(appWith(200, "stale-while-revalidate")).get(
        "/x",
      );
      expect(res.status).toBe(200);
      expect(res.headers["cache-control"]).toBe(PUBLIC);
    });

    it.each([400, 404, 429, 500, 503, 504])(
      "%i перекриває публічний кеш на no-store",
      async (status) => {
        const res = await request(
          appWith(status, "stale-while-revalidate"),
        ).get("/x");
        expect(res.status).toBe(status);
        expect(res.headers["cache-control"]).toBe("no-store");
      },
    );

    it("304 (підтвердження валідатора) не чіпає Cache-Control", async () => {
      const app = express();
      app.get(
        "/x",
        cachingMiddleware({
          policy: "stale-while-revalidate",
          maxAgeSeconds: 300,
        }),
        (_req, res) => {
          res.json({ a: 1 });
        },
      );
      const first = await request(app).get("/x");
      const res = await request(app)
        .get("/x")
        .set("If-None-Match", first.headers["etag"] as string);
      expect(res.status).toBe(304);
      expect(res.headers["cache-control"]).toBe(PUBLIC);
    });

    it("no-store-політика (глобальний /api) не послаблюється на помилках", async () => {
      const res = await request(appWith(500, "no-store")).get("/x");
      expect(res.headers["cache-control"]).toBe(
        "private, no-store, no-cache, must-revalidate",
      );
    });

    it("хендлер, що сам поставив no-store, не перезаписується", async () => {
      const app = express();
      app.get(
        "/x",
        cachingMiddleware({
          policy: "stale-while-revalidate",
          maxAgeSeconds: 300,
        }),
        (_req, res) => {
          res.setHeader("Cache-Control", "private, no-store");
          res.status(503).json({});
        },
      );
      const res = await request(app).get("/x");
      expect(res.headers["cache-control"]).toBe("private, no-store");
    });
  });
});
