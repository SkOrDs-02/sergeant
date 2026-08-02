import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("fs", () => ({
  existsSync: vi.fn(),
}));

import { existsSync } from "fs";
import { createFrontendMiddleware } from "./frontend.js";

const mockExistsSync = existsSync as unknown as Mock;

interface MinimalRes {
  status: Mock;
  send: Mock;
  sendFile: Mock;
}

function makeRes(): MinimalRes {
  const res: MinimalRes = {
    status: vi.fn(),
    send: vi.fn(),
    sendFile: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createFrontendMiddleware", () => {
  it("returns a single 503 handler when distPath does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    const middleware = createFrontendMiddleware({ distPath: "/no/such/dir" });
    expect(typeof middleware).toBe("function");

    const res = makeRes();
    (middleware as (req: unknown, res: unknown) => void)({}, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining("Frontend not built"),
    );
  });

  it("returns the three-handler bundle when distPath exists", () => {
    mockExistsSync.mockReturnValue(true);
    const middleware = createFrontendMiddleware({ distPath: "/app/dist" });
    expect(typeof middleware).toBe("object");
    const bundle = middleware as unknown as {
      assetsStatic: unknown;
      rootStatic: unknown;
      sendIndex: (req: unknown, res: unknown) => void;
    };
    expect(typeof bundle.assetsStatic).toBe("function");
    expect(typeof bundle.rootStatic).toBe("function");
    expect(typeof bundle.sendIndex).toBe("function");
  });

  it("sendIndex sends index.html from distPath", () => {
    mockExistsSync.mockReturnValue(true);
    const middleware = createFrontendMiddleware({ distPath: "/app/dist" });
    const bundle = middleware as unknown as {
      sendIndex: (req: unknown, res: unknown) => void;
    };
    const res = makeRes();
    bundle.sendIndex({}, res);
    expect(res.sendFile).toHaveBeenCalledWith(
      expect.stringContaining("index.html"),
    );
  });
});
