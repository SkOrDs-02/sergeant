/**
 * Sergeant Hub-core — AssistantCatalogueSection (React Native)
 *
 * Mobile mirror of `apps/web/src/core/settings/AssistantCatalogueSection.tsx`.
 *
 * A thin launcher card that pushes `/assistant` (the full-screen
 * capability catalogue). The catalogue itself is a route-addressable
 * page so the settings shell stays a list of collapsible cards rather
 * than embedding the long catalogue grid inline.
 *
 * Source-of-truth for the rendered capabilities is
 * `ASSISTANT_CAPABILITIES` in `@sergeant/shared` — same registry the
 * web settings entry, the web HubChat quick-action chips, and the
 * server `SYSTEM_PREFIX` all read from.
 */

import { Text } from "react-native";
import { router, type Href } from "expo-router";

import { Button } from "@/components/ui/Button";

import { SettingsGroup } from "./SettingsPrimitives";

export function AssistantCatalogueSection() {
  return (
    <SettingsGroup title="Що вміє Сержант" emoji="✨">
      <Text className="text-xs text-fg-muted leading-snug">
        ~60+ інструментів, які може запустити Сержант: фінанси, тренування,
        звички, харчування, аналітика, утиліти, памʼять. Тапни, побачиш приклади
        команд.
      </Text>
      <Button
        variant="secondary"
        size="md"
        onPress={() => router.push("/assistant" as Href)}
        testID="open-assistant-catalogue"
      >
        Відкрити каталог
      </Button>
    </SettingsGroup>
  );
}

export default AssistantCatalogueSection;
