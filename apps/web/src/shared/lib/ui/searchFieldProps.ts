/**
 * The exact attribute set below, typed literally.
 *
 * Deliberately NOT `InputHTMLAttributes<HTMLInputElement>`: that type also
 * carries `size?: number`, while our design-system `<Input>` re-declares
 * `size` as `"sm" | "md" | "lg"`. Spreading the wide type into `<Input>`
 * therefore fails to typecheck on a prop this bundle never sets. A literal
 * interface keeps the spread assignable to both a raw `<input>` and `<Input>`.
 */
export interface SearchFieldAutofillGuard {
  autoComplete: "off";
  autoCorrect: "off";
  autoCapitalize: "off";
  spellCheck: false;
  "data-1p-ignore": "";
  "data-lpignore": "true";
  "data-bwignore": "true";
  "data-form-type": "other";
}

export interface SearchFieldProps extends SearchFieldAutofillGuard {
  name: string;
}

/**
 * Canonical attribute bundle that keeps browser password managers OFF our
 * search fields.
 *
 * # Баг, який це лікує
 *
 * Тестерське відео 2026-08-10: у Chrome поле «Пошук налаштувань…» на хабі
 * показувало дропдаун менеджера паролів із збереженим акаунтом
 * (`…@gmail.com` + маскований пароль + «Керувати паролями…»), автозаповнювало
 * туди e-mail і перезаповнювало його назад щоразу після кліку по хрестику —
 * тобто значення «не давало нормально видалити».
 *
 * # Чому Chrome так робить
 *
 * Chromium визначає тип поля шаром за шаром: спершу читає `autocomplete`, і
 * лише коли атрибута немає — падає в евристики по `name`/`id`, найближчому
 * `<label>` і `placeholder`. Наші пошукові поля не мали ні `name`, ні `id`,
 * ні `autocomplete`, а весь текстовий контекст — кирилиця, під яку англомовні
 * патерни Chromium не матчаться. Поле лишалося некласифікованим, і менеджер
 * паролів забирав його як кандидата в username-поле форми входу.
 *
 * Тому фікс дво-шаровий, а не «просто `autocomplete="off"`»:
 *
 * 1. `autoComplete: "off"` — прямий сигнал найвищого пріоритету. Chrome
 *    ігнорує `off` лише для `type="password"`; для решти полів поважає.
 * 2. `name` виду `*-search` — щоб евристика другого шару, якщо до неї дійде,
 *    класифікувала поле як пошукове (`SEARCH_TERM`), а не як username.
 *    Саме тому `searchFieldProps()` вимагає імʼя аргументом: bundle без
 *    `name` лікує лише половину причини.
 * 3. `data-*` opt-out-и — сторонні менеджери паролів (1Password, LastPass,
 *    Bitwarden, Dashlane) не читають `autocomplete`, у кожного свій атрибут.
 *
 * `autoCorrect` / `autoCapitalize` / `spellCheck` тут же, бо пошуковий запит —
 * не проза: iOS не має капіталізувати перше слово запиту, а Chrome —
 * підкреслювати червоним валідні назви вправ і категорій.
 *
 * # Як користуватись
 *
 * Сирий `<input>`:
 *
 * ```tsx
 * <input type="search" {...searchFieldProps("settings-search")} … />
 * ```
 *
 * Спільний `<Input>` (`@shared/components/ui/Input`) з `type="search"`
 * підмішує цей bundle САМ — там нічого спредити не треба. Явний спред
 * потрібен лише пошуковим `<Input>` БЕЗ `type="search"` (їх у репо кілька:
 * вони рендерять власний хрестик, а `type="search"` додав би ще й нативний
 * `::-webkit-search-cancel-button` поруч — регресія V-16 з аудиту
 * 2026-08-08).
 *
 * @last-validated 2026-08-10
 */
const SEARCH_FIELD_AUTOFILL_GUARD: SearchFieldAutofillGuard = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
  // 1Password: присутності атрибута достатньо, значення не читається.
  "data-1p-ignore": "",
  // LastPass.
  "data-lpignore": "true",
  // Bitwarden.
  "data-bwignore": "true",
  // Dashlane — «це поле не частина форми, яку варто заповнювати».
  "data-form-type": "other",
};

/**
 * Attribute bundle for a search field, ready to spread onto an `<input>`.
 *
 * @param name Значення атрибута `name`. Має містити `search` (або `query`),
 *   щоб евристика Chromium читала поле як пошукове. Тримай його унікальним
 *   у межах екрана — напр. `"settings-search"`, `"hub-search"`.
 */
export function searchFieldProps(
  name: `${string}search` | `${string}query`,
): SearchFieldProps {
  return { name, ...SEARCH_FIELD_AUTOFILL_GUARD };
}

/**
 * Same guard without `name` — for the shared `Input` component, which mixes
 * it in for `type="search"` and must not clobber a caller-supplied `name`
 * (react-hook-form and friends bind fields by that attribute).
 */
export const searchFieldAutofillGuard: SearchFieldAutofillGuard =
  SEARCH_FIELD_AUTOFILL_GUARD;
