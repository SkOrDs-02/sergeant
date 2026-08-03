import { useNavigate } from "react-router-dom";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { IconButton } from "@shared/components/ui/IconButton";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
import type { HubModuleId } from "@shared/lib/modules/hubNav";
import { CAPABILITY_GROUPS, type Capability } from "./capabilityRegistry";

/**
 * `/capabilities` — «що вміє додаток».
 *
 * Замінює колишню «вступну екскурсію» в Налаштуваннях, яка насправді лише
 * переграла вітальний екран (`OnboardingWizard mode="tour"`) і нічого не
 * розповідала про функціонал. Каталог відповідає на питання новачка «а що тут
 * взагалі є» і на питання того, хто повернувся через місяць.
 *
 * Не плутати з `/assistant`: там каталог інструментів чату, тут — самого
 * застосунку.
 */

/**
 * Акцент іконки за модулем. Зареєстровані `-soft` / `-soft-border` пари
 * замість сирого RGB (Hard Rule #12 — акцент модуля не тече назовні).
 */
const MODULE_ICON_ACCENT: Record<HubModuleId, string> = {
  finyk: "bg-finyk-soft border-finyk-soft-border text-finyk",
  fizruk: "bg-fizruk-soft border-fizruk-soft-border text-fizruk",
  routine: "bg-routine-soft border-routine-soft-border text-routine",
  nutrition: "bg-nutrition-soft border-nutrition-soft-border text-nutrition",
};

export interface CapabilitiesPageProps {
  /** Закриття повноекранної поверхні. */
  onClose?: (() => void) | undefined;
}

function CapabilityCard({ item }: { item: Capability }) {
  const navigate = useNavigate();
  const accent = item.module ? MODULE_ICON_ACCENT[item.module] : "";

  return (
    <button
      type="button"
      onClick={() => navigate(item.href)}
      data-testid={`capability-${item.id}`}
      className={cn(
        "w-full text-left flex items-start gap-3 p-4 rounded-2xl",
        "bg-surface-soft-glass border border-surface-line shadow-soft",
        "hover:border-brand/40 hover:bg-surface-strong-glass",
        "active:scale-[0.99] transition-[background-color,border-color,transform]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
        "focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center",
          accent || "bg-surface-soft-glass border-surface-line text-muted-v2",
        )}
      >
        <Icon name={item.icon} size={20} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-style-label text-text">{item.title}</span>
        <span className="block text-style-caption text-subtle mt-1 leading-relaxed">
          {item.description}
        </span>
      </span>
      <Icon
        name="chevron-right"
        size={16}
        className="shrink-0 mt-1 text-muted"
        aria-hidden
      />
    </button>
  );
}

export function CapabilitiesPage({ onClose }: CapabilitiesPageProps) {
  return (
    // AI-CONTEXT: `#root` — `100dvh; overflow:hidden` (base.css), тож скролу
    // документа немає: повноекранний маршрут мусить володіти власним
    // скрол-контейнером.
    // Без нього каталог просто обрізався на висоті вікна — рівно та сама
    // граблі, що вже наступив `/assistant`. `h-dvh` (самодостатні 100dvh), а
    // не `h-app-dvh` (=height:100%), бо обгортки цього маршруту не мають
    // визначеної висоти, від якої відсоток міг би відрахуватися.
    <main
      id="main"
      tabIndex={-1}
      className="h-dvh overflow-y-auto overscroll-contain bg-bg outline-none safe-area-pt"
    >
      <div className="max-w-2xl mx-auto flex flex-col gap-4 px-4 pt-3 pb-8">
        <Card prominence="glass" radius="lg" padding="md">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="shrink-0 w-11 h-11 rounded-2xl bg-brand/10 text-brand-strong flex items-center justify-center dark:bg-brand/15"
            >
              <Icon name="compass" size={20} />
            </span>
            <div className="flex-1 min-w-0">
              <h1 className="text-style-title text-text leading-tight">
                {messages.onboarding.tourLaunchLabel}
              </h1>
              <p className="text-style-body text-subtle mt-1 leading-relaxed">
                {messages.sergeant.appCapabilitiesIntro}
              </p>
            </div>
            {onClose && (
              <IconButton
                aria-label={messages.actions.close}
                onClick={onClose}
                variant="ghost"
                size="sm"
              >
                <Icon name="close" size={18} />
              </IconButton>
            )}
          </div>
        </Card>

        {CAPABILITY_GROUPS.map((group) => (
          <section key={group.id} className="flex flex-col gap-2">
            <SectionHeading as="h2" size="xs" variant="muted">
              {group.title}
            </SectionHeading>
            <div className="flex flex-col gap-2">
              {group.items.map((item) => (
                <CapabilityCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

export default CapabilitiesPage;
