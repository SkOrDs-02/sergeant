<!-- Lifecycle: Active | Owner: product | Added: 2026-09-17 | Next review: 2027-03-17 -->

# Дизайн-контракт: HubChat

> **Last touched:** 2026-09-17 by @claude. **Next review:** 2027-03-17.
> **Status:** Active — контракт as-built: описує `core/hub/HubChatOverlay.tsx`, `HubChatSheet.tsx`, `HubChat.tsx`, `useHubChatOverlay.ts`, `core/hub/chat/{HubChatHeader,HubChatBody,HubChatComposer,ChatEmpty,ChatUsageCounter,ChatAuthGate,DestructiveConfirmModal}.tsx`, `chat/{useChatSessions,useChatSend,useDestructiveConfirm}.ts`, `HubChatHistoryDrawer.tsx`, `core/components/{ChatInput,ChatQuickActions,ChatMessage}.tsx`, `chat/components/DataResultCard.tsx` і `shared/components/ui/Sheet.tsx` станом на 2026-09-17 (README дизайн-папки 2026-09-16: HubChat серед поверхонь «без контракту, пишуться за потребою»). Розбіжності з каноном код НЕ виправляє — вони позначені **[борг]** із файлом і рядком; відкритих боргів дванадцять.

Поверхня, на якій продукт розмовляє: аркуш AI-чату над будь-яким
маршрутом хаба (`HubChatOverlay` → лінивий `HubChatSheet` → лінивий
`HubChat`), композер зі швидкими сценаріями, список бесід, гейт входу для
гостя, лічильник денної квоти й paywall ліміту. До 2026-09-17 ця поверхня
не мала дизайн-контракту: стиль тримався на «нейтральний stone-бренд без
модульного акценту та компоненти хаба».

## Проблема

HubChat — найлюдніша поверхня AI-шару і єдина, де користувач одночасно
бачить бренд, чотири модульні акценти (підказки й картки, що називають
модуль), семантичні стани (офлайн, помилка, ліміт) і три накладені діалоги
(аркуш, список бесід, підтвердження). Без контракту кожен наступний стан
копіював найближчого сусіда, і сусіди розійшлися: шапка й композер
складені з ручних `<button>` з власними фокус-рамками, поле вводу носить
фокус-рамку Фініка, іконки композера — інлайнові `<svg>` повз `Icon`, а
копі розкидане між `uk.core.ts`, `uk.ts`, `hubChatUtils.ts` і літералами
в п'яти JSX-файлах. Агент, що пише новий стан чату, не мав чого перевірити
на рев'ю.

## Мета

Один документ, за яким (а) рев'ю перевіряє PR у `core/hub/chat/**` і
`core/components/Chat*` на палітру, примітиви, стани й тон, (б) агент
верстає новий стан чату без здогадок і не повертає важке на критичний
шлях. Контракт as-built: кожне правило нижче або вже так у коді, або
позначене **[борг]** із файлом і рядком.

## Продуктові рішення, на які спирається контракт

- **D5 (Phase 7, 2026-05-22): чат — аркуш над маршрутом, не маршрут.**
  Стан «відкрито» живе в памʼяті провайдера (`useHubChatOverlay.ts`,
  `useState` у `useHubChatOverlayState`), а `/chat` лишається змонтованим
  для диплінків, пушів і `navigate('/chat?q=…')` (`HubChatPage.tsx`).
  Навігація з-під аркуша закриває його ефектом маршруту
  (`HubChatOverlay.tsx:95-123`).
- **Чат — допоміжний канал, не головний інтерфейс** ([`hub-coach.md`
  § 1](../../../product/modules/hub-coach.md), дослівно «Допоміжний
  канал»). Основний UX — модулі; покриття інструментами вибіркове.
- **«?» веде в каталог і повертає чат назад** (звіт власника
  2026-09-15). `/help` і кнопка «?» композера відкривають `/assistant`
  (`useChatSend.ts:283-301`, `HubChatOverlay.tsx:71-74`); повернення на
  той самий шлях піднімає чат знову, явне закриття намір скасовує
  (`HubChatOverlay.tsx:59-66, 104-122`). Це і є причина, чому оболонка
  eager: ref наміру не має обнулятись.
- **`Cmd+K` має одного власника — `RootLayout`** (рішення власника
  2026-09-16, варіант A): він відкриває пошук хаба або, з прапорцем
  `hub_command_palette`, палітру (`RootLayout.tsx:350-365`,
  `useHubKeyboardShortcuts.ts:7-13`). Чат клавіші не слухає; його
  відкриває `Cmd+/` (`useHubKeyboardShortcuts.ts:122-127` →
  `RootLayout.tsx:406`).
- **Квота Free — 5 AI-запитів на добу, Pro — без ліміту**
  ([ADR-0085](../../../governance/adr/0085-free-ai-quota-five-per-day.md)).
  Число знає лише сервер: клієнт читає `GET /api/chat/usage`
  (`chatKeys.usage`) і для пейволу, і для пігулки (`useChatSend.ts:167-180`,
  `ChatUsageCounter.tsx:25-31`); власного лічильника немає. Хід з
  інструментом — один запит (round-trip-квиток, канон § 9), тож копія
  «N з 5 запитів» буквальна.
- **Анонімного AI немає** ([ADR-0086](../../../governance/adr/0086-no-anonymous-ai-sign-in-required.md)):
  гість бачить `ChatAuthGate` замість поля вводу, історію читати може
  (`HubChat.tsx:87-93, 181-183`; `ChatAuthGate.tsx:5-19`).
- **Деструктивне — тільки з підтвердженням** (канон § 8, рішення
  founder-а 2026-07-25 № 8): діалог перед виконанням, називає інструменти
  поіменно, відмова скасовує весь батч без другого запиту до моделі
  (`useChatSend.ts:464-503`, `useDestructiveConfirm.ts`).
