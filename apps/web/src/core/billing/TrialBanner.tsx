import { pluralUa } from "@sergeant/shared";
import { useInRouterContext, useNavigate } from "react-router-dom";
import { Button } from "@shared/components/ui/Button";
import { usePlan } from "./usePlan";

/**
 * Банер кінця trial і grace (спека `docs/work/specs/access-tiers.md`).
 *
 * Читає `access.state` зі знімка `/api/billing/status`, нічого не виводить
 * з плану сам:
 *   - `trial`: показується за ≤ 2 дні до кінця, в останню добу стає sticky,
 *     щоб «останній шанс» був видимий при скролі хаба на малому екрані;
 *   - `grace`: оплата не пройшла, людина ще має Premium до дати кінця grace.
 * Для `free`, `pro`, під час завантаження і без сесії рендерить `null`,
 * тож caller-и (стек банерів хаба) монтують його безумовно.
 *
 * Push і email про кінець trial свідомо не шлемо: серверного планувальника
 * й email-каналу немає, це лише банер у застосунку.
 *
 * A11y: `role="status"` + `aria-live="polite"`, щоб скрінрідер оголосив
 * зміну відліку без крадіжки фокуса.
 */

export interface TrialBannerProps {
  /**
   * Override "now" for tests / Storybook. Defaults to `Date.now()`.
   * The countdown is computed in whole-day buckets (`Math.ceil` of
   * the remaining ms), so timezone is irrelevant — we never display
   * an hour/minute breakdown here.
   */
  now?: () => number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TRIAL_BANNER_DAYS = 2;

function computeDaysLeft(endIso: string, now: number): number {
  const end = Date.parse(endIso);
  if (Number.isNaN(end)) return Number.NaN;
  return Math.max(0, Math.ceil((end - now) / MS_PER_DAY));
}

const COPY = {
  endsToday: "Trial завершується сьогодні",
  remainingPrefix: "Залишилось",
  trailing: "trial",
  // «Premium» — канонічна назва для людини (рішення D3); серверний id
  // лишається `pro`.
  body: "Оформи Premium, щоб лишити Сержанта без тижневого ліміту, фото їжі й PDF-звіти.",
  cta: "Дивитися плани",
  graceTitle: "Оплата не пройшла",
  graceBodyPrefix: "Онови картку до",
  graceBodySuffix: ", щоб Premium не вимкнувся.",
  graceCta: "Оновити картку",
  dayForms: { one: "день", few: "дні", many: "днів" },
} as const;

function pluralizeDays(days: number): string {
  return pluralUa(days, COPY.dayForms);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Kyiv",
  }).format(new Date(iso));
}

/**
 * Public wrapper — defers to {@link TrialBannerInner} only when a
 * `<Router>` ancestor is present. `HubMainContent`'s unit tests render
 * the hub layout outside `<MemoryRouter>`; calling `useNavigate()` there
 * would throw.
 */
export function TrialBanner(props: TrialBannerProps = {}) {
  const inRouter = useInRouterContext();
  if (!inRouter) return null;
  return <TrialBannerInner {...props} />;
}

function TrialBannerInner({ now = Date.now }: TrialBannerProps) {
  const navigate = useNavigate();
  const { access } = usePlan();

  let headline: string;
  let body: string;
  let cta: string;
  let sticky: boolean;
  let target: string;

  if (access?.state === "trial" && access.trialEndsAt) {
    const daysLeft = computeDaysLeft(access.trialEndsAt, now());
    if (Number.isNaN(daysLeft) || daysLeft > TRIAL_BANNER_DAYS) return null;
    sticky = daysLeft <= 1;
    headline =
      daysLeft === 0
        ? COPY.endsToday
        : `${COPY.remainingPrefix} ${daysLeft} ${pluralizeDays(daysLeft)} ${COPY.trailing}`;
    body = COPY.body;
    cta = COPY.cta;
    target = "/pricing?source=trial_banner";
  } else if (access?.state === "grace" && access.graceEndsAt) {
    sticky = true;
    headline = COPY.graceTitle;
    body = `${COPY.graceBodyPrefix} ${formatDate(access.graceEndsAt)}${COPY.graceBodySuffix}`;
    cta = COPY.graceCta;
    target = "/settings?billing=manage";
  } else {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-trial-banner-variant={sticky ? "sticky" : "inline"}
      className={
        sticky
          ? "sticky top-0 z-30 px-5 pt-2 pb-2 max-w-lg mx-auto w-full"
          : "px-5 max-w-lg mx-auto w-full mb-2"
      }
    >
      <div
        className={
          sticky
            ? "rounded-2xl border border-warning/40 bg-warning-soft text-warning-strong dark:text-amber-100 px-4 py-3 flex items-center gap-3 shadow-sm"
            : "rounded-2xl border border-warning/30 bg-warning-soft text-warning-strong dark:text-amber-100 px-4 py-3 flex items-center gap-3"
        }
      >
        <div className="min-w-0 flex-1">
          <p className="text-style-label">{headline}</p>
          <p className="text-style-caption opacity-80">{body}</p>
        </div>
        <Button
          variant="solid"
          size="sm"
          onClick={() => navigate(target)}
          className="shrink-0 font-semibold"
        >
          {cta}
        </Button>
      </div>
    </div>
  );
}
