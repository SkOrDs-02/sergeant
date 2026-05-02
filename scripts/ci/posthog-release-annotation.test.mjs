import { describe, it, expect, vi } from "vitest";
import {
  readConfig,
  readCommitMessageFromEvent,
  firstLine,
  shortSha,
  buildContent,
  buildAnnotationPayload,
  buildAnnotationUrl,
  postAnnotation,
  main,
} from "./posthog-release-annotation.mjs";

describe("readConfig", () => {
  it("returns null when API key is missing", () => {
    expect(readConfig({ POSTHOG_PROJECT_ID: "1" })).toBeNull();
  });

  it("returns null when project id is missing", () => {
    expect(readConfig({ POSTHOG_PERSONAL_API_KEY: "phx_x" })).toBeNull();
  });

  it("returns config with EU host default", () => {
    expect(
      readConfig({
        POSTHOG_PERSONAL_API_KEY: "phx_x",
        POSTHOG_PROJECT_ID: "42",
      }),
    ).toEqual({
      apiKey: "phx_x",
      projectId: "42",
      host: "https://eu.posthog.com",
      scope: "project",
    });
  });

  it("strips trailing slashes from host", () => {
    expect(
      readConfig({
        POSTHOG_PERSONAL_API_KEY: "phx_x",
        POSTHOG_PROJECT_ID: "42",
        POSTHOG_HOST: "https://us.posthog.com/",
      }).host,
    ).toBe("https://us.posthog.com");
  });

  it("falls back to project scope on invalid scope", () => {
    expect(
      readConfig({
        POSTHOG_PERSONAL_API_KEY: "phx_x",
        POSTHOG_PROJECT_ID: "42",
        POSTHOG_ANNOTATION_SCOPE: "weird",
      }).scope,
    ).toBe("project");
  });

  it("accepts organization scope", () => {
    expect(
      readConfig({
        POSTHOG_PERSONAL_API_KEY: "phx_x",
        POSTHOG_PROJECT_ID: "42",
        POSTHOG_ANNOTATION_SCOPE: "organization",
      }).scope,
    ).toBe("organization");
  });
});

describe("readCommitMessageFromEvent", () => {
  it("returns null when path is undefined", () => {
    expect(readCommitMessageFromEvent(undefined)).toBeNull();
  });

  it("returns null when read fails", () => {
    expect(
      readCommitMessageFromEvent("/nope.json", () => {
        throw new Error("ENOENT");
      }),
    ).toBeNull();
  });

  it("returns null on invalid JSON", () => {
    expect(readCommitMessageFromEvent("/x.json", () => "not json")).toBeNull();
  });

  it("returns null when head_commit.message is missing", () => {
    expect(
      readCommitMessageFromEvent("/x.json", () => JSON.stringify({})),
    ).toBeNull();
  });

  it("extracts head_commit.message from push event payload", () => {
    expect(
      readCommitMessageFromEvent("/x.json", () =>
        JSON.stringify({
          head_commit: { message: "feat(web): hello\n\nbody" },
        }),
      ),
    ).toBe("feat(web): hello\n\nbody");
  });
});

describe("firstLine", () => {
  it("returns the message itself when single-line", () => {
    expect(firstLine("hello")).toBe("hello");
  });

  it("returns the first line on multiline message", () => {
    expect(firstLine("hello\nworld")).toBe("hello");
  });

  it("handles empty string", () => {
    expect(firstLine("")).toBe("");
  });
});

describe("shortSha", () => {
  it("trims to 7 chars", () => {
    expect(shortSha("abcdef0123456789")).toBe("abcdef0");
  });

  it("returns empty string when not a string", () => {
    expect(shortSha(undefined)).toBe("");
    expect(shortSha(null)).toBe("");
  });
});

