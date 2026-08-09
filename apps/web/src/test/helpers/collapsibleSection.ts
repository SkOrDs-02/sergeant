/**
 * Спільний хелпер для тестів дисклоужерів (`SettingsGroup`,
 * `CollapsibleSection`), які після L-7 фіксу (аудит Профілю і Налаштувань,
 * 2026-08-08 — `docs/90-work/audits/2026-08-08-profile-settings-deep-audit.md`)
 * ховають згорнутий вміст через `inert` + `aria-hidden="true"`.
 *
 * ЧОМУ це потрібно тестам: `inert`/`aria-hidden` — правильна продуктова
 * поведінка (звичайний юзер теж не може Tab-нути чи прочитати скрінрідером
 * контроли всередині згорнутої секції), але вона ж означає, що
 * role-based query (`getByRole("switch"/"checkbox"/"dialog"/"alert"/…)`)
 * більше не бачить нічого всередині згорнутого контейнера — dom-testing-
 * library виключає `aria-hidden`-піддерева з обчислення ролей. Тест має
 * робити те саме, що зробила б людина: спершу розкрити секцію, а вже
 * потім шукати контрол.
 *
 * Обидва компоненти (`SettingsGroup` і `CollapsibleSection`) малюють
 * канонічний disclosure-патерн — `<button aria-expanded={open} onClick=
 * {toggle}>`. Тому тригер шукаємо за атрибутом `aria-expanded="false"`,
 * а НЕ за текстом заголовка: заголовки різняться по секціях і міняються
 * з часом, атрибут ролі — ні.
 */
import { fireEvent, render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";

const COLLAPSED_TRIGGER_SELECTOR = 'button[aria-expanded="false"]';

/**
 * Клікає по КОЖНОМУ тригеру `aria-expanded="false"` у межах `container`,
 * розкриваючи всі згорнуті дисклоужери одразу (наприклад `ProfilePage`, де
 * кілька незалежних `CollapsibleSection` згорнуті за замовчуванням, і тест
 * може потребувати контрол із будь-якої з них). Ітеративно, а не
 * `querySelectorAll` одним проходом: розкриття однієї секції ре-рендерить
 * дерево, і `querySelectorAll`, знятий один раз ДО кліків, тримав би
 * застарілі посилання.
 *
 * Обмеження в 20 ітерацій — запобіжник від нескінченного циклу, якщо клік
 * з якоїсь причини не знімає `aria-expanded`. Але сам запобіжник не повинен
 * мовчати: якщо після 20 кліків тригер і далі лишається в DOM, це означає
 * або (а) клік не знімає `aria-expanded` (реальний баг компонента чи
 * тест-дабл), або (б) згорнутих дисклоужерів справді більше 20 (ліміт
 * застарів). Мовчазний `return` після вичерпання циклу замаскував би обидва
 * випадки — виклик-сайт пішов би далі з неповним сетапом і впав би десь
 * нижче на відсутньому контролі, з незрозумілою на перший погляд помилкою.
 * Тому перевіряємо стан ПІСЛЯ циклу і кидаємо описову помилку явно тут.
 */
export function expandAllCollapsedSections(
  container: ParentNode = document.body,
): void {
  for (let guard = 0; guard < 20; guard += 1) {
    const trigger = container.querySelector<HTMLButtonElement>(
      COLLAPSED_TRIGGER_SELECTOR,
    );
    if (!trigger) return;
    fireEvent.click(trigger);
  }
  if (container.querySelector(COLLAPSED_TRIGGER_SELECTOR)) {
    throw new Error(
      `expandAllCollapsedSections: після 20 кліків лишився щонайменше ` +
        `один тригер ${COLLAPSED_TRIGGER_SELECTOR}. Або клік не знімає ` +
        `aria-expanded (перевір компонент), або згорнутих секцій справді ` +
        `більше 20 (підніми ліміт ітерацій).`,
    );
  }
}

/**
 * Розкриває РІВНО ОДИН тригер — той, що є єдиним `aria-expanded="false"` у
 * `container`. Кидає описову помилку, якщо тригерів 0 чи більше 1, щоб
 * тест не тихо клікав не туди (і щоб було видно на fail-і, що очікування
 * "рівно одна секція" порушено — наприклад компонент почав рендерити другу
 * згорнуту секцію).
 */
export function expandSingleCollapsedSection(
  container: ParentNode = document.body,
): void {
  const triggers = container.querySelectorAll<HTMLButtonElement>(
    COLLAPSED_TRIGGER_SELECTOR,
  );
  // Одна перевірка замість пари «довжина + non-null assertion»: під
  // `noUncheckedIndexedAccess` індексний доступ дає `| undefined`, і `!`
  // тут ловився б лінтом (`no-non-null-assertion`, warn === fail під
  // `--max-warnings=0` у lint-staged).
  const [trigger, ...rest] = triggers;
  if (!trigger || rest.length > 0) {
    throw new Error(
      `expandSingleCollapsedSection: очікував рівно 1 тригер ` +
        `${COLLAPSED_TRIGGER_SELECTOR}, знайдено ${triggers.length}.`,
    );
  }
  fireEvent.click(trigger);
}

/**
 * Рендерить `ui` і одразу розкриває його зовнішній `SettingsGroup` —
 * канонічний хелпер для тестів секцій `apps/web/src/core/settings/**`, що
 * монтують секцію ОКРЕМО (без `HubSettingsPage`), тож зовнішня
 * `SettingsGroup` завжди згорнута за замовчуванням (`defaultOpen={false}`
 * без `SettingsGroupDefaultOpenContext`-провайдера).
 *
 * `ui` може бути вже обгорнутий власними провайдерами виклику
 * (`MemoryRouter`, `QueryClientProvider`) — хелпер лише рендерить і
 * розкриває, без думки про те, що саме всередині.
 */
export function renderSettingsSection(ui: ReactElement): RenderResult {
  const view = render(ui);
  expandSingleCollapsedSection(view.container);
  return view;
}
