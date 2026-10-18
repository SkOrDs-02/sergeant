import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";
import { ContentGroup, ContentRow } from "./ContentGroup";

const meta: Meta<typeof ContentGroup> = {
  title: "UI / ContentGroup",
  component: ContentGroup,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof ContentGroup>;

export const ConnectedStatus: Story = {
  render: () => (
    <div className="max-w-sm bg-bg p-5">
      <p className="mb-3 text-style-overline text-text">Monobank</p>
      <ContentGroup variant="bounded">
        <ContentRow>
          <p className="text-style-label text-text">Синхронізація активна</p>
          <p className="text-style-caption text-subtle">7 рахунків</p>
        </ContentRow>
        <ContentRow className="flex gap-2">
          <Button variant="outline" className="flex-1">
            Оновити
          </Button>
          <Button variant="outline" tone="danger" className="flex-1">
            Відʼєднати
          </Button>
        </ContentRow>
      </ContentGroup>
    </div>
  ),
};

export const InformationalRows: Story = {
  render: () => (
    <div className="max-w-sm bg-bg p-5">
      <p className="mb-3 text-style-overline text-text">Твої дані</p>
      <ContentGroup>
        <ContentRow>
          <p className="text-style-label text-text">Памʼять</p>
          <p className="mt-1 text-style-body text-subtle">
            Переглянути або стерти факти можна у Профілі.
          </p>
        </ContentRow>
        <ContentRow>
          <p className="text-style-label text-text">Видалення акаунта</p>
          <p className="mt-1 text-style-body text-subtle">
            Керування акаунтом — у Небезпечній зоні Профілю.
          </p>
        </ContentRow>
      </ContentGroup>
    </div>
  ),
};

export const IntegrationWithOperations: Story = {
  render: () => (
    <div className="max-w-sm bg-bg p-5">
      <p className="mb-3 text-style-overline text-text">Monobank</p>
      <ContentGroup
        as="section"
        variant="bounded"
        className="p-4"
        aria-label="Monobank"
      >
        <ContentGroup>
          <ContentRow>
            <p className="text-style-label text-text">Синхронізація активна</p>
            <p className="text-style-caption text-subtle">7 рахунків</p>
          </ContentRow>
          <ContentRow className="flex gap-2">
            <Button variant="outline" className="flex-1">
              Історія
            </Button>
            <Button variant="outline" tone="danger" className="flex-1">
              Відʼєднати
            </Button>
          </ContentRow>
        </ContentGroup>
        <ContentRow className="mt-4">
          <p className="text-style-label text-text">Оновлення операцій</p>
          <p className="mt-1 text-style-caption text-subtle">
            Перевірити нові операції Monobank.
          </p>
          <Button variant="outline" className="mt-3 w-full">
            Оновити дані
          </Button>
        </ContentRow>
        <ContentRow>
          <p className="text-style-label text-text">Локальні копії операцій</p>
          <p className="mt-1 text-style-caption text-subtle">
            Очистити збережені копії на цьому пристрої.
          </p>
          <Button variant="outline" tone="danger" className="mt-3 w-full">
            Очистити кеш операцій
          </Button>
        </ContentRow>
      </ContentGroup>
    </div>
  ),
};
