import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../ApiError";
import { createNutritionEndpoints } from "./nutrition";
import { createTranscribeEndpoints } from "./transcribe";
import type { HttpClient } from "../httpClient";

function httpClient(post = vi.fn()): HttpClient {
  return { post } as unknown as HttpClient;
}

describe("nutrition endpoints", () => {
  it("routes every product helper through the canonical API path", async () => {
    const post = vi.fn(async (path: string, _body?: unknown) => ({
      ok: true,
      path,
    }));
    const endpoints = createNutritionEndpoints(httpClient(post));

    await endpoints.postJson("/api/nutrition/custom", null);
    await endpoints.analyzePhoto({ image: "x" });
    await endpoints.refinePhoto({ image: "x" });
    await endpoints.recommendRecipes({ pantry: [] });
    await endpoints.weekPlan({ pantry: [] });
    await endpoints.dayPlan({ pantry: [] });
    await endpoints.dayHint({ pantry: [] });
    await endpoints.shoppingList({ pantry: [] });
    await endpoints.parsePantry({ text: "milk" });
    await endpoints.backupUpload({ blob: { log: {} } });
    await endpoints.backupDownload();

    expect(post.mock.calls.map((call) => call[0])).toEqual([
      "/api/nutrition/custom",
      "/api/nutrition/analyze-photo",
      "/api/nutrition/refine-photo",
      "/api/nutrition/recommend-recipes",
      "/api/nutrition/week-plan",
      "/api/nutrition/day-plan",
      "/api/nutrition/day-hint",
      "/api/nutrition/shopping-list",
      "/api/nutrition/parse-pantry",
      "/api/nutrition/backup-upload",
      "/api/nutrition/backup-download",
    ]);
    expect(post.mock.calls[0]?.[1]).toEqual({});
    expect(post.mock.calls.at(-1)?.[1]).toEqual({});
  });
});

describe("transcribe endpoints", () => {
  it("posts binary audio with content-type and returns parsed ok outcome", async () => {
    const post = vi.fn(async () => ({
      text: "привіт",
      durationSec: 1.23,
      model: "whisper-large-v3",
    }));
    const endpoints = createTranscribeEndpoints(httpClient(post));
    const audio = new ArrayBuffer(4);
    const signal = new AbortController().signal;

    await expect(
      endpoints.send(
        { audio, mimeType: "audio/webm" },
        { language: "uk" },
        { signal },
      ),
    ).resolves.toEqual({
      outcome: "ok",
      data: {
        text: "привіт",
        durationSec: 1.23,
        model: "whisper-large-v3",
      },
    });

    expect(post).toHaveBeenCalledWith("/api/transcribe", audio, {
      signal,
      headers: { "Content-Type": "audio/webm" },
      query: { language: "uk" },
    });
  });

  it.each([
    [503, "provider_unavailable"],
    [401, "unauthorized"],
    [429, "rate_limited"],
    [413, "payload_too_large"],
    [415, "unsupported_media_type"],
  ] as const)("maps HTTP %s to %s outcome", async (status, outcome) => {
    const post = vi.fn(async () => {
      throw new ApiError({
        kind: "http",
        status,
        message: "boom",
        url: "/api/transcribe",
      });
    });
    const endpoints = createTranscribeEndpoints(httpClient(post));

    await expect(
      endpoints.send({ audio: new ArrayBuffer(1), mimeType: "audio/webm" }),
    ).resolves.toEqual({ outcome, status });
  });

  it("returns generic error outcomes and rethrows non-http failures", async () => {
    const httpPost = vi.fn(async () => {
      throw new ApiError({
        kind: "http",
        status: 500,
        message: "server down",
        url: "/api/transcribe",
      });
    });
    const endpoints = createTranscribeEndpoints(httpClient(httpPost));
    await expect(
      endpoints.send({ audio: new ArrayBuffer(1), mimeType: "audio/webm" }),
    ).resolves.toEqual({
      outcome: "error",
      status: 500,
      message: "server down",
    });

    const networkPost = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(
      createTranscribeEndpoints(httpClient(networkPost)).send({
        audio: new ArrayBuffer(1),
        mimeType: "audio/webm",
      }),
    ).rejects.toThrow("offline");
  });
});
