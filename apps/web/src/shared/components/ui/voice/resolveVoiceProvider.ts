export type VoiceProvider = "auto" | "groq" | "webspeech";

export function resolveConfiguredProvider(): VoiceProvider {
  const raw =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_VOICE_PROVIDER
      ? String(import.meta.env.VITE_VOICE_PROVIDER)
          .trim()
          .toLowerCase()
      : "";
  if (raw === "groq" || raw === "webspeech" || raw === "auto") return raw;
  return "auto";
}