- **Розкриття «це AI» безумовне** (EU AI Act ст. 50(1)): рядок стоїть над
  стрічкою незалежно від `isEmpty` (`HubChatBody.tsx:116-140`).

## Палітра і тон поверхні

HubChat — **hub-chrome, нейтральний stone-бренд**
([`module-accent.md` § Правила, п. 4](../module-accent.md)): жодного
`bg-module-accent*`, бо ambient-модуля немає. Модульний колір з'являється
лише там, де елемент **називає модуль** — підказка порожнього стану,
лінк-чип під карткою.

| Елемент                     | Канон                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Аркуш                       | `Sheet variant="glass" fullScreen hideHeader panelClassName="bg-bg!" bodyClassName="!p-0 !overflow-hidden flex flex-col"` (`HubChatSheet.tsx:51-76`). Скло навмисно погашено: на повний екран крізь нього нічого не просвічує, а ряд із ручкою читався як світла смужка над шапкою. Ручка `w-12 h-sheet-handle bg-line/70` лишається ціллю свайпу (`Sheet.tsx:330-341`); скрим `bg-black/40 backdrop-blur-sm` — справжній `<button aria-label>` (`Sheet.tsx:291-296`). |
| Регіон чату                 | `role="region" aria-labelledby="hub-chat-title" aria-describedby="hub-chat-privacy"`, `bg-bg` (`HubChat.tsx:150-155`). Один скрол-контейнер — `HubChatBody` (`overflow-y-auto overscroll-none touch-pan-y px-4 py-3 space-y-3`, `HubChatBody.tsx:92`).                                                                                                                                                                                                                 |
| Шапка                       | `px-3 pb-3 border-b border-line`; аватар `w-9 h-9 rounded-xl bg-brand-500/10` + `Icon name="sergeant" size="md" text-brand-500`; крапка статусу `bg-brand-500` (готово) / `bg-warning motion-safe:animate-pulse` (готую) / `bg-line` (очікую) (`HubChatHeader.tsx:51-87`). Заголовок `shrink-0`, дефіцит ширини йде правому кластеру (`:88-92, 161-164`).                                                                                                              |
| Пігулка «Нова»              | `bg-brand-soft text-brand-strong border-brand-soft-border/50 hover:bg-brand-soft-hover rounded-xl` (`HubChatHeader.tsx:170`); та сама пігулка на всю ширину в списку бесід (`HubChatHistoryDrawer.tsx:215`).                                                                                                                                                                                                                                                           |
| Бульбашка асистента         | `bg-panel border border-line rounded-2xl rounded-bl-sm text-style-body` + аватар `h-6 w-6 rounded-full bg-brand-500/10 text-brand-500` (`ChatMessage.tsx:224-256`).                                                                                                                                                                                                                                                                                                    |
| Бульбашка користувача       | `bg-primary text-bg rounded-2xl rounded-br-sm whitespace-pre-wrap`, `max-w-[82%]` (`ChatMessage.tsx:248-253`).                                                                                                                                                                                                                                                                                                                                                         |
| Бульбашка збою              | `role="alert"`, `bg-danger/10 border-danger/30 text-text`, без кнопки «Озвучити» (`ChatMessage.tsx:213-215, 246-250, 277`).                                                                                                                                                                                                                                                                                                                                            |
| Картка дії (`ActionCard`)   | `rounded-xl bg-brand-500/5 border-brand-500/30`, іконка `text-brand-500`; провал — `bg-warning/10 border-warning/30 text-warning` (`ChatMessage.tsx:111-125`). `DataResultCard` — той самий brand, mini-bar `bg-brand-500/70` на `bg-brand-500/10` (`DataResultCard.tsx:242-246, 271-275`), модульного акценту свідомо немає (`:22-24`).                                                                                                                               |
| Картка незворотної дії      | `ConfirmCard`: `border-danger/30 bg-danger/5`, шапка `text-danger-strong dark:text-danger`, бейдж «Виконано» `bg-danger/10` (`ChatMessage.tsx:166-207`).                                                                                                                                                                                                                                                                                                               |
| Лінк-чип модуля під карткою | Soft-пара модуля, який картка називає: `bg-<m>-soft text-<m>-soft-fg rounded-full` (`ChatMessage.tsx:40-63`). Класи статичні, не `bg-${module}`; `hub` навмисно відсутній — чат уже в хабі.                                                                                                                                                                                                                                                                            |
| Порожній стан               | `text-style-title` + `text-style-body text-muted`, сітка `grid-cols-1 sm:grid-cols-2` чипів `rounded-xl bg-panel border-line text-style-label`; іконка чипа — колір модуля (`text-finyk` / `text-fizruk` / `text-nutrition` / `text-routine`) (`ChatEmpty.tsx:42-67, 136-166`). Чотири модулі поруч, `core/**` — це законно за `module-accent.md § НЕ мігруйте`.                                                                                                       |
| Композер                    | `border-t border-line/60 bg-panel/40 backdrop-blur-sm` — окремий «трей», не вільні контроли над стрічкою (`HubChatComposer.tsx:45`). Поле `bg-panel border-line rounded-2xl px-4 py-3 text-style-body placeholder:text-subtle` (`ChatInput.tsx:124`); «Надіслати» `bg-primary text-bg rounded-full w-11 h-11` (`:197`).                                                                                                                                                |
| Швидкі сценарії             | Чипи `min-h-10 rounded-full text-style-label`; активний модуль — `bg-brand-500/10 border-brand-500/40 text-brand-600`; hub-подібні (`cross`/`analytics`/`utility`/`memory`) — `text-text`, решта `text-subtle` (`ChatQuickActions.tsx:45-71`). До 6 зверху + «Ще» inline, без модалки (`:1-9, 41`).                                                                                                                                                                    |
| Голос                       | Мікрофон у записі — `bg-danger-strong text-white motion-safe:animate-pulse`; «Зупинити озвучення» — `bg-warning/15 border-warning text-warning-strong dark:text-warning` (`ChatInput.tsx:145, 165-170`).                                                                                                                                                                                                                                                               |
| Офлайн-плашка               | `role="status"`, `bg-warning/10 border-warning/30 rounded-xl text-style-caption text-warning-strong dark:text-warning` між чипами і полем (`HubChatComposer.tsx:60-67`).                                                                                                                                                                                                                                                                                               |
| Лічильник квоти             | `rounded-full text-style-caption font-semibold`; звичайний `bg-panelHi text-muted`, вичерпаний `bg-warning-soft text-warning-strong dark:text-warning` з підкресленим лінком на `/pricing` (`ChatUsageCounter.tsx:44-60`). `min-w-0 truncate` — пігулка віддає ширину першою.                                                                                                                                                                                          |
| Гейт входу                  | `role="note"`, `border-t border-line bg-panel px-4 py-4`, `Icon name="lock" text-muted`, CTA `bg-primary text-bg rounded-2xl min-h-[44px]` (`ChatAuthGate.tsx:34-63`).                                                                                                                                                                                                                                                                                                 |
| Список бесід                | `fixed inset-0` діалог, панель `w-[88%] max-w-sm bg-bg border-r border-line shadow-float`, скрим `bg-black/50 backdrop-blur-sm` (`HubChatHistoryDrawer.tsx:160-175`). Активна бесіда — `bg-brand-soft border-brand-soft-border/60` + бренд-риска `w-1 bg-brand-500` зліва, бо в темній темі сам тон губиться (`:260-275`). Групи `Сьогодні / Вчора / Раніше` — `text-style-caption uppercase tracking-wide text-subtle` (`:246`).                                      |
| Підтвердження незворотного  | `ConfirmDialog danger` (`DestructiveConfirmModal.tsx:51-85`): список інструментів `text-style-body`, підсумок аргументів `text-style-caption text-content-secondary` одним рядком, без таблиць (`:17-22, 59-75`).                                                                                                                                                                                                                                                      |
| `PaywallModal`              | Лише бренд, за [контрактом pricing/paywall](./2026-09-16-pricing-paywall-design.md); чат передає `surface="ai_chat_limit"` і власні `title` / `description` (`HubChat.tsx:219-232`).                                                                                                                                                                                                                                                                                   |
| Типографіка                 | `text-style-title` — заголовок шапки й порожнього стану; `body` — бульбашки, поле, опис; `label` — чипи, кнопки, назви бесід; `caption` — статуси, розкриття, підсумки. Нижче 12px нічого (`text-2xs` / `text-[<12px]` у файлах поверхні відсутні).                                                                                                                                                                                                                    |
| Motion                      | `motion-safe:animate-pulse` лише на «готую контекст», мікрофоні й озвученні; `TypingIndicator` — три крапки `motion-safe:animate-bounce`, під `prefers-reduced-motion` замість них статичне «Думаю…» (`ChatMessage.tsx:338-357`). Аркуш — `animate-slide-up`, список — `animate-fade-in`. Без конфеті, без свічення.                                                                                                                                                   |
| Гліфи                       | `Icon` з каталогу (`sergeant`, `plus`, `close`, `list`, `lock`, `trash`, `chevron-*`, іконки чипів). Емодзі немає; «✓» у текстовому фолбеку — U+2713, типографічний символ, не емодзі (`useChatSend.ts:582-589`).                                                                                                                                                                                                                                                      |

