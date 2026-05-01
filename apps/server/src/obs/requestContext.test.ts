import { describe, it, expect } from "vitest";
import type { Request, Response } from "express";
import {
  als,
  getRequestContext,
  setUserId,
  setRequestModule,
  withRequestContext,
} from "./requestContext.js";

describe("withRequestContext", () => {
  it("встановлює store з requestId із req і дозволяє оновити userId/module", () => {
    const req = { requestId: "req-1" } as unknown as Request;
    let captured: Record<string, unknown> | undefined;

    withRequestContext(req, {} as Response, () => {
      setUserId("u-42");
      setRequestModule("nutrition");
      captured = { ...als.getStore() };
    });

    expect(captured).toEqual({
      requestId: "req-1",
      userId: "u-42",
      module: "nutrition",
      traceId: null,
    });
  });

  it("поза ALS-контекстом getRequestContext повертає null", () => {
    expect(getRequestContext()).toBeNull();
  });

  it("два паралельні контексти не змішуються", async () => {
    const run = (id: string) =>
      new Promise<string>((resolve) =>
        withRequestContext(
          { requestId: id } as unknown as Request,
          {} as Response,
          async () => {
            await new Promise((r) => setTimeout(r, 1));
            resolve(als.getStore()!.requestId as string);
          },
        ),
      );
    const [a, b] = await Promise.all([run("a"), run("b")]);
    expect(a).toBe("a");
    expect(b).toBe("b");
  });
});
