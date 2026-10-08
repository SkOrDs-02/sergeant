/**
 * Легкий реєстр «брудного» стану вкладки: відкриті `Sheet`/`Modal`/діалоги з
 * полями вводу та непорожній композер HubChat.
 *
 * Framework-agnostic (без React), щоб app-shell-код, який живе поза
 * компонентами (`core/app/autoUpdate.ts`), міг спитати «чи є що втрачати»
 * без пропсів і контексту. Той самий патерн, що `core/hub/streamingStore.ts`.
 *
 * AI-CONTEXT: споживач — тихий idle-reload сервіс-воркера (data-45,
 * `docs/engineering/web/service-worker.md` § Шар 3). Реєстр НЕ зберігає
 * чернеток і нічого не знає про вміст форм — лише лічить, скільки джерел
 * зараз тримають незбережений ввід. Реєструйся через `useRegisterDirtyState`
 * (`@shared/hooks/useRegisterDirtyState`), а не вручну.
 */

let nextToken = 0;
const active = new Set<number>();

/**
 * Позначити вкладку «брудною». Повертає функцію зняття; повторний виклик
 * зняття безпечний (ідемпотентний), тож React-cleanup можна не обережничати.
 */
export function registerDirtyState(): () => void {
  nextToken += 1;
  const token = nextToken;
  active.add(token);
  return () => {
    active.delete(token);
  };
}

/** `true`, якщо хоч одне джерело зараз тримає незбережений ввід. */
export function hasDirtyState(): boolean {
  return active.size > 0;
}

/** Лише для тестів: скинути реєстр між кейсами. */
export function resetDirtyStateForTests(): void {
  active.clear();
}