Розбіжності з палітрою й гліфами:

- **[борг]** `ChatInput.tsx:124` — поле вводу носить `input-focus-finyk`
  (фокус-рамка `ring-finyk/25` + `border-finyk/60`,
  `styles/utilities.css:53-57`) у hub-chrome, де ambient-модуля немає.
  Нейтральна пара — `input-focus` (`utilities.css:42-51`).
- **[борг]** `ChatMessage.tsx:82` — `focus-visible:ring-brand-500/40` на
  лінк-чипі модуля замість семантичного `ring-focus/45`
  ([`04-components § Button`](../design-system/04-components.md): `/45` —
  єдина канонічна непрозорість). Метрика `offCanonRingOpacity` бачить
  лише токен `ring-focus`, тож цього не ловить.
- **[борг]** інлайнові `<svg>` повз `Icon`: `ChatInput.tsx:104-119`
  («?»), `:149-159` (стоп), `:174-190` (мікрофон), `:201-215`
  (надіслати); `ChatMessage.tsx:177-191` (кошик у `ConfirmCard`),
  `:229-243` і `:323-336` (аватар бота), `:288-301` (динамік). У
  каталозі є `arrow-up`, `send`, `trash`, `sergeant`; той самий клас
  дефекту анти-слоп-аудит зняв 2026-09-03 у `ModuleHeader.tsx`
  ([`anti-slop-strategy.md`](../anti-slop-strategy.md)).
- **[борг]** `HubChatHistoryDrawer.tsx:161` — `z-60` поза семантичною
  шкалою (`zTier`: overlay 150 / modal 200 / toast 300,
  `tailwind-preset.js:1092-1118`). Число взяте, щоб стати над інлайновим
  `zIndex` 50 аркуша (`Sheet.tsx:94, 288`), але діалог над діалогом — це
  тир `modal`, не сира шістдесятка.

Числові розміри `Icon` поза шкалою (`HubChatHistoryDrawer.tsx:203, 217,
229`; `ChatQuickActions.tsx:118, 150`) метрика `numericIconSize` свідомо
не рахує («вимагати токен там, де токена немає» — `ui-canon-budget.json`);
не борг, але новий код бере токен.

## Примітиви й кнопки

Канон кнопки — `(variant, tone)`, `variant ∈ solid | soft | outline | ghost`
([`04-components § Button`](../design-system/04-components.md)). Легасі
`primary` / `secondary` у файлах поверхні — нуль.

