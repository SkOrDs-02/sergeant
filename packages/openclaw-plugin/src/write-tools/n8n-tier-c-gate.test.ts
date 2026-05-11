import { describe, it, expect, vi } from "vitest";
import {
  createN8nTierCPostHook,
  isApprovalRequiredResult,
} from "./n8n-tier-c-gate.js";
import type { ToolResult } from "../sdk-types.js";

describe("n8n Tier C gate", () => {
  describe("createN8nTierCPostHook", () => {
    it("ignores non-n8n tools", async () => {
      const auditSink = vi.fn().mockResolvedValue(undefined);
      const hook = createN8nTierCPostHook({
        founderUserId: "user_test",
        auditSink,
      });

      const result = await hook({
        invocationId: "inv-1",
        agentRunId: "run-1",
        toolName: "recall_memory",
        params: {},
        result: { ok: true, result: { content: [] } },
        durationMs: 100,
      });

      expect(result.ok).toBe(true);
      expect(auditSink).not.toHaveBeenCalled();
    });

    it("ignores n8n_trigger without approvalRequired", async () => {
      const auditSink = vi.fn().mockResolvedValue(undefined);
      const hook = createN8nTierCPostHook({
        founderUserId: "user_test",
        auditSink,
      });

      const result = await hook({
        invocationId: "inv-1",
        agentRunId: "run-1",
        toolName: "n8n_trigger",
        params: { workflowId: "wf-1" },
        result: {
          ok: true,
          result: {
            content: [
              { type: "text", text: "triggered" },
              {
                type: "structured",
                data: {
                  status: "triggered",
                  workflowId: "wf-1",
                  tier: "A",
                  approvalRequired: false,
                },
              },
            ],
          },
        },
        durationMs: 100,
      });

      expect(result.ok).toBe(true);
      expect(auditSink).not.toHaveBeenCalled();
    });

    it("records audit for n8n_trigger with approvalRequired: true", async () => {
      const auditSink = vi.fn().mockResolvedValue(undefined);
      const hook = createN8nTierCPostHook({
        founderUserId: "user_test",
        auditSink,
      });

      const result = await hook({
        invocationId: "inv-1",
        agentRunId: "run-1",
        toolName: "n8n_trigger",
        params: { workflowId: "wf-c1" },
        result: {
          ok: true,
          result: {
            content: [
              { type: "text", text: "triggered" },
              {
                type: "structured",
                data: {
                  status: "triggered",
                  workflowId: "wf-c1",
                  tier: "C",
                  approvalRequired: true,
                },
              },
            ],
          },
        },
        durationMs: 200,
      });

      expect(result.ok).toBe(true);
      expect(auditSink).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "n8n_trigger",
          action: "approved",
        }),
      );
    });

    it("records audit for n8n_activate with approvalRequired: true", async () => {
      const auditSink = vi.fn().mockResolvedValue(undefined);
      const hook = createN8nTierCPostHook({
        founderUserId: "user_test",
        auditSink,
      });

      await hook({
        invocationId: "inv-2",
        agentRunId: "run-2",
        toolName: "n8n_activate",
        params: { workflowId: "wf-c2" },
        result: {
          ok: true,
          result: {
            content: [
              { type: "text", text: "activated" },
              {
                type: "structured",
                data: {
                  status: "activated",
                  workflowId: "wf-c2",
                  tier: "C",
                  approvalRequired: true,
                },
              },
            ],
          },
        },
        durationMs: 150,
      });

      expect(auditSink).toHaveBeenCalled();
    });

    it("handles failed result gracefully", async () => {
      const auditSink = vi.fn().mockResolvedValue(undefined);
      const hook = createN8nTierCPostHook({
        founderUserId: "user_test",
        auditSink,
      });

      const result = await hook({
        invocationId: "inv-1",
        agentRunId: "run-1",
        toolName: "n8n_trigger",
        params: { workflowId: "wf-1" },
        result: { ok: false, error: "some error" },
        durationMs: 50,
      });

      expect(result.ok).toBe(true);
      expect(auditSink).not.toHaveBeenCalled();
    });
  });

  describe("isApprovalRequiredResult", () => {
    it("returns true for approvalRequired: true", () => {
      const result: ToolResult = {
        content: [
          { type: "text", text: "triggered" },
          {
            type: "structured",
            data: { approvalRequired: true, workflowId: "wf-1" },
          },
        ],
      };
      expect(isApprovalRequiredResult(result)).toBe(true);
    });

    it("returns false for approvalRequired: false", () => {
      const result: ToolResult = {
        content: [
          { type: "text", text: "triggered" },
          {
            type: "structured",
            data: { approvalRequired: false, workflowId: "wf-1" },
          },
        ],
      };
      expect(isApprovalRequiredResult(result)).toBe(false);
    });

    it("returns false for missing structured block", () => {
      const result: ToolResult = {
        content: [{ type: "text", text: "triggered" }],
      };
      expect(isApprovalRequiredResult(result)).toBe(false);
    });
  });
});
