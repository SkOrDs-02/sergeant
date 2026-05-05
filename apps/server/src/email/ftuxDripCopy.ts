/**
 * FTUX drip copy для Day 0 / Day 1 / Day 3. Окремо від dispatcher-а, щоб
 * можна було impport-ити у тестах + майбутніх A/B-варіантах без витягання
 * BullMQ / Resend залежностей.
 *
 * Тон: pragmatic, без emoji, без artificial cheer (цього вимагає S1
 * post-mortem — `docs/launch/product-os/sprint-retros/s1-honest-valueprop.md`). Кожен
 * лист має одну дію (CTA + контекст) і footer з opt-out-link-ою.
 *
 * Copy-review: KEEP-AS-IS поки founder-friend не схвалить альтернативи
 * (S1.1 в FTUX-плані лишається відкритим). Якщо PR-овий рев'ю просить
 * іншу копію — точкові правки тут, без зачіпання dispatcher-у.
 */

export type FtuxDripDay = "day_0" | "day_1" | "day_3";

export interface FtuxDripTemplateInput {
  /** Ім'я для звернення; якщо порожнє — використовується нейтральне «Привіт». */
  recipientName: string | null;
  /** Абсолютна URL з пре-генерованим HMAC-токеном. */
  unsubscribeUrl: string;
  /** Базова URL фронту (без trailing slash). Використовується для primary CTA. */
  appUrl: string;
}

export interface FtuxDripTemplate {
  subject: string;
  text: string;
  html: string;
}

const FOOTER_TEXT_TEMPLATE =
  "—\nЯкщо ці листи не на часі — відписатись: {unsubscribeUrl}";

const FOOTER_HTML_TEMPLATE =
  '<p style="margin-top:32px;color:#94a3b8;font-size:12px;line-height:1.5">' +
  "Якщо ці листи не на часі — " +
  '<a href="{unsubscribeUrl}" style="color:#94a3b8">відписатись</a>.' +
  "</p>";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function greeting(recipientName: string | null): string {
  const trimmed = recipientName?.trim();
  if (trimmed) return `Привіт, ${trimmed}!`;
  return "Привіт!";
}

function htmlFooter(unsubscribeUrl: string): string {
  return FOOTER_HTML_TEMPLATE.replace(
    /{unsubscribeUrl}/g,
    escapeAttr(unsubscribeUrl),
  );
}

function textFooter(unsubscribeUrl: string): string {
  return FOOTER_TEXT_TEMPLATE.replace("{unsubscribeUrl}", unsubscribeUrl);
}

function wrapHtml(bodyHtml: string): string {
  // Inline-styles only — більшість email-клієнтів стрипає <style> теги.
  return (
    `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;` +
    `font-size:15px;line-height:1.6;color:#0f172a;max-width:560px;margin:0 auto;padding:24px">` +
    bodyHtml +
    `</div>`
  );
}

function ctaButton(href: string, label: string): string {
  return (
    `<p style="margin:20px 0"><a href="${escapeAttr(href)}" ` +
    `style="display:inline-block;padding:10px 18px;background:#0f172a;color:#fff;` +
    `text-decoration:none;border-radius:8px;font-weight:600">${escapeHtml(label)}</a></p>`
  );
}

function buildDay0(input: FtuxDripTemplateInput): FtuxDripTemplate {
  const hello = greeting(input.recipientName);
  const text = [
    hello,
    "",
    "Sergeant — це твій помічник для трекінгу витрат, звичок, тренувань і харчування. Чотири модулі в одному додатку, без зайвого галасу.",
    "",
    "Що зробити зараз: відкрий додаток і додай перший запис у будь-якому модулі — навіть найдрібніший. Це достатньо, щоб панель почала працювати на тебе.",
    "",
    `Перейти в Sergeant: ${input.appUrl}`,
    "",
    textFooter(input.unsubscribeUrl),
  ].join("\n");

  const html = wrapHtml(
    [
      `<p>${escapeHtml(hello)}</p>`,
      `<p>Sergeant — це твій помічник для трекінгу витрат, звичок, тренувань і харчування. Чотири модулі в одному додатку, без зайвого галасу.</p>`,
      `<p><strong>Що зробити зараз:</strong> відкрий додаток і додай перший запис у будь-якому модулі — навіть найдрібніший. Це достатньо, щоб панель почала працювати на тебе.</p>`,
      ctaButton(input.appUrl, "Перейти в Sergeant"),
      htmlFooter(input.unsubscribeUrl),
    ].join(""),
  );

  return {
    subject: "Привіт від Sergeant — давай почнемо",
    text,
    html,
  };
}