| Елемент                      | Канон                                                                                                        | Стан у коді                                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «Нова» в шапці               | `Button variant="soft"`-подібна бренд-пігулка, `aria-label="Нова бесіда"`, ≥44px                             | **[борг]** ручний `<button>` із власною рамкою (`HubChatHeader.tsx:167-175`); рахується в стелі `handRolledFocusRing` (225)                                            |
| «×» закрити асистента        | `Button variant="ghost" iconOnly`, `aria-label="Закрити асистента"`                                          | **[борг]** ручний `<button>` без фокус-рамки взагалі (`HubChatHeader.tsx:177-184`)                                                                                     |
| Пігулка «Скасувати» у стрімі | `ghost`-пігулка `rounded-full bg-panelHi`, `min-h-[44px]`, `aria-label="Скасувати поточний запит"`           | **[борг]** ручний `<button>` (`HubChatBody.tsx:149-158`); підказка каже «(Esc)», а Esc чат не слухає — див. § Стани                                                    |
| «?» / мікрофон / стоп / send | `w-11 h-11 rounded-full`, `aria-label`, `focus-visible:ring-2 ring-focus/45 ring-offset-panel`               | **[борг]** чотири ручні `<button>` (`ChatInput.tsx:97-120, 139-160, 162-192, 193-216`); `focus:outline-none` — дозволений виняток гейта `check-design-conventions.mjs` |
| «Нова бесіда» у списку       | Та сама бренд-пігулка, `h-11`, на всю ширину                                                                 | **[борг]** ручний `<button>` (`HubChatHistoryDrawer.tsx:210-219`)                                                                                                      |
| Закрити список / видалити    | `Button variant="ghost" size="sm" iconOnly` + `aria-label`; видалення `hover:text-danger hover:bg-danger/10` | так (`HubChatHistoryDrawer.tsx:195-204, 296-306`); на `sm+` кнопка видалення `opacity-0` до hover/focus-visible                                                        |
| Рядок бесіди                 | `<button aria-current>` `rounded-2xl`, `pl-3 pr-12 py-2.5`, `focus-visible:ring-focus/45`                    | так (`HubChatHistoryDrawer.tsx:256-295`) — рядок списку, не кнопка дії                                                                                                 |
| Чипи (порожній стан, швидкі) | `<button>` з `text-style-label`, `focus-visible:ring-focus/45`; швидкі — `disabled` під `loading` / офлайн   | так (`ChatEmpty.tsx:150-165`, `ChatQuickActions.tsx:104-122`)                                                                                                          |
| Paywall: головна / відмова   | `variant="solid"` «Перейти на Premium» / `variant="ghost"` «Не зараз»                                        | так — усередині `PaywallModal.tsx:108-111`                                                                                                                             |
| Підтвердження незворотного   | `ConfirmDialog danger` (`confirmLabel` / `cancelLabel` з каталогу)                                           | так (`DestructiveConfirmModal.tsx:80-82`)                                                                                                                              |
| Гейт входу                   | CTA — `<a href={SIGN_IN_PATH}>` `min-h-[44px]`, не `<Link>`: `HubChat` монтується поза `<Router>` у юнітах   | так (`ChatAuthGate.tsx:20-22, 56-62`); той самий компроміс — лінк «Подивись плани» (`ChatUsageCounter.tsx:16-18, 55-60`)                                               |
| Список бесід як діалог       | `role="dialog" aria-modal` + `useDialogFocusTrap(inertBackground)`; Escape — лише через пастку               | так (`HubChatHistoryDrawer.tsx:120-126, 160-165`); власного `Sheet`/`Modal` не використовує — бічна панель, не аркуш                                                   |

Touch targets: ручні кнопки шапки несуть `min-h-[44px] min-w-[44px]`
самі (`HubChatHeader.tsx:170, 180`), поле й кнопки композера — `h-11`;
`Button` тримає 44px під `pointer: coarse` там, де він є.

**Про стек діалогів.** Список бесід і `ConfirmDialog` відкриваються
ПОВЕРХ аркуша, який уже зробив фон `inert`; обидва зареєстровані через
`useDialogFocusTrap`, інакше були б мертві (правило
[`apps/web/AGENTS.md`](../../../../apps/web/AGENTS.md) «Оверлей поверх
`Sheet` мусить бути зареєстрованим діалогом»). Нову накладку в чаті
ставити лише так.

## Стани, які поверхня зобов'язана мати

