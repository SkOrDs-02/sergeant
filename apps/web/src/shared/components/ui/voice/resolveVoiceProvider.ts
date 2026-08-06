export type VoiceProvider = "auto" | "groq" | "webspeech";

// `VITE_VOICE_PROVIDER` env override was never wired in any environment
// (.env.example, vercel.json, vite.config) — always "auto". Return type
// stays the full union so `VoiceMicButton`'s groq/webspeech auto-detect
// comparisons against `"groq"`/`"webspeech"` keep typechecking.
export function resolveConfiguredProvider(): VoiceProvider {
  return "auto";
}