function buildDay1(input: FtuxDripTemplateInput): FtuxDripTemplate {
  const hello = greeting(input.recipientName);
  const text = [
    hello,
    "",
    "Один день у Sergeant — час подивитись, що далі.",
    "",
    "Якщо ще не додав перший запис — це той момент. Не треба робити «правильно з першої спроби», просто зафіксуй що-небудь реальне:",
    "",
    "  · Витрата сьогодні — у Finyk.",
    "  · Звичка, яку хочеш утримувати — у Routine.",
    "  · Прийом їжі — у Nutrition.",
    "  · Тренування або прогулянку — у Fizruk.",
    "",
    "Чим раніше ти створиш свій перший справжній рядок — тим швидше дашборд почне показувати твою реальну картину, а не приклад.",
    "",
    `Відкрити Sergeant: ${input.appUrl}`,
    "",
    textFooter(input.unsubscribeUrl),
  ].join("\n");

  const html = wrapHtml(
    [
      `<p>${escapeHtml(hello)}</p>`,
      `<p>Один день у Sergeant — час подивитись, що далі.</p>`,
      `<p>Якщо ще не додав перший запис — це той момент. Не треба робити «правильно з першої спроби», просто зафіксуй що-небудь реальне:</p>`,
      `<ul style="padding-left:20px;margin:8px 0">`,
      `<li>Витрата сьогодні — у Finyk.</li>`,
      `<li>Звичка, яку хочеш утримувати — у Routine.</li>`,
      `<li>Прийом їжі — у Nutrition.</li>`,
      `<li>Тренування або прогулянку — у Fizruk.</li>`,
      `</ul>`,
      `<p>Чим раніше ти створиш свій перший справжній рядок — тим швидше дашборд почне показувати твою реальну картину, а не приклад.</p>`,
      ctaButton(input.appUrl, "Відкрити Sergeant"),
      htmlFooter(input.unsubscribeUrl),
    ].join(""),
  );

  return {
    subject: "Що далі? Один маленький запис у Sergeant",
    text,
    html,
  };
}

function buildDay3(input: FtuxDripTemplateInput): FtuxDripTemplate {
  const hello = greeting(input.recipientName);
  const text = [
    hello,
    "",
    "Минуло три дні — і ми не хочемо, щоб ти тихенько зник у бекграунді.",
    "",
    "Якщо щось не зайшло — це ОК. Sergeant корисний рівно тоді, коли модуль рятує тобі рутину, а не додає її. Якщо немає такого модуля — закрий вкладку без вини.",
    "",
    "Якщо ти все ж хочеш дати другий шанс: один запис сьогодні. Будь-який модуль. 30 секунд — і панель оживає, а ми перестаємо писати.",
    "",
    `Повернутись у Sergeant: ${input.appUrl}`,
    "",
    "Якщо хочеш — напиши, що саме не зайшло, відповівши на цей лист. Це справжня людина (founder), не auto-responder.",
    "",
    textFooter(input.unsubscribeUrl),
  ].join("\n");

  const html = wrapHtml(
    [
      `<p>${escapeHtml(hello)}</p>`,
      `<p>Минуло три дні — і ми не хочемо, щоб ти тихенько зник у бекграунді.</p>`,
      `<p>Якщо щось не зайшло — це ОК. Sergeant корисний рівно тоді, коли модуль рятує тобі рутину, а не додає її. Якщо немає такого модуля — закрий вкладку без вини.</p>`,
      `<p>Якщо ти все ж хочеш дати другий шанс: один запис сьогодні. Будь-який модуль. 30 секунд — і панель оживає, а ми перестаємо писати.</p>`,
      ctaButton(input.appUrl, "Повернутись у Sergeant"),
      `<p style="font-size:13px;color:#475569">Якщо хочеш — напиши, що саме не зайшло, відповівши на цей лист. Це справжня людина (founder), не auto-responder.</p>`,
      htmlFooter(input.unsubscribeUrl),
    ].join(""),
  );

  return {
    subject: "Все ок? Sergeant чекає на твій перший запис",
    text,
    html,
  };
}

export function buildFtuxDripTemplate(
  day: FtuxDripDay,
  input: FtuxDripTemplateInput,
): FtuxDripTemplate {
  switch (day) {
    case "day_0":
      return buildDay0(input);
    case "day_1":
      return buildDay1(input);
    case "day_3":
      return buildDay3(input);
  }
}

/** Family-name використовується у `email_unsubscribes.campaign_family`. */
export const FTUX_DRIP_CAMPAIGN_FAMILY = "ftux_drip";

/** Map day → unique campaign_key для `email_campaigns_log`. */
export const FTUX_DRIP_CAMPAIGN_KEY: Record<FtuxDripDay, string> = {
  day_0: "ftux_drip_day_0",
  day_1: "ftux_drip_day_1",
  day_3: "ftux_drip_day_3",
};

/** Затримки для BullMQ delayed jobs (мс від моменту реєстрації юзера). */
export const FTUX_DRIP_DELAY_MS: Record<FtuxDripDay, number> = {
  day_0: 0,
  day_1: 24 * 60 * 60 * 1000,
  day_3: 3 * 24 * 60 * 60 * 1000,
};
