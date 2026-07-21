import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setRequestModule: vi.fn(),
}));

vi.mock("../obs/requestContext.js", () => ({
  setRequestModule: mocks.setRequestModule,
}));

import { setModule } from "./setModule.js";

describe("setModule", () => {
  it("tags the request context and continues", () => {
    const next = vi.fn();
    const middleware = setModule("nutrition");

    middleware(
      {} as Parameters<typeof middleware>[0],
      {} as Parameters<typeof middleware>[1],
      next,
    );

    expect(mocks.setRequestModule).toHaveBeenCalledWith("nutrition");
    expect(next).toHaveBeenCalledTimes(1);
  });
});
