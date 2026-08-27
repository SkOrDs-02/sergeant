/**
 * Last validated: 2026-08-03
 * Status: Active
 *
 * Обʼєднаний блок «Можливості» в Налаштуваннях.
 *
 * До 2026-08-03 це були дві сусідні секції з однаковою семантикою:
 *   - «Загальні» → підгрупа «Знайомство з додатком» з двома кнопками
 *     («Що вміє додаток» + «Почати знайомство з початку»);
 *   - «Що вміє Сержант» → лаунчер каталогу інструментів чату.
 *
 * Користувач бачив два блоки, які відповідають на одне питання «а що тут
 * взагалі є», і мусив здогадуватись, чим «додаток» відрізняється від
 * «Сержанта». Тепер це один блок із двома явними опціями:
 *   1. Що вміє додаток → `/capabilities` (розділи застосунку).
 *   2. Що вміє Сержант → `/assistant` (інструменти AI-асистента в чаті).
 *
 * «Почати знайомство з початку» прибрано: це був деструктивний за відчуттям
 * ре-онбординг (скидання FTUX-прапорців + редірект на `/welcome`) у блоці,
 * який в іншому лише читає. Скидання даних живе в «Додатково → PWA та офлайн»
 * і «Експорт/імпорт JSON».
 */
import { useNavigate } from "react-router-dom";
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";
import { ASSISTANT_PATH, CAPABILITIES_PATH } from "../app/appPaths";
import { SettingsGroup } from "./SettingsPrimitives";

interface CapabilityLink {
  id: string;
  icon: string;
  label: string;
  description: string;
  href: string;
  testId: string;
}

const LINKS: readonly CapabilityLink[] = [
  {
    id: "app",
    icon: "compass",
    label: messages.onboarding.tourLaunchLabel,
    description: messages.onboarding.appCapabilitiesHint,
    href: CAPABILITIES_PATH,
    testId: "open-app-capabilities",
  },
  {
    id: "assistant",
    icon: "sparkles",
    label: messages.sergeant.capabilitiesSectionTitle,
    description: messages.sergeant.capabilitiesSectionBody,
    href: ASSISTANT_PATH,
    testId: "open-assistant-catalogue",
  },
];

export function CapabilitiesSection() {
  const navigate = useNavigate();

  return (
    <SettingsGroup
      title={messages.onboarding.capabilitiesGroupTitle}
      icon="compass"
    >
      <ul className="space-y-3">
        {LINKS.map((link) => (
          <li key={link.id}>
            <button
              type="button"
              onClick={() => navigate(link.href)}
              data-testid={link.testId}
              className="flex w-full min-h-[44px] items-start gap-3 rounded-2xl border border-line/60 bg-surface-soft-glass p-3 text-left shadow-soft transition-[background-color,border-color] hover:border-brand/40 hover:bg-surface-strong-glass active:bg-surface-soft-glass focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45"
            >
              <span
                aria-hidden
                className="mt-0.5 flex shrink-0 items-center justify-center rounded-xl border border-surface-line bg-surface-soft-glass p-1.5 text-muted-v2"
              >
                <Icon name={link.icon} size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-style-label text-text">
                  {link.label}
                </span>
                <span className="mt-1 block text-style-caption text-subtle leading-relaxed">
                  {link.description}
                </span>
              </span>
              <Icon
                name="chevron-right"
                size={16}
                className="mt-1 shrink-0 text-muted"
                aria-hidden
              />
            </button>
          </li>
        ))}
      </ul>
    </SettingsGroup>
  );
}
