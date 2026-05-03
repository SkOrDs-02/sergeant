/**
 * @scaffolded
 * @owner @Skords-01
 * @addedIn e43120a3 (perf(web,server): frontend & backend optimization)
 * @nextStep Replace `<img>` usage in Finyk merchant-logos and Hub bento-card
 *           illustrations once we have a CDN/loader story.
 *
 * Scaffolded but not yet imported by any consumer. Do NOT delete as part of
 * dead-code cleanup — see Hard Rule #15 in AGENTS.md.
 */
import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type ImgHTMLAttributes,
} from "react";
import { cn } from "../../lib/ui/cn";

/**
 * Sergeant Design System — OptimizedImage
 *
 * Lazy-loaded image component with:
 * - Native lazy loading (loading="lazy") + IntersectionObserver fallback
 * - Automatic aspect ratio container to prevent layout shift
 * - Skeleton placeholder during load
 * - Error fallback state
 * - Optional blur-up effect on load
 * - Responsive srcSet support
 * - fetchPriority support for LCP images
 *
 * Usage:
 * ```tsx
 * <OptimizedImage
 *   src="/images/hero.jpg"
 *   alt="Hero image"
 *   aspectRatio="16/9"
 *   sizes="(max-width: 640px) 100vw, 50vw"
 *   priority // for above-the-fold images
 * />
 * ```
 */

export interface OptimizedImageProps extends Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "onLoad" | "onError"
> {
  /** Aspect ratio for the container (e.g., "16/9", "4/3", "1/1") */
  aspectRatio?: string;
  /** Show blur-up animation on load */
  blurOnLoad?: boolean;
  /** Custom fallback element when image fails to load */
  fallback?: React.ReactNode;
  /** Additional class for the wrapper container */
  wrapperClassName?: string;
  /** Callback when image loads */
  onImageLoad?: () => void;
  /** Callback when image fails to load */
  onImageError?: () => void;
  /** Priority loading for above-the-fold images (disables lazy loading) */
  priority?: boolean;
  /** Root margin for intersection observer (e.g., "200px" to start loading earlier) */
  rootMargin?: string;
}

export function OptimizedImage({
  src,
  alt,
  aspectRatio,
  blurOnLoad = true,
  fallback,
  wrapperClassName,
  className,
  onImageLoad,
  onImageError,
  priority = false,
  rootMargin = "200px",
  ...props
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const containerRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver for preloading images before they enter viewport
  useEffect(() => {
    if (priority || isInView) return;

    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold: 0 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [priority, isInView, rootMargin]);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    onImageLoad?.();
  }, [onImageLoad]);

  const handleError = useCallback(() => {
    setHasError(true);
    onImageError?.();
  }, [onImageError]);

  if (hasError) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-panelHi text-muted rounded-xl",
          wrapperClassName,
        )}
        style={aspectRatio ? { aspectRatio } : undefined}
        role="img"
        aria-label={alt || "Image failed to load"}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden", wrapperClassName)}
      style={aspectRatio ? { aspectRatio } : undefined}
    >
      {/* Skeleton placeholder */}
      {!isLoaded && (
        <div
          className={cn(
            "absolute inset-0 bg-line/30 animate-pulse",
            "motion-reduce:animate-none motion-reduce:bg-line/50",
          )}
          aria-hidden
        />
      )}

      {/* Actual image - only render when in view or priority */}
      {isInView && (
        <img
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? "sync" : "async"}
          fetchPriority={priority ? "high" : "auto"}
          onLoad={handleLoad}
          onError={handleError}
          className={cn(
            "w-full h-full object-cover",
            blurOnLoad && !isLoaded && "blur-sm scale-105",
            blurOnLoad && isLoaded && "blur-0 scale-100",
            "transition-[filter,transform] duration-500 ease-out",
            "motion-reduce:transition-none motion-reduce:blur-0 motion-reduce:scale-100",
            className,
          )}
          {...props}
        />
      )}
    </div>
  );
}

/**
 * Avatar image with optimized loading and circular shape
 */
export function OptimizedAvatar({
  src,
  alt,
  size = 40,
  className,
  ...props
}: OptimizedImageProps & { size?: number }) {
  return (
    <OptimizedImage
      src={src}
      alt={alt}
      aspectRatio="1/1"
      blurOnLoad={false}
      wrapperClassName={cn("rounded-full", className)}
      style={{ width: size, height: size }}
      {...props}
    />
  );
}

/**
 * Hero/banner image with responsive sizing
 */
export function OptimizedHeroImage({
  src,
  alt,
  className,
  ...props
}: OptimizedImageProps) {
  return (
    <OptimizedImage
      src={src}
      alt={alt}
      aspectRatio="16/9"
      sizes="100vw"
      wrapperClassName={cn("w-full rounded-2xl", className)}
      {...props}
    />
  );
}

/**
 * Thumbnail image for lists/grids
 */
export function OptimizedThumbnail({
  src,
  alt,
  size = "md",
  className,
  ...props
}: OptimizedImageProps & { size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "w-12 h-12",
    md: "w-16 h-16",
    lg: "w-24 h-24",
  };

  return (
    <OptimizedImage
      src={src}
      alt={alt}
      aspectRatio="1/1"
      blurOnLoad={false}
      wrapperClassName={cn("rounded-xl", sizeClasses[size], className)}
      {...props}
    />
  );
}
