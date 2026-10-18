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

/**
 * `true`, якщо хоч одне джерело зараз тримає незбережений ввід: явна
 * реєстрація (аркуш, діалог, композер) АБО текстове поле на сторінці, у яке
 * людина вже вводила і яке досі не порожнє (див. {@link installTypedInputTracker}).
 */
export function hasDirtyState(): boolean {
  return active.size > 0 || hasTypedInput();
}

// --- Трекер вводу в інлайн-поля -------------------------------------------
//
// AI-CONTEXT: форми, що рендеряться прямо на сторінці (заміри в «Тілі»,
// «Профіль», токен Monobank, підходи активного тренування), не лежать в
// `Sheet`/`Modal`, тож явна реєстрація їх не покриває, а їх більше сорока.
// Замість того щоб чіпати кожну, слухаємо `input` на рівні документа: поле,
// у яке людина вводила і яке досі підключене й не порожнє, вважається
// незбереженим вводом. Свідомо консервативно: збережене, але досі змонтоване
// поле (імʼя в профілі після «Збережено») теж рахується, доки сторінку не
// покинули. Ціна хибного спрацювання — лише відкладений тихий reload (лишається
// ручний тост), ціна хибного пропуску — втрачена форма.

type TypedField = HTMLInputElement | HTMLTextAreaElement;

/** Типи `<input>`, у які вводять текст/число (решта — перемикачі, кнопки, файли). */
const TEXT_INPUT_TYPES = new Set([
  "",
  "text",
  "number",
  "email",
  "tel",
  "url",
  "password",
]);

const typedFields = new Set<TypedField>();
const trackedDocs = new Map<Document, (event: Event) => void>();

function asTrackedField(target: EventTarget | null): TypedField | null {
  const el = target as Element | null;
  const tag = el?.tagName;
  if (tag === "TEXTAREA") {
    const field = el as HTMLTextAreaElement;
    return field.readOnly || field.disabled ? null : field;
  }
  if (tag === "INPUT") {
    const field = el as HTMLInputElement;
    if (field.readOnly || field.disabled) return null;
    // `search` свідомо не рахуємо: пошукові рядки не несуть роботи, яку шкода втратити.
    return TEXT_INPUT_TYPES.has(field.type) ? field : null;
  }
  return null;
}

function hasTypedInput(): boolean {
  for (const field of typedFields) {
    if (!field.isConnected) {
      typedFields.delete(field);
      continue;
    }
    if (field.value.trim() !== "") return true;
  }
  return false;
}

/**
 * Почати стежити за вводом у текстові поля документа (`input` у capture-фазі).
 * Ідемпотентно для одного документа; повертає функцію зняття. Викликає
 * `setupAutoUpdate` — єдиний споживач; сам по собі трекер нічого не робить, доки
 * хтось не спитає `hasDirtyState()`.
 */
export function installTypedInputTracker(doc: Document = document): () => void {
  if (!trackedDocs.has(doc)) {
    const onInput = (event: Event) => {
      const field = asTrackedField(event.target);
      if (field) typedFields.add(field);
    };
    doc.addEventListener("input", onInput, { capture: true, passive: true });
    trackedDocs.set(doc, onInput);
  }
  return () => {
    const handler = trackedDocs.get(doc);
    if (!handler) return;
    doc.removeEventListener("input", handler, { capture: true });
    trackedDocs.delete(doc);
  };
}

/** Лише для тестів: скинути реєстр між кейсами. */
export function resetDirtyStateForTests(): void {
  active.clear();
  typedFields.clear();
  for (const [doc, handler] of trackedDocs) {
    doc.removeEventListener("input", handler, { capture: true });
  }
  trackedDocs.clear();
}
