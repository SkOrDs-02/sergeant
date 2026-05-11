import { describe, it, expect } from "vitest";
import { createGetGithubReleasesTool } from "./get-github-releases.js";
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

describe("createGetGithubReleasesTool", () => {
  it("forwards limit and repo to /github/releases", async () => {
    let captured: unknown = null;
    const http = makeHttp((body) => {
      captured = body;
      return { body: { releases: [] } };
    });
    const tool = createGetGithubReleasesTool({ http });

    await tool.execute("inv_1", { limit: 3, repo: "Skords-01/Sergeant" });
    expect(captured).toEqual({ limit: 3, repo: "Skords-01/Sergeant" });
  });

  it("formats releases list", async () => {
    const http = makeHttp(() => ({
      body: {
        releases: [
          {
            tag: "v1.2.0",
            name: "Release 1.2",
            publishedAt: "2026-05-09",
            body: "changelog",
          },
        ],
      },
    }));
    const tool = createGetGithubReleasesTool({ http });

    const result = await tool.execute("inv_1", {});
    const textBlock = result.content[0] as { type: string; text: string };
    expect(textBlock.text).toContain("v1.2.0");
    expect(textBlock.text).toContain("Release 1.2");
  });

  it("handles empty releases", async () => {
    const http = makeHttp(() => ({ body: { releases: [] } }));
    const tool = createGetGithubReleasesTool({ http });

    const result = await tool.execute("inv_1", {});
    const textBlock = result.content[0] as { type: string; text: string };
    expect(textBlock.text).toContain("no releases");
  });
});
