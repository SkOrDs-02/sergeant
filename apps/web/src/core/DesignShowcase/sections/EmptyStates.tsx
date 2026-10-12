/**
 * @status Active
 * @owner @Skords-01
 *
 * DesignShowcase section — EmptyState primitive gallery.
 *
 * Renders every `size × variant` combo plus the three error pages
 * embedded inline so design reviewers can see the whole empty/error
 * story in one scroll without navigating to `/404` etc.
 */
import { Button, Card, EmptyState, Icon } from "@shared/components/ui";
import { Sec, Group } from "../_shared/primitives";
import {
  EmptyListIllustration,
  NoResultsIllustration,
  OfflineIllustration,
  ServerErrorIllustration,
  NotFoundIllustration,
  SuccessCelebrationIllustration,
} from "@assets/illustrations";
import type { EmptyStateSize } from "@shared/components/ui";

const SIZES: EmptyStateSize[] = ["sm", "md", "lg"];
const VARIANTS = ["neutral", "info", "success", "warning", "danger"];

export function EmptyStatesSection() {
  return (
    <Sec id="empty-states" title="EmptyState">
      {/* ── Sizes ───────────────────────────────── */}
      <Group label="Розміри (size)">
        <div className="space-y-4">
          {SIZES.map((s) => (
            <Card key={s} padding="none">
              <EmptyState
                size={s}
                title={`size="${s}"`}
                description="Опис порожнього стану"
                primaryAction={
                  <Button variant="primary" size={s === "lg" ? "lg" : "md"}>
                    Дія
                  </Button>
                }
              />
            </Card>
          ))}
        </div>
      </Group>

      {/* ── Variants ────────────────────────────── */}
      <Group label="Варіанти (variant)">
        <div className="space-y-4">
          {VARIANTS.map((v) => (
            <Card key={v} padding="none">
              <EmptyState
                size="md"
                eyebrow={v.toUpperCase()}
                title={`variant="${v}"`}
                description="Контекстне повідомлення з потрібним тоном."
                primaryAction={
                  <Button variant="primary" size="md">
                    Основна дія
                  </Button>
                }
                secondaryAction={
                  <Button variant="secondary" size="md">
                    Другорядна
                  </Button>
                }
                hint="Підказка для variant"
              />
            </Card>
          ))}
        </div>
      </Group>

      {/* ── Illustrations ───────────────────────── */}
      <Group label="Ілюстрації">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {(
            [
              ["EmptyList", EmptyListIllustration],
              ["NoResults", NoResultsIllustration],
              ["Offline", OfflineIllustration],
              ["ServerError", ServerErrorIllustration],
              ["NotFound", NotFoundIllustration],
              ["SuccessCelebration", SuccessCelebrationIllustration],
            ] as const
          ).map(([label, Comp]) => (
            <Card
              key={label}
              padding="md"
              className="flex flex-col items-center gap-2"
            >
              <Comp size={100} />
              <span className="text-style-code text-muted">{label}</span>
            </Card>
          ))}
        </div>
      </Group>

      {/* ── Error pages (inline previews) ───────── */}
      <Group label="Error-сторінки">
        <div className="space-y-4">
          <Card padding="none">
            <EmptyState
              size="lg"
              eyebrow="404"
              title="Сторінку не знайдено"
              description="Здається, ця адреса вже не існує."
              primaryAction={
                <Button variant="primary" size="lg" disabled>
                  <Icon name="home" size="md" />
                  На головну
                </Button>
              }
            />
          </Card>
          <Card padding="none">
            <EmptyState
              size="lg"
              eyebrow="500"
              title="Щось пішло не так"
              description="Сервер тимчасово не зміг обробити запит."
              primaryAction={
                <Button variant="primary" size="lg" disabled>
                  <Icon name="refresh-cw" size="md" />
                  Оновити сторінку
                </Button>
              }
            />
          </Card>
          <Card padding="none">
            <EmptyState
              size="lg"
              eyebrow="Офлайн"
              title="Немає зʼєднання"
              description="Дані збережуться локально і синхронізуються, коли зʼєднання повернеться."
              primaryAction={
                <Button variant="primary" size="lg" disabled>
                  <Icon name="refresh-cw" size="md" />
                  Спробувати ще
                </Button>
              }
            />
          </Card>
        </div>
      </Group>
    </Sec>
  );
}
