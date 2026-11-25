/**
 * FTUX drip copy для Day 0 / Day 1 / Day 3. Окремо від dispatcher-а, щоб
 * можна було impport-ити у тестах + майбутніх A/B-варіантах без витягання
 * BullMQ / Resend залежностей.
 *
 * Тон: pragmatic, без emoji, без artificial cheer (цього вимагає S1
 * post-mortem — `docs/work/specs/launch/product-os/sprint-retros/s1-honest-valueprop.md`). Кожен
 * лист має одну дію (CTA + контекст) і footer з opt-out-link-ою.
 *
 * Copy-review: KEEP-AS-IS поки founder-friend не схвалить альтернативи
 * (S1.1 в FTUX-плані лишається відкритим). Якщо PR-овий ревʼю просить
 * іншу копію — точкові правки тут, без зачіпання dispatcher-у.
 */

export type FtuxDripDay = "day_0" | "day_1" | "day_3";

export interface FtuxDripTemplateInput {
  /** Імʼя для звернення; якщо порожнє — використовується нейтральне «Привіт». */
  recipientName: string | null;
  /** Абсолютна URL з пре-генерованим HMAC-токеном. */
  unsubscribeUrl: string;
  /** Базова URL фронту (без trailing slash). Використовується для primary CTA. */
  appUrl: string;
  /**
   * У людини немає жодної push-підписки. Тоді листи дня 1 і 3 кличуть
   * увімкнути сповіщення: без підписки нагадування й нудж відсутності до
   * неї не дійдуть ніколи. День 0 запрошення не несе: людина щойно в
   * застосунку й бачить налаштування сама.
   */
  pushInvite?: boolean;
}

export interface FtuxDripTemplate {
  subject: string;
  text: string;
  html: string;
}

const FOOTER_TEXT_TEMPLATE =
  "--\nЯкщо ці листи не на часі, відписатись: {unsubscribeUrl}";

const FOOTER_HTML_TEMPLATE =
  '<p style="margin-top:32px;color:#94a3b8;font-size:12px;line-height:1.5">' +
  "Якщо ці листи не на часі, " +
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
  // Без оклику: канон копії (style-guide §7, гейт `copy.slop.test.ts`)
  // тримає оклики на нулі, лист не виняток.
  if (trimmed) return `Привіт, ${trimmed}.`;
  return "Привіт.";
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

function notificationsUrl(appUrl: string): string {
  return `${appUrl}/?tab=settings#settings-notifications`;
}

const PUSH_INVITE_LEAD =
  "Сповіщення ще не ввімкнені, тож нагадати про звичку чи тренування я не зможу. Скільки нагадувань на день, вирішуєш ти.";

function pushInviteText(input: FtuxDripTemplateInput): string[] {
  if (!input.pushInvite) return [];
  return [
    PUSH_INVITE_LEAD,
    "",
    `Увімкнути сповіщення: ${notificationsUrl(input.appUrl)}`,
    "",
  ];
}

function pushInviteHtml(input: FtuxDripTemplateInput): string {
  if (!input.pushInvite) return "";
  return (
    `<p>${escapeHtml(PUSH_INVITE_LEAD)} ` +
    `<a href="${escapeAttr(notificationsUrl(input.appUrl))}">Увімкнути сповіщення</a>.</p>`
  );
}

function buildDay0(input: FtuxDripTemplateInput): FtuxDripTemplate {
  const hello = greeting(input.recipientName);
  const text = [
    hello,
    "",
    "Sergeant рахує витрати, звички, тренування і їжу в одному застосунку.",
    "",
    "Почни з одного запису в будь-якому модулі, навіть дрібного.",
    "",
    `Перейти в Sergeant: ${input.appUrl}`,
    "",
    textFooter(input.unsubscribeUrl),
  ].join("\n");

  const html = wrapHtml(
    [
      `<p>${escapeHtml(hello)}</p>`,
      `<p>Sergeant рахує витрати, звички, тренування і їжу в одному застосунку.</p>`,
      `<p>Почни з одного запису в будь-якому модулі, навіть дрібного.</p>`,
      ctaButton(input.appUrl, "Перейти в Sergeant"),
      htmlFooter(input.unsubscribeUrl),
    ].join(""),
  );

  return {
    subject: "Sergeant: почни з першого запису",
    text,
    html,
  };
}

function buildDay1(input: FtuxDripTemplateInput): FtuxDripTemplate {
  const hello = greeting(input.recipientName);
  const text = [
    hello,
    "",
    "Минув перший день у Sergeant.",
    "",
    "Почни з одного запису, будь-якого:",
    "",
    "  · Витрата за сьогодні – у Фініку.",
    "  · Звичка, яку хочеш тримати – у Рутині.",
    "  · Обід чи перекус – в Їжі.",
    "  · Тренування чи прогулянка – у Фізруку.",
    "",
    "Щойно зʼявляться твої записи, дашборд покаже їх замість прикладу.",
    "",
    `Відкрити Sergeant: ${input.appUrl}`,
    "",
    ...pushInviteText(input),
    textFooter(input.unsubscribeUrl),
  ].join("\n");

  const html = wrapHtml(
    [
      `<p>${escapeHtml(hello)}</p>`,
      `<p>Минув перший день у Sergeant.</p>`,
      `<p>Почни з одного запису, будь-якого:</p>`,
      `<ul style="padding-left:20px;margin:8px 0">`,
      `<li>Витрата за сьогодні – у Фініку.</li>`,
      `<li>Звичка, яку хочеш тримати – у Рутині.</li>`,
      `<li>Обід чи перекус – в Їжі.</li>`,
      `<li>Тренування чи прогулянка – у Фізруку.</li>`,
      `</ul>`,
      `<p>Щойно зʼявляться твої записи, дашборд покаже їх замість прикладу.</p>`,
      ctaButton(input.appUrl, "Відкрити Sergeant"),
      pushInviteHtml(input),
      htmlFooter(input.unsubscribeUrl),
    ].join(""),
  );

  return {
    subject: "Sergeant: один запис на сьогодні",
    text,
    html,
  };
}

function buildDay3(input: FtuxDripTemplateInput): FtuxDripTemplate {
  const hello = greeting(input.recipientName);
  const text = [
    hello,
    "",
    "Минуло три дні.",
    "",
    "Якщо не зайшло, це нормально. Sergeant має сенс, лише коли полегшує тобі день.",
    "",
    "Хочеш дати ще один шанс, додай сьогодні один запис у будь-якому модулі.",
    "",
    `Повернутись у Sergeant: ${input.appUrl}`,
    "",
    "Що не зайшло, можна написати у відповідь на цей лист. Його прочитає засновник.",
    "",
    ...pushInviteText(input),
    textFooter(input.unsubscribeUrl),
  ].join("\n");

  const html = wrapHtml(
    [
      `<p>${escapeHtml(hello)}</p>`,
      `<p>Минуло три дні.</p>`,
      `<p>Якщо не зайшло, це нормально. Sergeant має сенс, лише коли полегшує тобі день.</p>`,
      `<p>Хочеш дати ще один шанс, додай сьогодні один запис у будь-якому модулі.</p>`,
      ctaButton(input.appUrl, "Повернутись у Sergeant"),
      `<p style="font-size:13px;color:#475569">Що не зайшло, можна написати у відповідь на цей лист. Його прочитає засновник.</p>`,
      pushInviteHtml(input),
      htmlFooter(input.unsubscribeUrl),
    ].join(""),
  );

  return {
    subject: "Як тобі Sergeant?",
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
