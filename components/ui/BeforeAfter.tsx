'use client';

import { useId, useState } from 'react';
import { Slider } from '@/components/ui/Slider';

/**
 * Draggable split comparison.
 *
 * Side-by-side thumbnails are a bad way to judge a subtle change — the eye has
 * to travel, and both images end up small. Overlaying them under one divider
 * puts the difference exactly where you are already looking. The divider is a
 * real range input, so it is keyboard-operable and announces itself.
 */
export function BeforeAfter({
  beforeSrc,
  afterSrc,
  beforeLabel = 'Before',
  afterLabel = 'After',
  /** Nearest-neighbour the "before" image, to show what a plain resize loses. */
  pixelateBefore = false,
  className = 'h-96',
}: {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
  pixelateBefore?: boolean;
  className?: string;
}) {
  const [position, setPosition] = useState(50);
  const id = useId();

  return (
    <div className="flex flex-col gap-2">
      <div className={`relative overflow-hidden rounded-xl border border-line bg-sunken ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- object URL */}
        <img
          src={afterSrc}
          alt={afterLabel}
          className="absolute inset-0 size-full object-contain"
        />
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- object URL */}
          <img
            src={beforeSrc}
            alt={beforeLabel}
            className="absolute inset-0 size-full object-contain"
            style={pixelateBefore ? { imageRendering: 'pixelated' } : undefined}
          />
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent"
          style={{ left: `${position}%` }}
        />

        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white"
        >
          {beforeLabel}
        </span>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white"
        >
          {afterLabel}
        </span>
      </div>

      <Slider
        id={id}
        label={`Comparison position — drag to reveal more of ${beforeLabel} or ${afterLabel}`}
        value={position}
        min={0}
        max={100}
        step={1}
        suffix="%"
        valueLabel="none"
        onInput={(value) => setPosition(value as number)}
        onChange={(value) => setPosition(value as number)}
      />
    </div>
  );
}
