import { Button, FeatureSpotlight } from "@shared/components/ui";
import { Sec, Group } from "../_shared";

export function OnboardingSection() {
  return (
    <Sec id="onboarding" title="Онбординг">
      <Group label="FeatureSpotlight">
        <div className="flex flex-wrap gap-4">
          <FeatureSpotlight
            id="demo-spotlight-top"
            title="Підказка зверху"
            description="Це демо підказки з позицією top"
            placement="top"
          >
            <Button variant="secondary" size="sm">
              Hover me (top)
            </Button>
          </FeatureSpotlight>
          <FeatureSpotlight
            id="demo-spotlight-bottom"
            title="Підказка знизу"
            description="Це демо підказки з позицією bottom"
            placement="bottom"
          >
            <Button variant="secondary" size="sm">
              Hover me (bottom)
            </Button>
          </FeatureSpotlight>
        </div>
      </Group>
    </Sec>
  );
}