| Стан                     | Поведінка                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Закрито                  | `HubChatOverlay` віддає `null` (`:125`), але лишається змонтованим — тримає намір повернення з каталогу. Закриття скидає префіл, `autoSend` і `preset` (`useHubChatOverlay.ts:61-69`).                                                                                                                                                                                                                                                                  |
| Відкриття                | `openChat({initialMessage, autoSend, preset})` з хаб-шини (`useAppEffects.ts:170-180`), `Cmd+/`, чипа «Спитати AI», секції «Памʼять ШІ». Sheet оголошує `title` через `announce` (`Sheet.tsx:178-184`); фокус — у поле лише на fine-pointer (`ChatInput.tsx:60-69`).                                                                                                                                                                                    |
| Сесія ще резолвиться     | Композер показується, гейт не блимає: `signedOut` лише на розвʼязаному `unauthenticated` (`HubChat.tsx:87-93`; тест «не блимає гейтом»).                                                                                                                                                                                                                                                                                                                |
| Гість                    | `ChatAuthGate` замість композера, історія лишається видимою (`HubChat.tsx:181-183`). Якщо запит усе ж дійшов до сервера — 401/403 → `CHAT_AUTH_REQUIRED_TEXT` у бульбашці (`hubChatUtils.ts:76-77, 131`). Пігулка квоти не запитує `/usage` без сесії (`ChatUsageCounter.tsx:21-31`).                                                                                                                                                                   |
| Порожня бесіда           | `messages.length === 0 && !loading` → `ChatEmpty` з чипами лише активних модулів (`HubChatBody.tsx:73, 141`; `ChatEmpty.tsx:131-133`). Тап префілить поле й ставить фокус, не шле (`HubChat.tsx:172-178`). Розкриття «Відповідає AI…» стоїть над стрічкою завжди (`HubChatBody.tsx:138-140`).                                                                                                                                                           |
| Готую контекст           | Крапка `bg-warning` пульсує на аватарі, у поповері «Готую контекст…»; збірка в idle-слоті з TTL (`useChatSend.ts:205-236`). Поповер «Деталі» — `role="status"` з обсягом контексту й рядком приватності (`HubChatHeader.tsx:111-149`).                                                                                                                                                                                                                  |
| Офлайн                   | Поле `disabled` з плейсхолдером «Немає зʼєднання, асистент офлайн», send `disabled` (`ChatInput.tsx:125-135, 196-199`); плашка `chatOfflineNotice` (`HubChatComposer.tsx:60-67`); чипи з `requiresOnline` вимкнені з `title` «Потрібне зʼєднання» (`ChatQuickActions.tsx:99-101`); спроба відправити дає бульбашку збою без запиту (`useChatSend.ts:303-313`).                                                                                          |
| Стрімінг                 | `aria-busy`, `TypingIndicator` + пігулка «Скасувати», чипи `disabled`, `setHubStreaming(true)` (`HubChatBody.tsx:93, 145-159`; `useChatSend.ts:345-346`). Автоскрол лише коли користувач і так унизу (поріг 32px, `HubChatBody.tsx:43, 55-71`). Live-region каже «Асистент відповідає…», а по завершенні — саму відповідь (`:95-115`).                                                                                                                  |
| Скасування               | Пігулка → `abort()` → бульбашка асистента «Запит скасовано.», без події (`useChatSend.ts:787-791, 835-837`). Закриття аркуша під час стріму перериває запит через unmount (`:844-848`). **[борг]** підказка «Скасувати (Esc)» (`HubChatBody.tsx:148`): жодного Esc-слухача в чаті немає — Esc належить пастці фокусу `Sheet` і закриває весь чат (`Sheet.tsx:143-146`), а на `/chat` не робить нічого.                                                  |
| Таймаут                  | 90 с → бульбашка збою «Час очікування вичерпано. Спробуй ще раз.» + `hubchat_error{kind:"aborted"}` (`useChatSend.ts:376-379, 781-786`).                                                                                                                                                                                                                                                                                                                |
| Збій відповіді           | Бульбашка `role="alert"` з `friendlyChatError` (`useChatSend.ts:793`); 429 квоти → «Денний ліміт AI вичерпано. Спробуй завтра або зменш навантаження.» (`hubChatUtils.ts:149-151`); биті `tool_calls` → `toast.error` з дією «Спробувати знову» + бульбашка збою (`useChatSend.ts:440-461`). Синтез після інструмента впав — картки `advice` стають `failed`, `state-mutating` дописують «Пояснення не дійшло.» (`:688-735`).                           |
| Free: лічильник          | Пігулка `used/limit запитів` у шапці; Pro (`limit === null`) і будь-яка помилка → `null` без стану завантаження (`ChatUsageCounter.tsx:8-15, 33`). Інвалідація після КОЖНОГО ходу, включно з невдалим (`useChatSend.ts:807-813`).                                                                                                                                                                                                                       |
| Free: ліміт вичерпано    | Пігулка стає warning-лінком «Ліміт запитів до AI на сьогодні. Подивись плани» → `/pricing` (`ChatUsageCounter.tsx:54-60`). Спроба відправити при `remaining <= 0` відкриває `PaywallModal surface="ai_chat_limit"` ще до запиту (`useChatSend.ts:324-333`); копія `paywallModal.aiChatTitle` + `aiChatDescription{limit}` або `…UnknownLimit` (`HubChat.tsx:219-232`). CTA веде на `/pricing`, а ефект маршруту закриває аркуш під нею.                 |
| Сценарний preset         | Перші `PRESET_TURNS` ходи йдуть з окремого тижневого відра: пейвол не спрацьовує, денний лічильник не рахує (`useChatSend.ts:94-97, 315-333`); 429 `AI_QUOTA_PRESET` показує серверну копію без перезапису (`hubChatUtils.ts:146-148`).                                                                                                                                                                                                                 |
| Інструмент виконано      | `ActionCard` / `DataResultCard` + лінк-чип модуля; мутатор — undo-тост 5 с на кожну зміну (`useChatSend.ts:543-551`); рядок «✓ …» лише для інструментів без картки (`:566-590`). Незворотна дія, що пройшла підтвердження, — `ConfirmCard` з бейджем «Виконано» (`ChatMessage.tsx:269-273`).                                                                                                                                                            |
| Незворотна дія           | `DestructiveConfirmModal` ПЕРЕД виконанням, з іменами інструментів і підсумком аргументів (`useChatSend.ts:468-487`). Відмова → «Скасовано, нічого не змінено.» і весь батч скасовано (`:488-502`). Повторний `request` при відкритому діалозі закриває попередній відмовою (`useDestructiveConfirm.ts:85-99`).                                                                                                                                         |
| Список бесід             | Новіші зверху за `updatedAt`, групи по київській добі (`HubChatHistoryDrawer.tsx:60-85, 131-147`); превʼю — остання змістовна репліка, «Ти: …» для своєї (`:48-58`); порожній список — власний empty state (`:223-238`). Стеля 20 сесій (`hubChatSessions.ts:28`).                                                                                                                                                                                      |
| Видалення бесіди         | Кнопка в рядку → негайне видалення + undo-тост «Видалено бесіду «…»» (`useChatSessions.ts:197-232`); видалена активна → наступна або свіжа (`:204-215`).                                                                                                                                                                                                                                                                                                |
| Тост над відкритим чатом | Undo-тости інструментів і видалення бесіди йдуть у спільний трей знизу. **[борг]** `HubChatSheet.tsx:51-76` не передає `footer`, композер живе в тілі аркуша, тож `Sheet` не публікує `--sgt-sheet-footer-inset` (`Sheet.tsx:135-140`) і трей лягає на поле вводу — рівно те, від чого [`toast-policy.md § Layout`](../../ui/toast-policy.md) застерігає («CTA живе у слоті `footer`»). Рішення — композер у `footer` або власний inset — за власником. |
| Нова бесіда              | «Нова» в шапці і в списку → флаш поточної, свіжа сесія з `title: "Нова бесіда"`, список закривається (`useChatSessions.ts:164-178`). Заголовок дописується з першого повідомлення (`:87-121`).                                                                                                                                                                                                                                                          |
| Каталог можливостей      | «?» / `/help` → `/assistant`, не витрачає запит; аркуш закривається ефектом маршруту й повертається, коли людина прийшла назад на той самий шлях (`HubChatOverlay.tsx:68-74, 104-122`). Без обробника каталогу — інлайнова довідка (`useChatSend.ts:55-61, 295-300`).                                                                                                                                                                                   |
| Клавіатура               | `Cmd+/` відкриває чат; `Cmd+K` — пошук або палітра, не чат; `?` поза полями — модалка шорткатів (`useHubKeyboardShortcuts.ts:115-159`). Enter шле, Shift+Enter ні (`ChatInput.tsx:132-134`). Swipe-вниз по ручці й браузерний Back закривають аркуш (`Sheet.tsx:152-162`).                                                                                                                                                                              |
| Клавіатура iOS           | Аркуш компенсує пан visual viewport і тримає поле над клавіатурою (`Sheet.tsx:164-171, 189-257`); чат нічого свого не додає.                                                                                                                                                                                                                                                                                                                            |
| `/chat` як маршрут       | `HubChatPage`: `?q=` префілить, `autoSend` з URL НЕ виконується (`HubChatPage.tsx:42-47, 97`); закриття — `navigate(-1)` після PUSH або `/` з `replace` (`:67-75`); `source="route"` в аналітиці.                                                                                                                                                                                                                                                       |

