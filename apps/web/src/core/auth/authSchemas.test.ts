import { describe, expect, it } from "vitest";
import { messages } from "@shared/i18n/uk";

import { loginSchema, registerSchema } from "./authSchemas";

describe("loginSchema", () => {
  it("accepts valid email and non-empty password", () => {
    const result = loginSchema.safeParse({
      email: "alice@example.com",
      password: "x",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty email", () => {
    const result = loginSchema.safeParse({ email: "", password: "secret" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.email).toContain(
        messages.validation.emailRequired,
      );
    }
  });

  it("rejects malformed email", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "secret",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.email).toContain(
        messages.validation.emailInvalid,
      );
    }
  });

  it("rejects empty password without enforcing min length", () => {
    const result = loginSchema.safeParse({
      email: "alice@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.password).toContain(
        messages.validation.passwordRequired,
      );
    }
  });
});

describe("registerSchema", () => {
  it("accepts valid payload with optional name omitted", () => {
    const result = registerSchema.safeParse({
      email: "bob@example.com",
      password: "longenoughpw",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty name string as optional", () => {
    const result = registerSchema.safeParse({
      email: "bob@example.com",
      password: "longenoughpw",
      name: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects password shorter than 10 characters", () => {
    const result = registerSchema.safeParse({
      email: "bob@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.password).toContain(
        messages.validation.passwordMin10,
      );
    }
  });

  it("rejects password longer than 128 characters", () => {
    const result = registerSchema.safeParse({
      email: "bob@example.com",
      password: "a".repeat(129),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.password).toContain(
        messages.validation.passwordMax128,
      );
    }
  });

  it("rejects name longer than 80 characters", () => {
    const result = registerSchema.safeParse({
      email: "bob@example.com",
      password: "longenoughpw",
      name: "n".repeat(81),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.name).toContain(
        messages.validation.nameMax80,
      );
    }
  });
});
