import { describe, it, expect } from "vitest";
import { createReadGithubTool, ReadGithubParamsSchema } from "./read-github.js";
import { OpenClawHttpClient } from "../http-client.js";

const API_KEY = "x".repeat(32);

function makeHttp(
  responder: (body: unknown) => { status?: number; body: unknown },
): OpenClawHttpClient {
  return new OpenClawHttpClient({
    baseUrl: "http://x",
    apiKey: API_KEY,
    fetchImpl: ((_input: string | URL | Request, init?: RequestInit) => {
      const parsed = JSON.parse(String(init?.body));
      const { status, body } = responder(parsed);
      return Promise.resolve(
        new Response(JSON.stringify(body), { status: status ?? 200 }),
      );
    }) as typeof globalThis.fetch,
  });
}

describe("ReadGithubParamsSchema", () => {
  it("requires mode field", () => {
    expect(() => ReadGithubParamsSchema.parse({})).toThrow();
  });

  it("accepts file mode with path", () => {
    const result = ReadGithubParamsSchema.parse({
      mode: "file",
      filePath: "src/index.ts",
    });
    expect(result.mode).toBe("file");
    expect(result.filePath).toBe("src/index.ts");
  });
});

describe("createReadGithubTool", () => {
  it("forwards params to /github", async () => {
    let captured: unknown = null;
    const http = makeHttp((body) => {
      captured = body;
      return { body: { content: "file content", metadata: {} } };
    });
    const tool = createReadGithubTool({ http });

    await tool.execute("inv_1", { mode: "file", filePath: "README.md" });
    expect(captured).toEqual({
      mode: "file",
      filePath: "README.md",
      repo: undefined,
      ref: undefined,
      number: undefined,
    });
  });

  it("returns file content", async () => {
    const http = makeHttp(() => ({
      body: { content: "# README\nHello", metadata: { sha: "abc" } },
    }));
    const tool = createReadGithubTool({ http });

    const result = await tool.execute("inv_1", {
      mode: "file",
      filePath: "README.md",
    });
    expect(result.content[0]).toEqual({
      type: "text",
      text: "# README\nHello",
    });
  });

  it("handles 404", async () => {
    const http = makeHttp(() => ({
      status: 404,
      body: { error: "not_found" },
    }));
    const tool = createReadGithubTool({ http });

    const result = await tool.execute("inv_1", {
      mode: "file",
      filePath: "missing.ts",
    });
    const textBlock = result.content[0] as { type: string; text: string };
    expect(textBlock.text).toContain("not found");
  });
});
