import { Link } from "react-router-dom";
import { messages } from "@shared/i18n/uk";
import { MeshBackground } from "@shared/components/layout/MeshBackground";
import { BrandLogo } from "../app/BrandLogo";
import {
  LEGAL_COOKIES_PATH,
  LEGAL_OFFER_PATH,
  LEGAL_PRIVACY_PATH,
  LEGAL_TERMS_PATH,
  PRICING_PATH,
  SIGN_IN_PATH,
} from "../app/appPaths";
import { LegalLinks } from "./LegalLinks";

type LegalPath =
  | typeof LEGAL_PRIVACY_PATH
  | typeof LEGAL_TERMS_PATH
  | typeof LEGAL_COOKIES_PATH
  | typeof LEGAL_OFFER_PATH;

interface LegalSection {
  readonly title: string;
  readonly body: ReadonlyArray<string>;
}

interface LegalDocument {
  readonly eyebrow: string;
  readonly title: string;
  readonly intro: string;
  readonly sections: ReadonlyArray<LegalSection>;
}

interface LegalPageProps {
  readonly pathname: string;
}

const LAST_UPDATED = "6 червня 2026";
const CONTACT_EMAIL = "legal@sergeant.app";
const CONTROLLER_PLACEHOLDER =
  "Sergeant, дані ФОП/засновника будуть внесені перед public launch";

const processors =
  "Stripe, Anthropic, Sentry, PostHog, Resend, Monobank, Railway, Vercel, Firebase/APNs";

const documents: Record<LegalPath, LegalDocument> = {
  [LEGAL_PRIVACY_PATH]: {
    eyebrow: "Privacy Policy",
    title: "Політика приватності",
    intro:
      "Пояснюємо, які дані Sergeant обробляє, навіщо, як довго і як ти можеш керувати своїми правами.",
    sections: [
      {
        title: "Контролер даних",
        body: [
          `Контролер: ${CONTROLLER_PLACEHOLDER}. До фінального запуску ці реквізити мають пройти founder/lawyer review.`,
          `Контакт для питань приватності: ${CONTACT_EMAIL}. Канонічна мова документа — українська.`,
        ],
      },
      {
        title: "Категорії даних",
        body: [
          "Акаунт: email, імʼя, аватар, статус email-верифікації, дата створення.",
          "Фінанси: підключення Monobank, рахунки, транзакції, бюджети й локальні фінансові налаштування.",
          "Здоровʼя та рутини: харчування, тренування, звички, AI-нотатки, пуш-налаштування.",
          "Технічні дані: device/browser metadata, події продукту, помилки, білінг-статуси та audit-логіка.",
        ],
      },
      {
        title: "Процесори",
        body: [
          `Ми використовуємо процесорів для платежів, AI, аналітики, хостингу, email, пушів і банківських інтеграцій: ${processors}.`,
          "Секрети, токени та сирі credentials не включаються в користувацький export і не мають потрапляти в логи.",
        ],
      },
      {
        title: "Твої права",
        body: [
          "Ти можеш запросити export своїх даних, оновити consent preferences або видалити акаунт у Settings.",
          "Запити на доступ, виправлення, обмеження обробки чи заперечення можна надіслати на legal contact.",
        ],
      },
      {
        title: "Зберігання та видалення",
        body: [
          "Після deletion request ми тримаємо до 30 днів grace-період для recovery/audit, далі hard-delete де це технічно можливо.",
          "Частина записів може зберігатися довше, якщо це потрібно для юридичного захисту, бухгалтерії, fraud prevention або безпеки.",
        ],
      },
    ],
  },
  [LEGAL_TERMS_PATH]: {
    eyebrow: "Terms",
    title: "Умови користування",
    intro:
      "Це правила доступу до Sergeant: акаунт, підписка, AI, фінансові та health-модулі, обмеження відповідальності.",
    sections: [
      {
        title: "18+ і не професійна порада",
        body: [
          "Sergeant призначений для користувачів 18+, бо продукт може обробляти фінансові та health-related дані.",
          "AI-відповіді, бюджети, харчування і тренування є інформаційною підтримкою, а не медичною, фінансовою чи юридичною консультацією.",
        ],
      },
      {
        title: "Акаунт і безпека",
        body: [
          "Ти відповідаєш за доступ до свого акаунта, правдивість даних і дозвіл на підключення зовнішніх сервісів.",
          "Ми можемо обмежити доступ при abuse, fraud, порушенні закону або ризику для інших користувачів.",
        ],
      },
      {
        title: "Підписки та скасування",
        body: [
          "Платежі й self-serve керування підпискою проходять через Stripe-hosted checkout і Customer Portal.",
          "Скасування зупиняє майбутні списання; доступ до paid-функцій може діяти до кінця оплаченого періоду.",
        ],
      },
      {
        title: "Повернення коштів",
        body: [
          "Refund requests розглядаються індивідуально з урахуванням закону, технічних збоїв, fraud-ризиків і фактичного використання.",
          "Якщо Stripe або банк повертає платіж примусово, доступ до paid-функцій може бути призупинений.",
        ],
      },
      {
        title: "Зміни умов",
        body: [
          "Ми можемо оновлювати умови до launch і після нього; суттєві зміни будемо помітно показувати в продукті або email.",
          `Питання щодо умов: ${CONTACT_EMAIL}.`,
        ],
      },
    ],
  },
  [LEGAL_COOKIES_PATH]: {
    eyebrow: "Cookie Policy",
    title: "Політика cookies",
    intro:
      "Описуємо cookies, local storage та подібні технології, які потрібні для входу, безпеки, аналітики і product quality.",
    sections: [
      {
        title: "Що ми зберігаємо",
        body: [
          "Strictly necessary: session, auth, security, app state і налаштування, без яких продукт не працює стабільно.",
          "Analytics: події продукту та performance-сигнали для розуміння якості, якщо analytics preference увімкнено.",
        ],
      },
      {
        title: "Локальні дані",
        body: [
          "Sergeant має local-first частини: частина hub/state може жити у браузері чи мобільному сховищі.",
          "Локальний backup/export у Settings не є серверним privacy export, але допомагає перенести власні дані.",
        ],
      },
      {
        title: "Керування згодою",
        body: [
          "У Settings можна керувати analytics, AI memory і push consent preferences.",
          "Вимкнення analytics не блокує essential cookies, які потрібні для входу, безпеки та billing.",
        ],
      },
      {
        title: "Треті сторони",
        body: [
          "Stripe, PostHog, Sentry, Firebase/APNs та інші процесори можуть використовувати власні storage-технології для своїх сервісів.",
          "Ми не продаємо cookie-дані рекламним брокерам.",
        ],
      },
    ],
  },
  [LEGAL_OFFER_PATH]: {
    eyebrow: "Public Offer",
    title: "Публічна оферта",
    intro:
      "Draft-оферта для UA-first public launch: предмет послуги, оплата, підписка, refund rules і контакти.",
    sections: [
      {
        title: "Сторони та предмет",
        body: [
          `Виконавець: ${CONTROLLER_PLACEHOLDER}. Користувач приймає оферту, створюючи акаунт або оплачуючи підписку.`,
          "Предмет: доступ до програмного продукту Sergeant, включно з AI, фінансовими, wellness та productivity-функціями.",
        ],
      },
      {
        title: "Оплата",
        body: [
          "Ціни показуються на pricing page перед оплатою. Платіжна інфраструктура — Stripe-hosted checkout.",
          "Податки, комісії банку або валютна конвертація можуть залежати від платіжного провайдера та країни користувача.",
        ],
      },
      {
        title: "Підписка",
        body: [
          "Підписка поновлюється автоматично, якщо її не скасовано у Stripe Customer Portal до наступного billing period.",
          "Після скасування paid-доступ може зберігатися до кінця вже оплаченого періоду.",
        ],
      },
      {
        title: "Refund policy",
        body: [
          "Повернення коштів можливе за запитом, якщо цього вимагає застосовне право або якщо сталася підтверджена технічна помилка.",
          "Запит має містити email акаунта, дату платежу та короткий опис причини.",
        ],
      },
      {
        title: "Контакти",
        body: [
          `Юридичні та billing-запити: ${CONTACT_EMAIL}.`,
          "Фінальні реквізити ФОП/компанії мають бути внесені до публікації оферти.",
        ],
      },
    ],
  },
};

