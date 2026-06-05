import { describe, it, expect } from "vitest";
import type { Request, Response } from "express";
import { cachingMiddleware, noStoreMiddleware, publicCacheMiddleware } from "./cacheMiddleware";

describe("cacheMiddleware", () => {
  const createMockRes = (): Response => {
    const headers: Record<string, string> = {};
    return {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
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
        "no-store, no-cache, must-revalidate",
      );
    });

    it("sets no-cache with custom maxAgeSeconds", () => {
      const req = {} as Request;
      const res = createMockRes();
      cachingMiddleware({ policy: "no-cache", maxAgeSeconds: 60 })(req, res, mockNext);
      expect(res.setHeader).toHaveBeenCalledWith(
        "Cache-Control",
        "no-cache, max-age=60, must-revalidate",
      );
    });

    it("sets stale-while-revalidate with custom maxAgeSeconds", () => {
      const req = {} as Request;
      const res = createMockRes();
      cachingMiddleware({ policy: "stale-while-revalidate", maxAgeSeconds: 120 })(req, res, mockNext);
      expect(res.setHeader).toHaveBeenCalledWith(
        "Cache-Control",
        "public, max-age=120, stale-while-revalidate=300",
      );
    });

    it("sets public with custom maxAgeSeconds", () => {
      const req = {} as Request;
      const res = createMockRes();
      cachingMiddleware({ policy: "public", maxAgeSeconds: 600 })(req, res, mockNext);
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
});