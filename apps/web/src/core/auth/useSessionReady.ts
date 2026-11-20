import { useAuthOptional } from "./AuthContext";

/**
 * Чи можна слати запити, що вимагають сесії.
 *
 * `true` лише для ПІДТВЕРДЖЕНОЇ сесії (`authenticated`, включно з
 * офлайн-ідентичністю). Перевірка `status !== "unauthenticated"` пропускала
 * фазу `loading`, і анонім збирав 401 на `billing/status`, `chat/usage`,
 * `mono`- і `silpo`-`sync-state` на кожному завантаженні (прогін
 * `full-2026-11-19`, FULL-20261119-PERF-1: 58 × 401 на 80 прод-сторінок).
 * Ціна — залогінений чекає `/me` перед цими запитами. Поза `AuthProvider`
 * (голі юніт-тести) — `true`, попередня поведінка.
 *
 * Окремий файл поверх `useAuthOptional`, а не експорт `AuthContext.tsx`:
 * тести мокають `AuthContext` лише з `useAuthOptional`, і хук має працювати
 * з такими моками без змін.
 */
export function useSessionReady(): boolean {
  const auth = useAuthOptional();
  return auth ? auth.status === "authenticated" : true;
}
