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
 * Дві причини, чому фіча була знята з продукту (2026-08-10) — **обидві
 * закриті 2026-09-13**; лишається лише рішення власника, чи вмикати:
 *
 * 1. **iOS standalone-PWA.** `webkitSpeechRecognition` там існує, але не
 *    працює (WebKit 185448/215884) — це враховано в `useVoiceInput`. Гейт
 *    же стояв ЛИШЕ на Web-Speech-шляху: `isGroqSupported()` перевіряє
 *    тільки `getUserMedia`/`MediaRecorder`, тож на iOS-PWA кнопка
 *    рендерилась і йшла через `/api/transcribe`. Коли сервер віддавав 503
 *    (немає `GROQ_API_KEY`), `onProviderUnavailable` сліпо перемикав на
 *    Web Speech — і кнопка ЗНИКАЛА посеред сесії, бо там
 *    `useVoiceInput.supported === false`, а текст при цьому обіцяв
 *    перемикання, якого не ставалось.
 *    **Закрито:** `VoiceMicButton` тепер перемикається лише коли фолбек
 *    існує, а хук більше не формулює за викликача. Присутність кнопки
 *    не залежить від відповіді сервера; на iOS-PWA голос і далі вимагає
 *    серверного ключа — але це стабільний пояснений стан, а не зниклий
 *    контрол. Регресія закріплена
 *    `VoiceMicButton.providerFallback.test.tsx`.
 *
 * 2. **Вартість.** `/api/transcribe` був найдорожчою поверхнею на
 *    користувача: cap `$1.00/добу/юзер` без plan-gate (роут мав лише
 *    `requireSession`) — до $30/міс на ОДНОГО юзера, і Free, і Pro
 *    однаково, проти виручки Pro ≈$4.52/міс.
 *    **Закрито:** cap опущено до `$0.10/добу/юзер`
 *    (`modules/transcribe/usdCap.ts`), тобто стеля ≈$3/міс — під виручкою
 *    Pro. На роут також додано `requirePlan(pool, "pro")`, але тримає
 *    сьогодні саме cap: при `STRIPE_ENABLED=false` (поточний стан проду)
 *    `requirePlan` — no-op, і гейт озброїться сам, коли білінг увімкнуть.
 *
 * Прибирає рівно UI-поверхню: 5 call-сайтів `VoiceMicButton` + власна
 * кнопка мікрофона у `core/components/ChatInput.tsx` (вона НЕ використовує
 * цей компонент і читає прапорець окремо). Серверний ендпоінт лишається
 * живим: щоб закрити і його, приберіть `GROQ_API_KEY` у Coolify —
 * `requireGroqKey()` почне віддавати 503. Реєстр усіх прапорців і їхніх
 * умов зняття — `docs/engineering/architecture/feature-flags.md`.
 *
 * **Обидві умови зняття виконані, дефолт лишається `false` навмисно.**
 * Це вже не «полагодьте спершу», а питання до власника: вмикати голос
 * усім, чи лишити на прапорці до бенчмарку якості українського
 * розпізнавання. Прибирати прапорець без того рішення не треба.
 */
export function isVoiceInputEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_VOICE_INPUT === "1";
}
