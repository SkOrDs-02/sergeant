import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { recordExternalHttpMock } = vi.hoisted(() => ({
  recordExternalHttpMock: vi.fn(),
}));

vi.mock("./externalHttp.js", () => ({
  recordExternalHttp: recordExternalHttpMock,
}));

async function transcribe(
  overrides: Partial<
    Parameters<typeof import("./groq.js").transcribeAudio>[0]
  > = {},
) {
  const { transcribeAudio } = await import("./groq.js");
  return transcribeAudio({
    apiKey: "gsk_test",
    model: "whisper-large-v3-turbo",
    audio: Buffer.from("audio"),
    mimeType: "audio/webm",
    ...overrides,
  });
}

describe("transcribeAudio", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts audio form data and returns trimmed transcript metadata", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ text: "  привіт  ", duration: 12.5 }), {
        status: 200,
      }),
    );

    const result = await transcribe({
      language: "uk",
      prompt: "finance and workouts",
    });

    expect(result).toEqual({ text: "привіт", durationSec: 12.5 });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      expect.objectContaining({
        method: "POST",
        headers: { authorization: "Bearer gsk_test" },
      }),
    );
    const options = fetchMock.mock.calls[0]?.[1] as { body?: FormData };
    const body = options.body;
    expect(body?.get("model")).toBe("whisper-large-v3-turbo");
    expect(body?.get("response_format")).toBe("verbose_json");
    expect(body?.get("language")).toBe("uk");
    expect(body?.get("prompt")).toBe("finance and workouts");
    expect((body?.get("file") as File | null)?.name).toBe("audio.webm");
    expect(recordExternalHttpMock).toHaveBeenCalledWith(
      "groq",
      "ok",
      expect.any(Number),
    );
  });

  it("maps rate limits to a typed GroqTranscribeError", async () => {
    fetchMock.mockResolvedValueOnce(new Response("too many", { status: 429 }));

    await expect(transcribe()).rejects.toMatchObject({
      name: "GroqTranscribeError",
      status: 429,
      outcome: "rate_limited",
      message: expect.stringContaining("too many"),
    });
    expect(recordExternalHttpMock).toHaveBeenCalledWith(
      "groq",
      "rate_limited",
      expect.any(Number),
    );
  });

  it("maps invalid JSON responses to parse_error", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{", { status: 200 }));

    await expect(transcribe()).rejects.toMatchObject({
      name: "GroqTranscribeError",
      status: 502,
      outcome: "parse_error",
    });
    expect(recordExternalHttpMock).toHaveBeenCalledWith(
      "groq",
      "parse_error",
      expect.any(Number),
    );
  });

  it("maps aborted fetches to timeout", async () => {
    const abortErr = Object.assign(new Error("aborted"), {
      name: "AbortError",
    });
    fetchMock.mockRejectedValueOnce(abortErr);

    await expect(transcribe({ timeoutMs: 50 })).rejects.toMatchObject({
      name: "GroqTranscribeError",
      status: 504,
      outcome: "timeout",
    });
    expect(recordExternalHttpMock).toHaveBeenCalledWith(
      "groq",
      "timeout",
      expect.any(Number),
    );
  });
});
