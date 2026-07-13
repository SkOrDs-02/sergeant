<!-- Last touched: 2026-07-13 -->
<!-- Status: Active -->

# Регресії Hub, onboarding та AI-чату

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

- Корінь проблеми — document-level scroll у застосунку, де всі сторінки вже
  мають власні внутрішні scroll-контейнери. `page-enter` на full-height welcome
  створював scrollable overflow, а `visualViewport.height` змінював геометрію
  shell під час iOS-жесту. `#root` має бути pinned viewport без document scroll;
  `h-app-dvh` успадковує його висоту без JS-вимірювання `visualViewport`.
- `hub:open-settings` раніше викликав navigation через `setHubView` і ще раз
  через явний `navigate`, створюючи подвійний layout/scroll pass.
- Hash-навігація Settings викликала `scrollIntoView`, який на iOS прокручував
  не лише внутрішній `PullToRefresh`, а й документ. Через це весь Hub shell
  зсувався під status bar, а нижній nav візуально виростав.
- Попередній workaround `bottom-nav-shell::after` домальовував під nav ще
  `4rem` (64 px) поза його layout-box. Коли iOS зсував viewport, цей фартух
  ставав видимим як майже подвійна висота навігації. Pinned root прибирає
  потребу в такому позапотоковому заповненні.
- `SuspenseWithMinDelay` додає host `<div>`. Без `flex-1 min-h-0 flex flex-col`
  цей host не передає висоту Sheet до `HubChatBody`, тому внутрішній scroll
  фактично не має overflow-контейнера.

## Acceptance criteria

- `/welcome` → «У мене вже є акаунт»: pathname `/sign-in`, auth surface
  змонтований, welcome CTA зникає; full-height shell не має transform-анімації,
  document scroll і JS-залежності від `visualViewport.height`.
- Privacy → «Налаштувати»: один URL transition до
  `/?tab=settings#settings-privacy`; scroll виконується лише у внутрішньому
  контейнері, а висота й позиція нижнього nav стабільні; nav не має
  псевдоелемента-фартуха за межами власного box.
- Overlay та `/chat` з довгою історією: `HubChatBody` має доступну висоту,
  прокручується самостійно, а Sheet/body не прокручується разом із ним.
- Regression-тести покривають pinned-root CSS contract, welcome shell без
  transform overflow, внутрішній Settings hash-scroll, Suspense layout host і
  privacy navigation.

## Scope

Зміни обмежені web shell, router handoff, Sheet/chat layout та тестами.
Нові API, міграції й зміни даних не потрібні. Скріншоти з audit-папки не
комітяться.
