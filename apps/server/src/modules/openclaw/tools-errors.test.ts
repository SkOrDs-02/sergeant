import { describe, expect, it } from "vitest";
import {
  OpenClawAllowlistError,
  OpenClawNotFoundError,
  OpenClawSchemaError,
} from "./tools-errors.js";

describe("OpenClaw tool error classes", () => {
  it("OpenClawAllowlistError carries the message and a distinct name", () => {
    const err = new OpenClawAllowlistError("path not in allowlist");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("path not in allowlist");
    expect(err.name).toBe("OpenClawAllowlistError");
  });

  it("OpenClawSchemaError carries the message and a distinct name", () => {
    const err = new OpenClawSchemaError("missing required field: topic");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("missing required field: topic");
    expect(err.name).toBe("OpenClawSchemaError");
  });

  it("OpenClawNotFoundError carries the message and a distinct name", () => {
    const err = new OpenClawNotFoundError(
      "docs/decisions/2026-05.md not found",
    );
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("docs/decisions/2026-05.md not found");
    expect(err.name).toBe("OpenClawNotFoundError");
  });

  it("each class is distinguishable via instanceof (not interchangeable)", () => {
    const allowlist = new OpenClawAllowlistError("a");
    const schema = new OpenClawSchemaError("b");
    const notFound = new OpenClawNotFoundError("c");
    expect(allowlist).not.toBeInstanceOf(OpenClawSchemaError);
    expect(allowlist).not.toBeInstanceOf(OpenClawNotFoundError);
    expect(schema).not.toBeInstanceOf(OpenClawAllowlistError);
    expect(schema).not.toBeInstanceOf(OpenClawNotFoundError);
    expect(notFound).not.toBeInstanceOf(OpenClawAllowlistError);
    expect(notFound).not.toBeInstanceOf(OpenClawSchemaError);
  });
});