describe("buildContent", () => {
  it("includes sha, ref, subject, and run id", () => {
    expect(
      buildContent({
        sha: "abcdef0123456789",
        ref: "main",
        commitMessage: "feat(web): hello\nbody",
        runId: "12345",
      }),
    ).toBe("Release abcdef0 (main): feat(web): hello [run #12345]");
  });

  it("works without commit message", () => {
    expect(buildContent({ sha: "abcdef0123456789", ref: "main" })).toBe(
      "Release abcdef0 (main)",
    );
  });

  it("works without sha", () => {
    expect(buildContent({ sha: "" })).toBe("Release");
  });

  it("trims overly long content with ellipsis", () => {
    const long = "x".repeat(2000);
    const out = buildContent({
      sha: "abcdef0",
      ref: "main",
      commitMessage: long,
    });
    expect(out.length).toBeLessThanOrEqual(400);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("buildAnnotationPayload", () => {
  it("creates basic project-scoped payload", () => {
    expect(
      buildAnnotationPayload({
        content: "Release abc1234",
        scope: "project",
        dateMarker: "2026-04-27T17:00:00.000Z",
      }),
    ).toEqual({
      content: "Release abc1234",
      scope: "project",
      date_marker: "2026-04-27T17:00:00.000Z",
    });
  });

  it("attaches dashboard_item only for dashboard_item scope", () => {
    expect(
      buildAnnotationPayload({
        content: "x",
        scope: "dashboard_item",
        dateMarker: "2026-04-27T17:00:00.000Z",
        dashboardItem: "99",
      }),
    ).toEqual({
      content: "x",
      scope: "dashboard_item",
      date_marker: "2026-04-27T17:00:00.000Z",
      dashboard_item: "99",
    });
  });

  it("ignores dashboard_item on project scope", () => {
    const out = buildAnnotationPayload({
      content: "x",
      scope: "project",
      dateMarker: "2026-04-27T17:00:00.000Z",
      dashboardItem: "99",
    });
    expect(out).not.toHaveProperty("dashboard_item");
  });
});

describe("buildAnnotationUrl", () => {
  it("composes URL with project id", () => {
    expect(
      buildAnnotationUrl({ host: "https://eu.posthog.com", projectId: "42" }),
    ).toBe("https://eu.posthog.com/api/projects/42/annotations/");
  });

  it("encodes project id", () => {
    expect(
      buildAnnotationUrl({ host: "https://eu.posthog.com", projectId: "a/b" }),
    ).toBe("https://eu.posthog.com/api/projects/a%2Fb/annotations/");
  });
});

describe("postAnnotation", () => {
  it("sends Bearer header and JSON body", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 201,
      text: async () => "{}",
    }));
    const result = await postAnnotation({
      host: "https://eu.posthog.com",
      projectId: "42",
      apiKey: "phx_secret",
      payload: { content: "x", scope: "project", date_marker: "t" },
      fetchImpl,
    });
    expect(result).toEqual({
      ok: true,
      status: 201,
      body: "{}",
      url: "https://eu.posthog.com/api/projects/42/annotations/",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://eu.posthog.com/api/projects/42/annotations/",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer phx_secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: "x",
          scope: "project",
          date_marker: "t",
        }),
      }),
    );
  });
});

describe("main", () => {
  const baseEnv = {
    POSTHOG_PERSONAL_API_KEY: "phx_secret",
    POSTHOG_PROJECT_ID: "42",
    GITHUB_SHA: "abcdef0123456789",
    GITHUB_REF_NAME: "main",
    GITHUB_RUN_ID: "999",
  };

  it("returns 0 and skips when config is missing", async () => {
    const log = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const fetchImpl = vi.fn();
    const code = await main({}, { fetchImpl, logger: log });
    expect(code).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalled();
  });

  it("posts to PostHog and returns 0 on success", async () => {
    const log = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 201,
      text: async () => "{}",
    }));
    const code = await main(baseEnv, {
      fetchImpl,
      logger: log,
      now: () => new Date("2026-04-27T17:00:00.000Z"),
      readFile: () => {
        throw new Error("no event");
      },
    });
    expect(code).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://eu.posthog.com/api/projects/42/annotations/");
    const sent = JSON.parse(init.body);
    expect(sent).toEqual({
      content: "Release abcdef0 (main) [run #999]",
      scope: "project",
      date_marker: "2026-04-27T17:00:00.000Z",
    });
  });

  it("returns 1 on non-2xx PostHog response", async () => {
    const log = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    }));
    const code = await main(baseEnv, {
      fetchImpl,
      logger: log,
      now: () => new Date("2026-04-27T17:00:00.000Z"),
      readFile: () => {
        throw new Error("no event");
      },
    });
    expect(code).toBe(1);
    expect(log.error).toHaveBeenCalled();
  });

  it("returns 1 on fetch throwing", async () => {
    const log = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const code = await main(baseEnv, {
      fetchImpl,
      logger: log,
      now: () => new Date("2026-04-27T17:00:00.000Z"),
      readFile: () => {
        throw new Error("no event");
      },
    });
    expect(code).toBe(1);
    expect(log.error).toHaveBeenCalled();
  });

  it("dry-run mode does not call fetch", async () => {
    const log = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const fetchImpl = vi.fn();
    const code = await main(
      { ...baseEnv, POSTHOG_DRY_RUN: "1" },
      {
        fetchImpl,
        logger: log,
        now: () => new Date("2026-04-27T17:00:00.000Z"),
        readFile: () => {
          throw new Error("no event");
        },
      },
    );
    expect(code).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(log.log).toHaveBeenCalled();
  });

  it("includes commit subject from event payload", async () => {
    const log = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 201,
      text: async () => "{}",
    }));
    await main(
      { ...baseEnv, GITHUB_EVENT_PATH: "/event.json" },
      {
        fetchImpl,
        logger: log,
        now: () => new Date("2026-04-27T17:00:00.000Z"),
        readFile: () =>
          JSON.stringify({
            head_commit: { message: "feat(ci): release annotations" },
          }),
      },
    );
    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(sent.content).toBe(
      "Release abcdef0 (main): feat(ci): release annotations [run #999]",
    );
  });
});
