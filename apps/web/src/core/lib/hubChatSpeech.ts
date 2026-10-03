export const VOICE_KEYWORDS = /голосом|вголос|скажи|озвуч|прочитай/i;

function cleanTextForSpeech(text: string): string {
  return (
    text
      // `✓` (U+2713) — статус-маркер tool-call-ів у транскрипті чату;
      // TTS його не диктує. Раніше тут стояла emoji `✅`, яку 2026-08-21
      // замінено на типографічний символ (див. `useChatSend`).
      .replace(/[✓✔✅]/g, "")
      .replace(/\[.*?\]/g, "")
      .replace(/id:\S+/g, "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/[_*#~`|]/g, "")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

function getUkVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === "uk-UA") ||
    voices.find((v) => v.lang.startsWith("uk")) ||
    voices.find((v) => v.lang.startsWith("ru")) ||
    null
  );
}

// iOS Safari блокує speechSynthesis.speak() якщо виклик не з user gesture.
// Цей трюк "розблоковує" аудіо: пустий utterance з обробника кліку.
export function unlockTTS(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const utter = new SpeechSynthesisUtterance("");
  utter.volume = 0;
  utter.lang = "uk-UA";
  window.speechSynthesis.speak(utter);
}

export function speak(text: string): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const clean = cleanTextForSpeech(text);
  if (!clean) return;

  window.speechSynthesis.cancel();

  const doSpeak = () => {
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = "uk-UA";
    utter.rate = 1.0;
    utter.pitch = 1;
    const voice = getUkVoice();
    if (voice) utter.voice = voice;
    window.speechSynthesis.speak(utter);
  };

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    doSpeak();
  } else {
    window.speechSynthesis.addEventListener("voiceschanged", doSpeak, {
      once: true,
    });
    setTimeout(() => {
      if (window.speechSynthesis.speaking) return;
      doSpeak();
    }, 500);
  }
}

export function stopSpeaking(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}
