import { useNavigate } from "react-router-dom";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-svh flex flex-col items-center justify-center gap-6 p-8 text-center bg-bg">
      <div className="w-20 h-20 rounded-3xl bg-panelHi flex items-center justify-center">
        <Icon
          name="map-pin-off"
          size={36}
          strokeWidth={1.5}
          className="text-muted"
        />
      </div>
      <div className="space-y-1.5">
        <p className="text-style-overline text-muted">404</p>
        <h1 className="text-style-title text-text">Сторінку не знайдено</h1>
        <p className="text-sm text-muted max-w-xs mx-auto">
          Схоже, ця адреса не існує. Перейди на головний екран.
        </p>
      </div>
      <Button
        type="button"
        variant="primary"
        onClick={() => navigate("/", { replace: true })}
      >
        <Icon name="home" size={16} />
        На головну
      </Button>
    </div>
  );
}
