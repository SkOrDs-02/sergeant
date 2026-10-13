import { useNavigate } from "react-router-dom";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { IconButton } from "@shared/components/ui/IconButton";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
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

export interface CapabilitiesPageProps {
  /** Закриття повноекранної поверхні. */
  onClose?: (() => void) | undefined;
}

function CapabilityCard({ item }: { item: Capability }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate(item.href)}
      data-testid={`capability-${item.id}`}
      className={cn(
        "w-full text-left min-h-11 py-4 border-b border-line",
        "hover:bg-panel",
        "transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
        "focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
      )}
    >
      <span className="flex-1 min-w-0">
        <span className="block text-style-label text-text">{item.title}</span>
        {/* Founder-ux-review round 2 (O4): "scenario first, details after" —
            `quickAction` (30-second action) renders ABOVE `description`
            (supporting detail), so the newcomer-facing role of this page
            reads distinctly from `/assistant`'s exhaustive tool catalogue. */}
        <span
          data-testid={`capability-quick-action-${item.id}`}
          className="block text-style-body text-text mt-1 leading-relaxed"
        >
          {item.quickAction}
        </span>
        <span className="block text-style-caption text-subtle mt-1 leading-relaxed">
          {item.description}
        </span>
      </span>
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
        <Card prominence="panel" padding="md">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="flex items-center gap-2 text-style-title text-text leading-tight">
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
