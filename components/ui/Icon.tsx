import { cn } from '@/lib/cn';
import { ICON_PATHS, type IconName } from '@/lib/icons.generated';

export type { IconName };

export type IconProps = {
  name: IconName;
  /** Pixel size, or one of the three steps the UI actually uses. */
  size?: number | 'sm' | 'md' | 'lg';
  /** Material Symbols ships a filled cut of each glyph; this uses it. */
  filled?: boolean;
  /**
   * Optical weight. Only the 400 cut is bundled, so this adjusts the stroke of
   * the drawn paths rather than swapping to a different font weight — enough to
   * make an icon read heavier beside bold text without shipping four more sets.
   */
  weight?: 400 | 500 | 600;
  className?: string;
  /**
   * Give an icon a label only when it is the sole content of a control. An
   * icon beside a visible text label is decorative and must stay hidden, or a
   * screen reader announces the same thing twice.
   */
  label?: string;
};

const SIZES = { sm: 16, md: 20, lg: 24 } as const;

/**
 * The single icon component. Every glyph in the app comes through here, so
 * size, colour and accessibility are decided once.
 *
 * Icons inherit `currentColor`, so colour is set with a text utility on this
 * element or any ancestor — there is no `color` prop, because a second way to
 * set colour is a second thing to keep in sync with the theme.
 */
export function Icon({
  name,
  size = 'md',
  filled = false,
  weight = 400,
  className,
  label,
}: IconProps) {
  const glyph = ICON_PATHS[name];
  const pixels = typeof size === 'number' ? size : SIZES[size];
  const markup = filled && glyph.filled ? glyph.filled : glyph.path;

  return (
    <svg
      viewBox={glyph.viewBox}
      width={pixels}
      height={pixels}
      fill="currentColor"
      className={cn('inline-block shrink-0', className)}
      // Material Symbols are drawn as filled shapes, so a heavier look comes
      // from painting a stroke of the same colour over the fill.
      {...(weight !== 400
        ? { stroke: 'currentColor', strokeWidth: weight === 600 ? 1 : 0.5 }
        : {})}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
