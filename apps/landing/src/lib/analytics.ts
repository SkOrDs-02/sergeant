// Телеметрія лендінга. Імена подій НЕ вигадуються тут – беруться з
// `ANALYTICS_EVENTS` у `@sergeant/shared`, де описані контракти payload-ів.
// Лендінг шле рівно чотири події: `landing_viewed` (App.tsx),
// `landing_telegram_clicked` (TelegramCta.tsx), `landing_widget_changed`
// (HomePage.tsx) і `landing_faq_opened` (PytannyaPage.tsx). Ренейм події
// ламає дашборди й губить історію, тож константа – єдине джерело.
//
// Транспорт умисно вузький: жодного autocapture, session-recording чи
// pageview-хуків. Полів вводу на сайті немає взагалі – конверсія йде через
// deep link у Telegram, – але «розумний» збір усе одно не потрібен: кожна
// подія несе лише стан контрола, і всі чотири перелічені у політиці
// приватності поіменно. Додаєш подію – онови і її, і README.
//
// До 2026-09-17 цей коментар описував email-еру лендінга (поле вводу,
// `landing_email_captured`, `waitlist_submitted`), яку скасовано 2026-07-26
// переходом на Telegram-вейтліст. Код давно не збігався з коментарем.
//
// SDK вантажиться динамічним імпортом (як `posthog.ts` в apps/web): ~170 kB
// аналітики не мають стояти на шляху першого рендера сторінки, чия єдина
// робота – конвертувати. Події до завершення init складаються в чергу.

import { ANALYTICS_EVENTS } from "@sergeant/shared";

export { ANALYTICS_EVENTS };

/** Мова, якою відрендерено сторінку. Лендінг поки лише україномовний. */
export const LANDING_LOCALE = "uk" as const;

type Payload = Record<string, unknown>;
type Capture = (event: string, payload: Payload) => void;

let capture: Capture | null = null;
/** Події, що сталися до готовності SDK. Порожня, якщо ключа немає. */
let queue: Array<[string, Payload]> = [];
let started = false;

/**
 * Ініціалізація PostHog. Без `VITE_POSTHOG_KEY` – повний no-op: dev-збірка і
 * превʼю не шлють нічого, черга не росте, а `track()` тихо повертається.
 */
export function initAnalytics(): void {
  const key = import.meta.env["VITE_POSTHOG_KEY"];
  if (!key || started) return;
  started = true;

  void import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(key, {
        api_host:
          import.meta.env["VITE_POSTHOG_HOST"] || "https://eu.i.posthog.com",

        // Cookieless. `persistence: "memory"` не пише ні cookie, ні
        // localStorage, тож банер згоди не потрібен, а політика приватності
        // лишається простою і правдивою. Ціна: кожне завантаження сторінки –
        // новий анонім, тож крос-сесійна аналітика (повернення, багатоденна
        // атрибуція) неможлива. Воронка, яка тут справді потрібна, –
        // внутрішньосесійна: показ → ввід → сабміт. Апгрейд, якщо колись
        // знадобиться утримання: cookie-persistence плюс банер згоди.
        persistence: "memory",
        person_profiles: "never",

        // Явні події замість здогадок. `capture_pageview: false` – бо перегляд
        // ми шлемо самі як `landing_viewed` з контрактним payload-ом.
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
      });

      // Та сама супер-властивість, що й у `apps/web`. Ключ PostHog один на
      // всі поверхні, щоб воронка «лендінг → бот → реєстрація» лишалась
      // цілою – а отже фільтр `environment = production` не повинен
      // випадково викидати події лендінга. Без цього рядка вони мали б
      // `null` і зникали б з будь-якої вибірки по середовищу.
      posthog.register({
        environment: import.meta.env["VITE_APP_ENV"] || "production",
      });

      capture = (event, payload) => posthog.capture(event, payload);
      for (const [event, payload] of queue) capture(event, payload);
      queue = [];
    })
    .catch(() => {
      // Блокувальник реклами чи збій мережі – не привід ламати сторінку.
      queue = [];
    });
}

/**
 * Fire-and-forget. Ніколи не кидає і нічого не повертає – телеметрія не має
 * права зламати сабміт форми.
 */
export function track(event: string, payload: Payload = {}): void {
  if (!started) return;
  try {
    if (capture) capture(event, payload);
    else queue.push([event, payload]);
  } catch {
    // Аналітика – не критичний шлях.
  }
}
