import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";

interface IOSInstallBannerProps {
  onDismiss: () => void;
}

export function IOSInstallBanner({ onDismiss }: IOSInstallBannerProps) {
  return (
    <div className="px-5 max-w-lg mx-auto w-full mb-2">
      <Card
        variant="default"
        radius="lg"
        padding="none"
        className="px-4 py-3 flex items-start gap-3"
      >
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary"
            aria-hidden
          >
            <path d="M12 2v13M7 7l5-5 5 5" />
            <path d="M20 21H4a2 2 0 0 1-2-2v-1" />
            <path d="M22 21v-1a2 2 0 0 0-2-2" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text">
            Додай на головний екран
          </p>
          <p className="text-xs text-muted mt-0.5 leading-snug">
            Щоб отримувати push-сповіщення на iOS, відкрий меню{" "}
            <span className="font-semibold">Поділитися</span>{" "}
            <span aria-hidden>⬆️</span> і обери{" "}
            <span className="font-semibold">На початковий екран</span>.
          </p>
        </div>
        <Button
          variant="ghost"
          size="xs"
          iconOnly
          onClick={onDismiss}
          aria-label="Закрити"
          className="shrink-0 -mt-1 -mr-1 text-muted hover:text-text"
        >
          <Icon name="close" size={16} />
        </Button>
      </Card>
    </div>
  );
}