function isLegalPath(pathname: string): pathname is LegalPath {
  return (
    pathname === LEGAL_PRIVACY_PATH ||
    pathname === LEGAL_TERMS_PATH ||
    pathname === LEGAL_COOKIES_PATH ||
    pathname === LEGAL_OFFER_PATH
  );
}

export function LegalPage({ pathname }: LegalPageProps) {
  const document =
    documents[isLegalPath(pathname) ? pathname : LEGAL_PRIVACY_PATH];

  return (
    <MeshBackground className="min-h-screen overflow-y-auto px-5 py-8 sm:py-12">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <header className="text-center space-y-5">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center justify-center rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45"
            aria-label={messages.legal.homeLogoAria}
          >
            <BrandLogo size="lg" />
          </Link>
          <div className="space-y-3">
            <p className="text-style-overline text-brand-strong">
              {document.eyebrow}
            </p>
            <h1 className="text-style-display text-text">{document.title}</h1>
            <p className="mx-auto max-w-2xl text-style-body text-muted">
              {document.intro}
            </p>
          </div>
          <div className="rounded-3xl border border-warning-soft bg-warning-soft/40 p-4 text-left text-style-body-sm text-text">
            <strong>Founder/lawyer review gate:</strong>{" "}
            {messages.legal.reviewGateNotice}
          </div>
          <p className="text-style-caption text-subtle">
            {messages.legal.lastUpdatedPrefix} {LAST_UPDATED}
          </p>
        </header>

        <article className="space-y-4">
          {document.sections.map((section) => (
            <section
              key={section.title}
              className="rounded-3xl border border-line bg-panel p-5 sm:p-6"
            >
              <h2 className="text-style-headline text-text">{section.title}</h2>
              <div className="mt-3 space-y-3 text-style-body-sm text-muted">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </article>

        <footer className="space-y-4 text-center">
          <LegalLinks />
          <div className="flex flex-wrap items-center justify-center gap-3 text-style-body-sm">
            <Link
              to={PRICING_PATH}
              className="inline-flex min-h-11 items-center px-1 text-brand-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline"
            >
              {messages.legal.goToPricing}
            </Link>
            <span className="text-subtle" aria-hidden="true">
              ·
            </span>
            <Link
              to={SIGN_IN_PATH}
              className="inline-flex min-h-11 items-center px-1 text-brand-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline"
            >
              {messages.legal.signInOrCreate}
            </Link>
          </div>
        </footer>
      </main>
    </MeshBackground>
  );
}

export default LegalPage;
