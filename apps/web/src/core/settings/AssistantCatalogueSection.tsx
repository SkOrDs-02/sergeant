import { useNavigate } from "react-router-dom";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";
import { SettingsGroup } from "./SettingsPrimitives";

/**
 * Settings entry that links to the Assistant capability catalogue
 * (`/assistant`). Surfaces what the chat can do without forcing the user
 * to type `/help` or scroll through chip-strips. The catalogue itself is
 * a full-screen URL-addressable route, so we just render a launcher here.
 */
export function AssistantCatalogueSection() {
  const navigate = useNavigate();
  return (
    <SettingsGroup
      title={messages.sergeant.capabilitiesSectionTitle}
      icon="sparkles"
    >
      <p className="text-style-body text-subtle leading-relaxed">
        {messages.sergeant.capabilitiesSectionBody}
      </p>
      <Button
        variant="secondary"
        size="md"
        onClick={() => navigate("/assistant")}
        className="w-full"
        data-testid="open-assistant-catalogue"
      >
        <Icon name="sparkles" size={16} className="mr-2" />
        {messages.sergeant.capabilitiesOpenLabel}
      </Button>
    </SettingsGroup>
  );
}
