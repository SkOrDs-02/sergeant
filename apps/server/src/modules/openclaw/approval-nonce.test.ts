import { describe, it, expect } from "vitest";
import {
  APPROVAL_NONCE_VERSION,
  hashWriteArgs,
  newNonceId,
  signApprovalNonce,
  stableStringify,
  verifyApprovalNonce,
  type ApprovalNoncePayload,
} from "./approval-nonce.js";

const SECRET = "test-nonce-secret-value";

function mintFor(
  tool: string,
  args: unknown,
  overrides: Partial<ApprovalNoncePayload> = {},
): { token: string; payload: ApprovalNoncePayload } {
  const payload: ApprovalNoncePayload = {
    jti: newNonceId(),
    tool,
    argsHash: hashWriteArgs(tool, args),
    exp: 2_000_000_000, // far future
    ...overrides,
  };
  return { token: signApprovalNonce(SECRET, payload), payload };
}

describe("approval-nonce: hashWriteArgs", () => {
  it("is stable regardless of key insertion order", () => {
    const a = hashWriteArgs("pause_workflow", {
      workflowId: "wf_1",
      reason: "noisy",
    });
    const b = hashWriteArgs("pause_workflow", {
      reason: "noisy",
      workflowId: "wf_1",
    });
    expect(a).toBe(b);
  });

  it("ignores fields outside the tool's arg set", () => {
    const base = hashWriteArgs("post_to_topic", {
      topic: "eng",
      text: "hi",
    });
    const withExtra = hashWriteArgs("post_to_topic", {
      topic: "eng",
      text: "hi",
      somethingElse: "should be ignored",
    });
    expect(withExtra).toBe(base);
  });

  it("changes when an approved field changes", () => {
    const a = hashWriteArgs("post_to_topic", { topic: "eng", text: "hi" });
    const b = hashWriteArgs("post_to_topic", { topic: "eng", text: "bye" });
    expect(a).not.toBe(b);
  });

  it("treats a missing optional field distinctly from a present one", () => {
    const withReason = hashWriteArgs("pause_workflow", {
      workflowId: "wf_1",
      reason: "noisy",
    });
    const withoutReason = hashWriteArgs("pause_workflow", {
      workflowId: "wf_1",
    });
    expect(withReason).not.toBe(withoutReason);
  });
});

describe("approval-nonce: stableStringify", () => {
  it("sorts nested object keys and preserves array order", () => {
    expect(stableStringify({ b: 1, a: [3, 1, 2], c: { z: 1, y: 2 } })).toBe(
      '{"a":[3,1,2],"b":1,"c":{"y":2,"z":1}}',
    );
  });
});

describe("approval-nonce: sign + verify round-trip", () => {
  const tool = "create_github_issue";
  const args = { title: "t", body: "b", labels: ["ops"], repo: "o/r" };

  it("verifies a freshly minted nonce", () => {
    const { token, payload } = mintFor(tool, args);
    const result = verifyApprovalNonce({
      secret: SECRET,
      token,
      tool,
      writeArgs: args,
      now: 1_000_000,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.jti).toBe(payload.jti);
  });

  it("token carries the version prefix", () => {
    const { token } = mintFor(tool, args);
    expect(token.startsWith(`${APPROVAL_NONCE_VERSION}.`)).toBe(true);
  });

  it("rejects a tampered signature", () => {
    const { token } = mintFor(tool, args);
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    const result = verifyApprovalNonce({
      secret: SECRET,
      token: tampered,
      tool,
      writeArgs: args,
      now: 1_000_000,
    });
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects a nonce signed with a different secret", () => {
    const { token } = mintFor(tool, args);
    const result = verifyApprovalNonce({
      secret: "some-other-secret",
      token,
      tool,
      writeArgs: args,
      now: 1_000_000,
    });
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects an expired nonce", () => {
    const { token } = mintFor(tool, args, { exp: 1_000 });
    const result = verifyApprovalNonce({
      secret: SECRET,
      token,
      tool,
      writeArgs: args,
      now: 5_000,
    });
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects when the tool doesn't match the endpoint", () => {
    const { token } = mintFor(tool, args);
    const result = verifyApprovalNonce({
      secret: SECRET,
      token,
      tool: "pause_workflow",
      writeArgs: args,
      now: 1_000_000,
    });
    expect(result).toEqual({ ok: false, reason: "tool_mismatch" });
  });

  it("rejects when the args differ from what was approved", () => {
    const { token } = mintFor(tool, args);
    const result = verifyApprovalNonce({
      secret: SECRET,
      token,
      tool,
      writeArgs: { ...args, title: "changed after approval" },
      now: 1_000_000,
    });
    expect(result).toEqual({ ok: false, reason: "args_mismatch" });
  });

  it("rejects a malformed token", () => {
    const result = verifyApprovalNonce({
      secret: SECRET,
      token: "not-a-valid-token",
      tool,
      writeArgs: args,
      now: 1_000_000,
    });
    expect(result).toEqual({ ok: false, reason: "malformed_nonce" });
  });
});
