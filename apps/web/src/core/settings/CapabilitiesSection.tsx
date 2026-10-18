/**
 * Last validated: 2026-08-03
 * Status: Active
 *
 * Обʼєднаний блок «Можливості» в Налаштуваннях.
 *
 * До 2026-08-03 це були дві сусідні секції з однаковою семантикою:
 *   - «Загальні» → підгрупа «Знайомство з додатком» з двома кнопками
 *     («Що вміє застосунок» + «Почати знайомство з початку»);
 *   - «Що вміє Сержант» → лаунчер каталогу інструментів чату.
 *
 * Користувач бачив два блоки, які відповідають на одне питання «а що тут
 * взагалі є», і мусив здогадуватись, чим «додаток» відрізняється від
 * «Сержанта». Тепер це один блок із двома явними опціями:
 *   1. Що вміє застосунок → `/capabilities` (розділи застосунку).
 *   2. Що вміє Сержант → `/assistant` (інструменти AI-асистента в чаті).
 *
 * «Почати знайомство з початку» прибрано: це був деструктивний за відчуттям
 * ре-онбординг (скидання FTUX-прапорців + редірект на `/welcome`) у блоці,
 * який в іншому лише читає. Скидання даних живе в «Додатково → PWA та офлайн»
 * і «Експорт/імпорт JSON».
 */
import { useNavigate } from "react-router-dom";
import { messages } from "@shared/i18n/uk";
import { ASSISTANT_PATH, CAPABILITIES_PATH } from "../app/appPaths";
import { SettingsGroup } from "./SettingsPrimitives";

interface CapabilityLink {
  id: string;
  label: string;
  description: string;
  href: string;
  testId: string;
}

const LINKS: readonly CapabilityLink[] = [
  {
    id: "app",
    label: messages.onboarding.tourLaunchLabel,
    description: messages.onboarding.appCapabilitiesHint,
    href: CAPABILITIES_PATH,
    testId: "open-app-capabilities",
  },
  {
    id: "assistant",
    label: messages.sergeant.capabilitiesSectionTitle,
    description: messages.sergeant.capabilitiesSectionBody,
    href: ASSISTANT_PATH,
    testId: "open-assistant-catalogue",
  },
];

export function CapabilitiesSection() {
  const navigate = useNavigate();

  return (
    <SettingsGroup title={messages.onboarding.capabilitiesGroupTitle}>
      <ul className="divide-y divide-line border-y border-line">
        {LINKS.map((link) => (
          <li key={link.id}>
            <button
              type="button"
              onClick={() => navigate(link.href)}
              data-testid={link.testId}
              className="flex w-full min-h-[56px] items-center py-3 text-left text-text transition-colors hover:bg-panel focus-ring"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-style-label-lg font-semibold text-text">
                  {link.label}
                </span>
                <span className="mt-1 block text-style-label text-muted">
                  {link.description}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </SettingsGroup>
  );
}
