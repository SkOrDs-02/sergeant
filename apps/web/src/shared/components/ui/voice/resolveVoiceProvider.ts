export type VoiceProvider = "auto" | "groq" | "webspeech";

// `VITE_VOICE_PROVIDER` env override was never wired in any environment
// (.env.example, vercel.json, vite.config) — always "auto". Return type
// stays the full union so `VoiceMicButton`'s groq/webspeech auto-detect
// comparisons against `"groq"`/`"webspeech"` keep typechecking.
export function resolveConfiguredProvider(): VoiceProvider {
  return "auto";
}

/**
 * Kill-switch голосового вводу. **Вимкнено за замовчуванням** — щоб
 * увімкнути, постав `VITE_ENABLE_VOICE_INPUT=1`.
 *
 * Дві причини, чому фіча знята з продукту, а не полагоджена (2026-08-10):
 *
 * 1. **iOS standalone-PWA.** `webkitSpeechRecognition` там існує, але не
 *    працює (WebKit 185448/215884) — це вже враховано в `useVoiceInput`.
 *    Але гейт стоїть ЛИШЕ на Web-Speech-шляху: `isGroqSupported()`
 *    перевіряє тільки наявність `getUserMedia`/`MediaRecorder`, тож на
 *    iOS-PWA кнопка все одно рендериться і йде через `/api/transcribe`.
 *    Коли сервер віддає 503 (немає `GROQ_API_KEY`), `onProviderUnavailable`
 *    перемикає на Web Speech — і саме там кнопка ЗНИКАЄ посеред сесії,
 *    бо на iOS-PWA `useVoiceInput.supported === false`. Тобто поведінка
 *    залежить від наявності серверного ключа й платформи одночасно.
 *
 * 2. **Вартість.** `/api/transcribe` — найдорожча поверхня на користувача:
 *    cap `$1.00/добу/юзер` (`modules/transcribe/usdCap.ts`) **без
 *    plan-gate** (роут має лише `requireSession`). Це до $30/міс на
 *    ОДНОГО юзера — і Free, і Pro однаково — проти виручки Pro ≈$4.52/міс.
 *
 * Прибирає рівно UI-поверхню: 5 call-сайтів `VoiceMicButton` + власна
 * кнопка мікрофона у `core/components/ChatInput.tsx` (вона НЕ використовує
 * цей компонент і читає прапорець окремо). Серверний ендпоінт лишається
 * живим: щоб закрити і його, приберіть `GROQ_API_KEY` у Coolify —
 * `requireGroqKey()` почне віддавати 503.
 *
 * **Умова зняття (обидві мають виконатись):**
 *   1. Полагоджено гейт iOS standalone-PWA на Groq-шляху — щоб «підтримка
 *      голосу» перестала залежати від наявності серверного ключа.
 *   2. Вартість `/api/transcribe` приведена під виручку: plan-gate на роуті
 *      або нижчий `TRANSCRIBE_USD_CAP_DAILY_MICROS`.
 * Доки хоч одна не виконана — прапорець лишається, і це не «тимчасово
 * забули», а свідомий стан. Реєстр усіх прапорців і їхніх умов зняття —
 * `docs/02-engineering/architecture/feature-flags.md`.
 */
export function isVoiceInputEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_VOICE_INPUT === "1";
}