## Копі

- Оболонка й композер — `uk.core.ts` → `messages.hub.*` (`:167-239`):
  `overlayTitle` «AI-асистент», `closeChat`, `chatQuickActions`,
  `chatOfflineNotice`, `chatEmpty{Title,Description,AiDisclosure,AriaLabel,Suggestion<Module>}`,
  `chatUsage{Unit,AriaPrefix,AriaSuffix,Exhausted}`,
  `destructiveConfirm.{title,body,confirm,cancel}`. **`HubChatSheet`
  імпортує саме `uk.core`, не `uk`** (`HubChatSheet.tsx:3-6`) — повний
  каталог привів би десять модульних файлів на критичний шлях; гейт
  `uk.core.eagerImports.test.ts`. Решта файлів поверхні ліниві й читають
  повний `uk` — це законно.
- Paywall ліміту — `uk.ts` → `paywallModal.aiChatTitle`,
  `aiChatDescription` з `{limit}` через `.replace()`,
  `aiChatDescriptionUnknownLimit` (`:781-801`); чому не в `paywall.<id>` —
  пояснено в [контракті pricing](./2026-09-16-pricing-paywall-design.md#копі).
- Тексти збоїв живуть у `hubChatUtils.ts`: `CHAT_AUTH_REQUIRED_TEXT`
  (`:76-77`), мапер 401/403/429/503 (`friendlyApiError`, `:125-151`),
  `CHAT_RESPONSE_TOO_LONG_TEXT`. Це TS-рядки, а не JSX — лінт
  `no-cyrillic-jsx-literal` їх не бачить за побудовою
  (`eslint-plugin-sergeant-design/index.js:1155-1158`), тож каталог тут
  тримається руками.
- Одиниця квоти — **«запитів»**, не «повідомлень» (`uk.core.ts:229-235`):
  хід з інструментом коштує один запит, тож число буквальне.
- Тон — [`style-guide.uk.md`](../../../product/copy/style-guide.uk.md):
  «ти» («Тапни на підказку…»), перша особа асистента («я повернусь до
  розмови», «Готую контекст…»), збій завжди з наступним кроком («Спробуй
  завтра або зменш навантаження», «Спробуй ще раз»), апостроф `ʼ` U+02BC
  (`зʼєднання`, `Памʼять`), без довгого тире. Розкриття «це AI» коротке й
  без вибачень: «Відповідає AI, а не людина. Може помилятися, тож важливе
  перевіряй.»
- Кирилиця поза каталогом — **[борг]**, один запис на пʼять файлів з
  allowlist `apps/web/eslint.i18n-allowlist.json` (рядки 87, 88, 95, 103, 104) плюс два поза ним. Перелік нижче включає і JSX-текст/атрибути, які
  лінт бачить, і рядки в обʼєктах, тернарах та шаблонах, яких він не
  бачить за побудовою (`index.js:1146-1149`), — для каталогу різниці
  немає:
  - `HubChatHeader.tsx:64, 97, 130-133, 137-138, 146-147, 158, 166, 171,
174, 181` — «Асистент», статуси контексту, «Усі бесіди», «Нова»,
    «Закрити асистента»;
  - `HubChatBody.tsx:114, 148, 153, 156` — «Асистент відповідає…»,
    «Скасувати (Esc)»;
  - `HubChatHistoryDrawer.tsx:63-66, 164, 186, 190-191, 200, 218, 232-236,
292, 301-302` — «Сьогодні/Вчора/Раніше», «Бесіди», «Поки порожньо»,
    «Нова бесіда», порожній стан, «повідомлень», «Видалити»;
  - `ChatInput.tsx:96, 101-102, 126-128, 136, 146-147, 171-172, 198-199` —
    плейсхолдери, `aria-label`, `title`;
  - `ChatMessage.tsx:45, 50, 55, 60` (назви модулів у `MODULE_LINK`),
    `:149, 171, 197, 285-286, 302, 317, 356` — «Показати все»,
    «Виконано», «Озвучити», «Думаю…»;
  - `ChatAuthGate.tsx:27-31, 48, 51-52, 61` — `eslint-disable` замість
    allowlist із поясненням «`uk.ts` уперся в `max-lines: 600`»; з
    2026-09-12 каталог розкладено на `uk.core` + модульні файли, і привід
    зник;
  - `ChatQuickActions.tsx:152` — «Ще» / «Згорнути» як `JSXText` без
    allowlist: єдині живі `warn` поверхні.
    Стеля `cyrillicJsxAllowlist` стоїть на 299 і не росте: нова кирилиця в
    JSX чату означає або каталог, або червоний гейт.
- Заголовок аркуша «AI-асистент» (sr-only, `Sheet.tsx:346-348`) і
  видимий «Асистент» у шапці (`HubChatHeader.tsx:97`) — два різні рядки
  для однієї сутності; при винесенні шапки в каталог узгодити з
  `messages.onboarding` про персонажа «Сержант» (`uk.core.ts:264-276`).
- `chatOfflineNotice` містить перенос рядка з відступом усередині рядка
  (`uk.core.ts:190-191`) — слід переносу з JSX; у `div` без `pre` він
  згортається у пробіл, тож видимого ефекту немає.

## Аналітика

Івенти з `packages/shared/src/lib/analyticsEvents.ts` (`:134-164`),
контракт — факт взаємодії, ніколи текст:

- `hubchat_opened {source: "overlay" | "route"}` — раз на монтування
  `HubChat`, ref-гард проти StrictMode (`HubChat.tsx:69-85`).
- `hubchat_message_sent {length, fromVoice, module?}` — ПІСЛЯ гейтів
  `/help`, офлайн і пейволу: ті гілки не витрачають запит
  (`useChatSend.ts:348-357`).
- `hubchat_response_received {latency_ms, length, had_tools}` — один
  call-site на текстову й tool-гілку; биті `tool_calls` і відмова від
  деструктивної дії сюди не доходять (`:767-776`).
- `hubchat_tool_invoked {tool, module, success, latency_ms}` — на кожен
  виконаний хендлер, `success` зі структурного `ok` (`:509-529`).
- `hubchat_error {kind, status?}` — `parse` (`:449`), `aborted` = лише
  90-секундний таймаут (`:786`), `http`/`network`/`unknown` (`:794-800`).
  Ручне скасування події не шле навмисно (`analyticsEvents.ts:153-159`).
- `paywall_viewed {surface: "ai_chat_limit"}` — раз на перехід
  `open: false → true` (`PaywallModal.tsx:82-85`).

Воронка бети: `opened ≥ message_sent ≥ response_received + error`. Новий
стан поверхні без івента не приймається; тіло повідомлення чи
`tool_input` у payload — заборонено.

## Безпека

- `/api/chat` за `requireSession()`; клієнт не послаблює гейт, а називає
  вихід (`ChatAuthGate.tsx:7-14`).
- `?autoSend=1` з URL не виконується — авто-відправка лише з внутрішньої
  шини `openChat` (`HubChatPage.tsx:42-47`, тест `HubChatPage.test.tsx:125`).
- `tool_calls` проходять структурний файрвол `parseToolCalls`; провал —
  весь батч викинуто, тост, текстовий фолбек (`useChatSend.ts:434-461`).
  `tool_calls_raw` назад на сервер — лише блоки, які приймає серверна
  схема (`keepReplayableToolBlocks`, `:608-630`).
- Незворотні інструменти — підтвердження перед виконанням, класифікація
  `TOOL_RISK` у `@sergeant/shared` (`useDestructiveConfirm.ts:13-15`).
- Стрім обмежено `MAX_STREAM_CHARS` (256 K) і таймаутом 90 с; unmount
  перериває запит (`useChatSend.ts:63-73, 376-379, 844-848`).
- У поповері приватності явно сказано, що контекст модулів іде до AI
  (`HubChatHeader.tsx:145-148`).

## Продуктивність

Межа eager/lazy — головний інваріант цієї поверхні, і він двошаровий:

1. **`HubChatOverlay` — eager**, бо статично імпортований `RootLayout`
   і мусить жити при закритому чаті (намір повернення, ефект маршруту).
   Він тягне рівно `useHubChatOverlay` і `lazyDefault(() =>
import("./HubChatSheet"))` (`HubChatOverlay.tsx:13-25`, AI-DANGER).
   Поки `Sheet` жив тут, на критичний шлях їхав увесь стек аркуша
   (`useSwipeToDismiss`, `useBodyScrollLock`, `useKeyboardAwareOverlay`,
   `useVisualKeyboardInset`) — ~2.8 kB brotli. Винос 2026-09-16 дав eager
   268.0 → 264.5 kB і 76 → 72 preload-чанки ціною +2.1 kB до брутто
   `size-limit` ([`AGENTS.md § Performance budgets`](../../../../AGENTS.md#performance-budgets)).
2. **`HubChatSheet` — лінивий**, монтується лише на `open`; усередині ще
   один `lazyDefault(() => import("./HubChat"))` і `uk.core` замість `uk`
   (`HubChatSheet.tsx:3-11`). Fallback оверлея — `null`: до відкриття на
   екрані й так нічого не було, а чанк лежить у precache сервіс-воркера
   (`HubChatOverlay.tsx:127-131`); усередині аркуша —
   `SuspenseWithMinDelay` + `PageLoader` (`HubChatSheet.tsx:81-92`).

Правило: **важке — у `HubChatSheet` або глибше; у `HubChatOverlay` — ні.**
Гейти: `pnpm --filter @sergeant/web size:eager` (стеля 268 kB) і
`uk.core.eagerImports.test.ts`.

Далі всередині: один скрол-контейнер (`HubChatBody`), бо `Sheet` отримує
`!overflow-hidden` (`HubChatSheet.tsx:70-74`); контекст збирається в idle
з TTL, не на кожен хід (`useChatSend.ts:205-236`); історія пишеться з
дебаунсом 600 мс і флашем на `beforeunload` (`useChatSessions.ts:87-141`,
`hubChatUtils.ts:19`); `ChatMessage` мемоїзований; стрім обрізається на
256 K символів, щоб `setMessages` не перемальовував стрічку без кінця.

## Чого не робити

- Не повертати в `HubChatOverlay` прямий імпорт `Sheet`, `HubChat` чи
  будь-чого з їхнього графа; не міняти `uk.core` на `uk` у `HubChatSheet`.
- Не тягнути модульний акцент у хром чату (шапка, композер, бульбашки,
  картки) — модуль називають лише чипи й лінки, які його називають.
- Не рахувати квоту на клієнті: пре-гейт читає `/api/chat/usage`, істина —
  серверний 429. Не вигадувати другий лічильник у localStorage (так уже
  було, розходилось удвічі — `useChatSend.ts:167-173`).
- Не виконувати `autoSend` з URL і не додавати другого слухача на
  `Cmd+K` чи Escape.
- Не вішати розкриття «це AI» на `isEmpty` і не вертати підстановку
  привітання в порожню сесію (канон § журнал 2026-09-14).
- Не замінювати підтвердження незворотної дії на undo — і не розширювати
  діалог на оборотні дії: «Так» без читання починається саме там.
- Не слати текст повідомлень чи `tool_input` в аналітику.
- Не писати копі нового стану літералом у компоненті — allowlist не росте.
- Не робити третій діалог поверх аркуша без `useDialogFocusTrap` — він
  буде видимий і мертвий.
- Не додавати snap-points ручним аркушем: канонічний `Sheet` їх ще не
  має, і це окремий хвіст у примітиві (`HubChatSheet.tsx:38-41`).

## Поза скоупом

- Повний маршрут `/chat` (`HubChatPage.tsx`) — той самий `HubChat` без
  аркуша, `@scaffolded` з `@nextStep` «двопанельна розкладка на `lg+`»;
  контракт описує лише те, чим він відрізняється (стани «`/chat` як
  маршрут»). Каталог `/assistant` — окрема сторінка, тут лише перехід.
- Внутрішнє `PaywallModal`, `/pricing`, `usePlan` — [контракт
  pricing/paywall](./2026-09-16-pricing-paywall-design.md).
- Серверна квота, round-trip-квиток, rate-limit, preset-відра — ADR-0085,
  [`hub-coach.md` § 9](../../../product/modules/hub-coach.md); тут лише
  те, як клієнт це показує.
- Coach-інсайт і тижневий дайджест — інші поверхні шару.
- Kill-switch голосу (`resolveVoiceProvider.ts`) і сам `useSpeech` — чат
  лише поважає прапорець (`ChatInput.tsx:81-87`).
- Мобільний чат (`apps/mobile`) — контур на паузі
  ([ADR-0094](../../../governance/adr/0094-mobile-web-first-freeze.md)); він
  не виконує інструментів і шле порожній контекст (канон § 2), паритету
  контракт не обіцяє.

## Верифікація

- Передумова юнітів: `pnpm --filter @sergeant/db-schema build`.
- `pnpm --filter @sergeant/web exec vitest run src/core/hub/HubChat src/core/hub/chat src/core/hub/useHubChatOverlay src/core/components/Chat src/shared/i18n/uk.core.eagerImports`
  — стани з таблиці покриті `HubChat.test.tsx` (гейт гостя, «не
  блимає»), `HubChatOverlay.test.tsx` (намір повернення з каталогу),
  `HubChatSheet.test.tsx`, `HubChatBody.test.tsx` (розкриття, live-region,
  `ChatEmpty`, пігулка скасування), `HubChatComposer.test.tsx` (офлайн),
  `ChatUsageCounter.test.tsx` (Pro / Free / вичерпано / збій),
  `useChatSend*.test.tsx` (`/help`, офлайн, пейвол, 429, скасування,
  preset, стеля стріму) і `HubChat.test.tsx` + `useDestructiveConfirm.test.ts`
  (підтвердження незворотного); 90-секундний таймаут тестом не закритий.
  `useChatSessions.test.tsx`, `HubChatHistoryDrawer.test.tsx`
  (групи по київській добі, DST, undo), `HubChatPage.test.tsx`
  (`autoSend` з URL заборонено).
- `pnpm --filter @sergeant/web e2e` — `hub-chat-smoke.spec.ts`
  (`@critical`: холодне завантаження `/chat`, збій API дає повторюваний
  збій у бульбашці); a11y-прогін `ds-visual-qa.spec.ts` включає `/chat`.
- `pnpm lint:ui-canon` — `legacyButton` 0, `handRolledFocusRing` стеля
  225, `cyrillicJsxAllowlist` 299: ручна кнопка чи новий літерал у чаті
  червонять гейт. `pnpm lint:design-conventions` — `focus:` лише як
  `focus:outline-none`, 12px floor.
- `pnpm --filter @sergeant/web size:eager` — після будь-якої правки
  імпортів у `HubChatOverlay.tsx` / `HubChatSheet.tsx`.
- Рев'ю за цим документом: нейтральна палітра хрому, стани з таблиці,
  копі з каталогу, івент на кожен новий стан, важке — лише за лінивою
  межею.
