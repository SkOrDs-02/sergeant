import { useEffect, useRef, useState } from "react";
import { Modal } from "@shared/components/ui/Modal";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";

/**
 * Повноекранний перегляд двох кадрів вправи.
 *
 * Монтується лише поки відкритий: скидання кадру й зупинка програвання
 * робляться розмонтуванням у батька, а не ефектом на `open`.
 *
 * Кадри це не галерея різних фото, а дві фази ОДНОГО руху: старт і кінець.
 * Тому головний елемент тут не збільшення (вихідні файли 480×320, зум показав
 * би пікселі, а не деталі), а чергування кадрів: саме воно проявляє
 * траєкторію. Керування навмисно одне на весь стан (тап по фото + кнопка
 * «Рух»): окремий перемикач «Початок/Кінець» був би третім способом робити
 * те саме для двох значень.
 */

const t = messages.fizruk.photoViewer;

// Автоперемикання стартує лише явним натисканням і тією ж кнопкою
// зупиняється, тож окремої гілки під `prefers-reduced-motion` тут немає:
// рух ніколи не починається сам (WCAG 2.2.2).
/** Повільніше за це рух читається як дві окремі картинки, швидше - миготить. */
const PLAYBACK_MS = 800;

export interface ExercisePhotoViewerProps {
  open: boolean;
  onClose: () => void;
  /** Два кадри руху; менше двох - чергувати нема чого. */
  images: string[];
  title: string;
}

export function ExercisePhotoViewer({
  open,
  onClose,
  images,
  title,
}: ExercisePhotoViewerProps) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const canAlternate = images.length > 1;

  useEffect(() => {
    if (!playing || !canAlternate) return;
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, PLAYBACK_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [playing, canAlternate, images.length]);

  if (!images.length) return null;

  const current = images[index] ?? images[0] ?? "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="xl"
      closeLabel={t.closeLabel}
    >
      <button
        type="button"
        className="block w-full rounded-2xl overflow-hidden border border-line bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fizruk"
        onClick={() => {
          if (!canAlternate) return;
          setPlaying(false);
          setIndex((i) => (i + 1) % images.length);
        }}
        aria-label={canAlternate ? t.nextFrameLabel : title}
      >
        <img
          src={current}
          alt={`${title} - ${index === 0 ? t.startAlt : t.endAlt}`}
          decoding="async"
          className="w-full object-contain"
        />
      </button>

      {canAlternate && (
        <div className="mt-4">
          <Button
            variant="secondary"
            className="h-11 w-full"
            onClick={() => setPlaying((p) => !p)}
            aria-pressed={playing}
          >
            <Icon name={playing ? "pause" : "play"} size={16} aria-hidden />
            {playing ? t.stopLabel : t.playLabel}
          </Button>
        </div>
      )}

      <p className="mt-3 text-style-caption text-subtle leading-snug">
        {canAlternate ? t.hint : t.singleFrame}
      </p>
    </Modal>
  );
}
