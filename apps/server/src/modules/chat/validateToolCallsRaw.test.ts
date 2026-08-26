import { describe, expect, it } from "vitest";
import { validateToolCallsRawProvenance } from "./validateToolCallsRaw.js";
import { ValidationError } from "../../obs/errors.js";
import { TOOL_SEARCH_TOOL } from "./toolSearch.js";

/**
 * B32 (`docs/90-work/audits/ai-testing-2026-08-25.md`) — the two runtime
 * checks that can't live in the shared Zod schema (server-only `TOOLS`
 * registry + cross-referencing `tool_results`). Structural validation
 * (`.strict()`, discriminated union) is covered separately in
 * `packages/shared/src/schemas/chat.test.ts`.
 */
describe("validateToolCallsRawProvenance", () => {
  it("passes for a known tool_use with a matching tool_result", () => {
    expect(() =>
      validateToolCallsRawProvenance(
        [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "delete_transaction",
            input: {},
          },
        ],
        [{ tool_use_id: "toolu_1" }],
      ),
    ).not.toThrow();
  });

  it("passes for the one wired server_tool_use (tool_search_tool_regex)", () => {
    expect(() =>
      validateToolCallsRawProvenance(
        [
          {
            type: "server_tool_use",
            id: "srvtoolu_1",
            name: TOOL_SEARCH_TOOL.name,
            input: { query: "find_transaction" },
          },
        ],
        [],
      ),
    ).not.toThrow();
  });

  it("ignores non-tool_use blocks (e.g. tool_search_tool_result)", () => {
    expect(() =>
      validateToolCallsRawProvenance(
        [
          {
            type: "tool_search_tool_result",
            tool_use_id: "srvtoolu_1",
            content: [],
          },
        ],
        [],
      ),
    ).not.toThrow();
  });

  it("rejects a tool_use block with an unregistered tool name", () => {
    let caught: unknown;
    try {
      validateToolCallsRawProvenance(
        [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "definitely_not_a_real_tool",
            input: {},
          },
        ],
        [{ tool_use_id: "toolu_1" }],
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect(caught).toMatchObject({
      status: 400,
      code: "CHAT_UNKNOWN_TOOL_NAME",
    });
  });

  it("rejects a server_tool_use block whose name isn't the wired server tool", () => {
    let caught: unknown;
    try {
      validateToolCallsRawProvenance(
        [
          {
            type: "server_tool_use",
            id: "srvtoolu_1",
            name: "some_other_hosted_tool",
            input: {},
          },
        ],
        [],
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect(caught).toMatchObject({
      status: 400,
      code: "CHAT_UNKNOWN_TOOL_NAME",
    });
  });

  it("rejects a tool_use block with no matching tool_results entry (provenance)", () => {
    let caught: unknown;
    try {
      validateToolCallsRawProvenance(
        [
          {
            type: "tool_use",
            id: "toolu_orphan",
            name: "delete_transaction",
            input: {},
          },
        ],
        // `tool_results` non-empty but for a DIFFERENT id — the orphan
        // tool_use never got executed by the client.
        [{ tool_use_id: "toolu_other" }],
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect(caught).toMatchObject({
      status: 400,
      code: "CHAT_TOOL_USE_PROVENANCE_MISMATCH",
    });
  });

  it("does not mutate the input arrays", () => {
    const toolCallsRaw = [
      {
        type: "tool_use",
        id: "toolu_1",
        name: "delete_transaction",
        input: {},
      },
    ];
    const toolResults = [{ tool_use_id: "toolu_1", content: "ok" }];
    const toolCallsRawCopy = JSON.parse(JSON.stringify(toolCallsRaw));
    const toolResultsCopy = JSON.parse(JSON.stringify(toolResults));

    validateToolCallsRawProvenance(toolCallsRaw, toolResults);

    expect(toolCallsRaw).toEqual(toolCallsRawCopy);
    expect(toolResults).toEqual(toolResultsCopy);
  });
});
