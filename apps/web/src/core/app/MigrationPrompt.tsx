import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";

interface MigrationPromptProps {
  onUpload: () => void;
  onSkip: () => void;
  syncing: boolean;
}

export function MigrationPrompt({
  onUpload,
  onSkip,
  syncing,
}: MigrationPromptProps) {
  return (
    <div className="min-h-dvh bg-bg flex items-center justify-center p-6 page-enter">
      <Card
        variant="elevated"
        radius="xl"
        padding="xl"
        className="max-w-sm w-full space-y-5"
      >
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto bg-brand-500/10 rounded-2xl flex items-center justify-center text-brand-strong dark:text-brand">
            <Icon name="upload" size={28} strokeWidth={1.8} />
          </div>
          <h2 className="text-xl font-bold text-text">
            Локальні дані знайдено
          </h2>
          <p className="text-sm text-muted leading-relaxed">
            У вас є дані на цьому пристрої, які ще не збережено в хмарі. Бажаєте
            завантажити їх у свій акаунт?
          </p>
        </div>
        <div className="space-y-2">
          <Button
            type="button"
            onClick={onUpload}
            variant="primary"
            size="lg"
            loading={syncing}
            className="w-full"
          >
            {syncing ? "Завантаження…" : "Завантажити в хмару"}
          </Button>
          <Button
            type="button"
            onClick={onSkip}
            variant="secondary"
            size="lg"
            className="w-full"
          >
            Пропустити
          </Button>
        </div>
      </Card>
    </div>
  );
}
