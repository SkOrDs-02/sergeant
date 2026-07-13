<!-- Last touched: 2026-07-13 -->
<!-- Status: Active -->

# Регресії Hub, onboarding та AI-чату

> **Last validated:** 2026-07-13 by @claude. **Next review:** 2026-10-13.
> **Status:** Active

## Мета

Закрити три пов'язані mobile-web регресії, зафіксовані в аудиті
`E:\.claude\ui-audit-2026-07-12`:

1. Після переходів між welcome/auth/paywall і Hub під нижнім навбаром не
   з'являється фонова смуга, а кнопка «У мене вже є акаунт» одразу відкриває
   `/sign-in` без помітного layout-jump.
2. Перехід із privacy prompt у Settings виконується одним router transition;
   нижній навбар не піднімається і не збільшується.
3. AI-чат у Sheet має власний внутрішній scroll і не передає overscroll фону.

## Діагностика

- Тут було дві різні причини. Document-level scroll зсував shell під час
  `page-enter`/`scrollIntoView`, тому `html` і `body` мають лишатися
  непрокручуваними. Але однакова нижня межа на реальних скріншотах welcome,
  auth і Hub довела окрему проблему: `#root { position: fixed; inset: 0 }` у
  встановленій iOS PWA з `viewport-fit=cover` закінчується вище фізичного низу.
  Це відомі WebKit 237961 і 254868: fixed containing block, `dvh` та
  `visualViewport.height` можуть не включати viewport-fit extension. Тому
  `#root` повернуто в normal flow: `100dvh` для browser mode і стабільний
  `100vh` для `display-mode: standalone`; `h-app-dvh` успадковує цю висоту.
- `hub:open-settings` раніше викликав navigation через `setHubView` і ще раз
  через явний `navigate`, створюючи подвійний layout/scroll pass.
- Hash-навігація Settings викликала `scrollIntoView`, який на iOS прокручував
  не лише внутрішній `PullToRefresh`, а й документ. Через це весь Hub shell
  зсувався під status bar, а нижній nav візуально виростав.
- Попередній workaround `bottom-nav-shell::after` домальовував під nav ще
  `4rem` (64 px) поза його layout-box. Коли iOS зсував viewport, цей фартух
  ставав видимим як майже подвійна висота навігації. Наступний fixed `::before`
  теж не міг виправити межу: він прив'язувався до того самого вкороченого
  WebKit viewport. Обидва псевдоелементи прибрані; normal-flow root тепер
  доходить до фізичного низу, а фон і safe-area заповнює власний box nav.
- Для відновленої сесії CTA «У мене вже є акаунт» потрапляв у детермінований
  цикл `/welcome → /sign-in → / → /welcome`: sign-in guard відправляв
  авторизованого користувача на Hub, але незакритий onboarding gate одразу
  повертав його назад. CTA тепер спочатку фіксує явний skip onboarding і лише
  потім відкриває auth; анонімний користувач бачить `/sign-in`, користувач із
  відновленою сесією входить у Hub.
- `SuspenseWithMinDelay` додає host `<div>`. Без `flex-1 min-h-0 flex flex-col`
  цей host не передає висоту Sheet до `HubChatBody`, тому внутрішній scroll
  фактично не має overflow-контейнера.

## Acceptance criteria

- `/welcome` → «У мене вже є акаунт»: для анонімної сесії pathname `/sign-in`
  і auth surface змонтований; для відновленої сесії pathname `/` і Hub
  змонтований без повернення на welcome. Full-height shell не має
  transform-анімації, document scroll і JS-залежності від
  `visualViewport.height`; `#root` не fixed і в standalone має `height: 100vh`,
  тож welcome/auth/Hub доходять до фізичного низу без системної смуги.
- Privacy → «Налаштувати»: один URL transition до
  `/?tab=settings#settings-privacy`; scroll виконується лише у внутрішньому
  контейнері, а висота й позиція нижнього nav стабільні; nav не має
  псевдоелемента-фартуха за межами власного box.
- Overlay та `/chat` з довгою історією: `HubChatBody` має доступну висоту,
  прокручується самостійно, а Sheet/body не прокручується разом із ним.
- Regression-тести покривають normal-flow root + standalone `100vh` contract,
  welcome shell без
  transform overflow, returning-account route loop, внутрішній Settings
  hash-scroll, Suspense layout host і privacy navigation.

## Scope

Зміни обмежені web shell, router handoff, Sheet/chat layout та тестами.
Нові API, міграції й зміни даних не потрібні. Скріншоти з audit-папки не
комітяться.
