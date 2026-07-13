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

- iOS може оновити `100dvh` із затримкою після SPA-навігації та зміни toolbar.
  `--app-dvh` синхронізується з `visualViewport.height`; при зміні route key
  значення перевимірюється, але не видаляється між effect-проходами.
- `hub:open-settings` раніше викликав navigation через `setHubView` і ще раз
  через явний `navigate`, створюючи подвійний layout/scroll pass.
- `SuspenseWithMinDelay` додає host `<div>`. Без `flex-1 min-h-0 flex flex-col`
  цей host не передає висоту Sheet до `HubChatBody`, тому внутрішній scroll
  фактично не має overflow-контейнера.

## Acceptance criteria

- `/welcome` → «У мене вже є акаунт»: pathname `/sign-in`, auth surface
  змонтований, welcome CTA зникає, а попереднє `--app-dvh` не очищається під
  час переходу.
- Privacy → «Налаштувати»: один URL transition до
  `/?tab=settings#settings-privacy`; висота нижнього nav стабільна.
- Overlay та `/chat` з довгою історією: `HubChatBody` має доступну висоту,
  прокручується самостійно, а Sheet/body не прокручується разом із ним.
- Regression-тести покривають route viewport resync, Suspense layout host і
  privacy navigation.

## Scope

Зміни обмежені web shell, router handoff, Sheet/chat layout та тестами.
Нові API, міграції й зміни даних не потрібні. Скріншоти з audit-папки не
комітяться.
