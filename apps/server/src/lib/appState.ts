/**
 * Process-wide lifecycle flags consumed by health probes.
 *
 * Why a separate module: the `/startupz` (a.k.a. `/health/startup`) probe
 * answers "має платформа вже маршрутизувати трафік сюди?" — це окремий
 * сигнал від liveness (процес не повисне) і readiness (БД відповідає).
 * Kubernetes / Render / Railway використовують startup-probe із більшим
 * `failureThreshold`, щоб не вбити pod під час cold-start. Якщо на старті
 * Sentry-init, env-assert або `app.listen` ще не пройшли — `/startupz`
 * повертає 503 і платформа спокійно чекає.
 *
 * Важливо: state-машина — однонапрямна (`false → true`). Як тільки сервер
 * прийняв перший запит (тобто `app.listen` колбек відпрацював), startup
 * вважається завершеним до самого shutdown-у. Не перевикористовуйте цей
 * прапор для signal-ів типу "graceful drain": для них використайте окремі
 * хук-и у `index.ts` (вони пишуть ‹shuttingDown›, але health-probes не
 * залежать від цього стану — readiness сама-собою обірве трафік через
 * `pool.end()` → DB ping впаде).
 *
 * Initiative: docs/initiatives/archive/_0008-platform-hardening.md § Phase 1.
 */
export interface AppState {
  /** Стартова послідовність (env, Sentry, listen) завершилася успішно. */
  startupComplete: boolean;
}

const state: AppState = {
  startupComplete: false,
};

/**
 * Read-only view на live-state. Хендлери здоров'я просто читають
 * `appState.startupComplete`; модуль експортує `markStartupComplete()` як
 * єдину точку запису, щоб уникнути випадкових `state.startupComplete = false`
 * у викликаючому коді.
 */
export const appState: Readonly<AppState> = state;

/**
 * Викликається з `index.ts` у callback-у `app.listen()` після того, як
 * httpServer зайняв порт. Idempotent — повторний виклик нічого не робить.
 */
export function markStartupComplete(): void {
  state.startupComplete = true;
}

/**
 * Тестова утиліта: повертає state у початковий стан перед прогоном смоків,
 * щоб порядок тестів не впливав на 503/200 у `/startupz`. Production-код її
 * НЕ викликає — startup signal має монотонну природу, і відкат прапора у
 * runtime призведе до false-negative на готовій інстанції.
 */
export function __resetAppStateForTests(): void {
  state.startupComplete = false;
}
