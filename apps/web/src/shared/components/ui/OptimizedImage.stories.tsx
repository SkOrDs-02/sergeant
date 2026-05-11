import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  OptimizedImage,
  OptimizedAvatar,
  OptimizedHeroImage,
  OptimizedThumbnail,
} from "./OptimizedImage";

/**
 * `OptimizedImage` — Lazy-loaded зображення з автоматичним aspect-ratio,
 * skeleton-placeholder під час завантаження та error-fallback.
 *
 * Варіанти: базовий / `OptimizedAvatar` / `OptimizedHeroImage` / `OptimizedThumbnail`.
 */
const meta: Meta<typeof OptimizedImage> = {
  title: "UI / OptimizedImage",
  component: OptimizedImage,
  parameters: {
    layout: "centered",
    chromatic: { viewports: [375, 768] },
  },
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof OptimizedImage>;

export const Default: Story = {
  args: {
    src: "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=400&h=300&fit=crop",
    alt: "Приклад зображення",
    aspectRatio: "4/3",
    wrapperClassName: "w-64 rounded-2xl overflow-hidden",
    priority: true,
  },
};

export const Loading: Story = {
  args: {
    src: undefined,
    alt: "Завантаження",
    aspectRatio: "16/9",
    wrapperClassName: "w-72 rounded-2xl overflow-hidden",
    priority: false,
  },
};

export const Error: Story = {
  args: {
    src: "https://invalid-url.example/broken.jpg",
    alt: "Зображення не завантажилось",
    aspectRatio: "4/3",
    wrapperClassName: "w-64 rounded-2xl overflow-hidden",
    priority: true,
  },
};

export const WithCustomFallback: Story = {
  args: {
    src: "https://invalid-url.example/broken.jpg",
    alt: "Логотип компанії",
    aspectRatio: "1/1",
    wrapperClassName: "w-24 rounded-xl overflow-hidden",
    priority: true,
    fallback: (
      <div className="w-24 h-24 bg-panelHi rounded-xl flex items-center justify-center text-2xl">
        🏢
      </div>
    ),
  },
};

export const Avatar: StoryObj<typeof OptimizedAvatar> = {
  render: () => (
    <div className="flex gap-3 items-center">
      <OptimizedAvatar
        src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&h=80&fit=crop"
        alt="Аватар користувача"
        size={40}
        priority
      />
      <OptimizedAvatar
        src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop"
        alt="Аватар 2"
        size={56}
        priority
      />
      <OptimizedAvatar
        src="https://invalid.example/broken.jpg"
        alt="Аватар з помилкою"
        size={40}
        priority
      />
    </div>
  ),
};

export const Hero: StoryObj<typeof OptimizedHeroImage> = {
  render: () => (
    <div className="w-80">
      <OptimizedHeroImage
        src="https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=800&h=450&fit=crop"
        alt="Hero зображення"
        priority
      />
    </div>
  ),
};

export const Thumbnails: StoryObj<typeof OptimizedThumbnail> = {
  render: () => (
    <div className="flex gap-3">
      <OptimizedThumbnail
        src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=96&h=96&fit=crop"
        alt="sm thumbnail"
        size="sm"
        priority
      />
      <OptimizedThumbnail
        src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=96&h=96&fit=crop"
        alt="md thumbnail"
        size="md"
        priority
      />
      <OptimizedThumbnail
        src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=96&h=96&fit=crop"
        alt="lg thumbnail"
        size="lg"
        priority
      />
    </div>
  ),
};
