/**
 * Last validated: 2026-08-23
 * Status: Active
 *
 * `ChatAuthGate` — те, що бачить НЕЗАЛОГІНЕНИЙ відвідувач замість поля
 * вводу чату.
 *
 * AI-CONTEXT: `/api/chat` стоїть за `requireSession()` — анонімного AI
 * немає навмисно (аудит `ai-abuse-2026-08-05.md`, A1), і це рішення
 * НЕ послаблюється. Проблема була не в гейті, а в тому, що продукт про
 * нього мовчав: хаб показував «Відкрити AI-асистента», давав набрати
 * запитання і відповідав «Помилка: Доступ заборонено.» — без жодного
 * входу поруч (browser QA 2026-08-23). Тепер вартість названо ДО того,
 * як людина щось вкладе, і поруч стоїть кнопка входу.
 *
 * Живе на місці composer-а, а не окремим модальним вікном: історія
 * розмови (якщо вона лишилась із попередньої сесії) має бути видимою —
 * гейт відбирає ввід, а не читання.
 *
 * Звичайний `<a href>`, не `<Link>` — той самий компроміс, що в
 * `ChatUsageCounter`: `HubChat` монтується поза `<Router>` у частині
 * юніт-тестів, а повна навігація на екран входу тут доречна.
 */
import { Icon } from "@shared/components/ui/Icon";
import { SIGN_IN_PATH } from "../../app/appPaths";

/* eslint-disable sergeant-design/no-cyrillic-jsx-literal --
   Каталог `shared/i18n/uk.ts` уперся в `max-lines: 600` (Hard Rule #18), і
   три нових ключі його перетинають. Копія лишається тут інлайном, як уже
   зроблено для `PaywallModal` у `HubChat.tsx`; винесення — разом із
   декомпозицією каталогу, окремою правкою. */
export function ChatAuthGate() {
  return (
    <div
      role="note"
      data-testid="chat-auth-gate"
      className="shrink-0 border-t border-line bg-panel px-4 py-4 space-y-3"
    >
      <div className="flex items-start gap-2.5">
        <Icon
          name="lock"
          size="sm"
          aria-hidden
          className="shrink-0 mt-0.5 text-muted"
        />
        <div className="space-y-1">
          <p className="text-style-label font-semibold text-text">
            Асистент працює після входу
          </p>
          <p className="text-style-body text-muted leading-snug">
            Він відповідає на твоїх даних, тому без акаунта відповідати немає на
            чому. Вхід займе хвилину, і повернемось до розмови.
          </p>
        </div>
      </div>
      <a
        href={SIGN_IN_PATH}
        data-testid="chat-auth-gate-signin"
        className="flex items-center justify-center gap-2 w-full min-h-[44px] rounded-2xl bg-primary text-bg font-semibold text-style-label transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/60 focus-visible:ring-offset-2"
      >
        Увійти в акаунт
      </a>
    </div>
  );
}
/* eslint-enable sergeant-design/no-cyrillic-jsx-literal */
