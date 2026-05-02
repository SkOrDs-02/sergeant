import { Button, useCelebration } from "@shared/components/ui";
import { Sec, Group } from "../_shared";

export function CelebrationSection() {
  const { success, achievement, confetti, goalCompleted, streak } =
    useCelebration();
  return (
    <Sec id="celebration" title="Святкування">
      <Group label="CelebrationModal">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="success"
            size="sm"
            onClick={() => success("Збережено!", "Дані успішно оновлено")}
          >
            Success
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              achievement(
                "Перша транзакція!",
                "Ти зробив перший крок до фінансової свободи",
                [
                  { icon: "💰", label: "Фінансист" },
                  { icon: "📊", label: "Аналітик" },
                ],
              )
            }
          >
            Achievement
          </Button>
          <Button
            variant="finyk"
            size="sm"
            onClick={() => confetti("Вітаю!", "Ти досяг нового рівня!", "high")}
          >
            Confetti
          </Button>
          <Button
            variant="fizruk"
            size="sm"
            onClick={() => goalCompleted("Тренування", 45, "хв", "fizruk")}
          >
            Goal
          </Button>
          <Button
            variant="routine"
            size="sm"
            onClick={() => streak(7, "7 днів поспіль!")}
          >
            Streak
          </Button>
        </div>
      </Group>
    </Sec>
  );
}
