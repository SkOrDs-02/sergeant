import { useNavigate } from "react-router-dom";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
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
    <SettingsGroup title="Можливості асистента" emoji="✨">
      <p className="text-sm text-subtle leading-relaxed">
        ~60 інструментів, які може запустити AI-асистент: фінанси, тренування,
        звички, харчування, аналітика, утиліти, пам&apos;ять. Тапни картку — і
        одразу побачиш приклади команд.
      </p>
      <Button
        variant="secondary"
        size="md"
        onClick={() => navigate("/assistant")}
        className="w-full"
        data-testid="open-assistant-catalogue"
      >
        <Icon name="sparkles" size={16} className="mr-2" />
        Відкрити каталог
      </Button>
    </SettingsGroup>
  );
}
