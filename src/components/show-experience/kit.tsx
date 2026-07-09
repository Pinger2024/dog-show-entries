'use client';

import * as React from 'react';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/utils';
import { useCountdown } from './use-countdown';

/* ============================================================
 * Show Experience (green) — shared presentational kit.
 *
 * Opt-in only: a page must add the `.show-exp` wrapper class
 * (defined in src/app/globals.css) to its root element to pick up
 * Hanken Grotesk + the warm paper background these components are
 * designed against. All colors here use the `se-*` tokens registered
 * in globals.css `@theme inline`.
 * ============================================================ */

/* ─── SE_H ───────────────────────────────────────── */
/* The design's unoverridden heading recipe (H = { fontWeight: 800,
 * letterSpacing: -0.015em } under the "friendly"/Hanken Grotesk fontset).
 * Compose per-heading overrides on top, e.g. cn(SE_H, 'text-2xl'). */

export const SE_H = 'font-extrabold tracking-[-0.015em]';

/* ─── Eyebrow ────────────────────────────────────── */

export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'text-[10.5px] font-bold uppercase tracking-[0.16em] text-se-ink3',
        className
      )}
    >
      {children}
    </span>
  );
}

/* ─── Wordmark ───────────────────────────────────── */

export function Wordmark({
  className,
  size = 15,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[5px] font-extrabold tracking-[-0.015em] text-se-green',
        className
      )}
      style={{ fontSize: size }}
    >
      <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-se-fresh" />
      Remi
    </span>
  );
}

/* ─── SecLabel ───────────────────────────────────── */
/* Section label row: fresh bar + green eyebrow + hairline + optional right slot */

export function SecLabel({
  children,
  right,
  className,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-3.5 flex items-center gap-2.5', className)}>
      <span className="h-[3px] w-5 shrink-0 rounded-full bg-se-fresh" />
      <Eyebrow className="shrink-0 text-se-green">{children}</Eyebrow>
      <span className="h-px flex-1 bg-se-line" />
      {right}
    </div>
  );
}

/* ─── Pulse ──────────────────────────────────────── */
/* 8px live/open status dot with a soft halo ring */

export function Pulse({ className }: { className?: string }) {
  return (
    <span className={cn('relative inline-flex size-2', className)}>
      <span
        aria-hidden="true"
        className="absolute -inset-[3px] rounded-full bg-se-fresh/30"
      />
      <span className="relative size-2 rounded-full bg-se-fresh" />
    </span>
  );
}

/* ─── Chip ───────────────────────────────────────── */

export type ChipTone = 'light' | 'fresh' | 'onDark';

const CHIP_TONES: Record<ChipTone, string> = {
  light: 'bg-se-surface text-se-ink2 shadow-[inset_0_0_0_1px_#e7e1d3]',
  fresh: 'bg-se-fresh-soft text-se-fresh-deep shadow-[inset_0_0_0_1px_#c3e2cb]',
  onDark:
    'bg-[rgba(243,236,220,0.14)] text-se-cream shadow-[inset_0_0_0_1px_rgba(243,236,220,0.25)]',
};

export function Chip({
  children,
  tone = 'light',
  className,
}: {
  children: React.ReactNode;
  tone?: ChipTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-[27px] items-center gap-1.5 rounded-full px-3 text-xs font-semibold',
        CHIP_TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/* ─── SEButton ───────────────────────────────────── */

export type SEButtonVariant = 'primary' | 'fresh' | 'ghost' | 'onDark';
export type SEButtonSize = 'default' | 'sm';

const SE_BUTTON_VARIANTS: Record<SEButtonVariant, string> = {
  primary: 'bg-se-green text-se-cream shadow-[0_10px_22px_-12px_#2f6b43]',
  fresh: 'bg-se-fresh text-[#0e2c19] shadow-[0_10px_24px_-12px_#5bb579]',
  ghost: 'bg-se-surface text-se-ink shadow-[inset_0_0_0_1px_#d7cfba]',
  onDark: 'bg-[rgba(243,236,220,0.14)] text-se-cream',
};

const SE_BUTTON_SIZES: Record<SEButtonSize, string> = {
  default: 'h-[52px] px-[22px] text-[15.5px]',
  // Matches the design exactly (42px) — the earlier 44px touch-target bump
  // was revoked; the design is the contract. See DEVIATIONS.md #1.
  sm: 'h-[42px] px-4 text-[13.5px]',
};

export interface SEButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: SEButtonVariant;
  size?: SEButtonSize;
  /** Stretches the button to fill its container's width. */
  full?: boolean;
  /** Render as the single child element (e.g. a Link) instead of a <button>,
   *  mirroring shadcn's Button `asChild` — needed for CTAs that navigate. */
  asChild?: boolean;
}

export const SEButton = React.forwardRef<HTMLButtonElement, SEButtonProps>(
  ({ variant = 'primary', size = 'default', full, asChild, className, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[13px] font-semibold transition-colors',
          SE_BUTTON_VARIANTS[variant],
          SE_BUTTON_SIZES[size],
          full && 'w-full',
          className
        )}
        {...props}
      />
    );
  }
);
SEButton.displayName = 'SEButton';

/* ─── SECard ─────────────────────────────────────── */

export function SECard({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[18px] border border-se-line bg-se-surface shadow-[0_1px_2px_rgba(27,36,29,0.04),0_18px_36px_-26px_rgba(27,36,29,0.4)]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/* ─── HoneyBanner ────────────────────────────────── */
/* Entries-close banner: label + bold date on the left, a slot (typically
 * <CountdownCells dark />) on the right. */

export function HoneyBanner({
  label = 'Entries close',
  date,
  children,
  className,
}: {
  label?: string;
  date: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-[14px] bg-se-honey p-3 px-4 shadow-[0_14px_30px_-16px_rgba(0,0,0,0.5)]',
        className
      )}
    >
      <div>
        <Eyebrow className="text-[rgba(74,48,6,0.7)]">{label}</Eyebrow>
        <p className="mt-0.5 whitespace-nowrap text-[17px] font-semibold leading-tight tracking-[-0.015em] text-se-honey-ink">
          {date}
        </p>
      </div>
      {children}
    </div>
  );
}

/* ─── CountdownCells ─────────────────────────────── */
/* days / hrs / min cells with colon separators. `dark` switches to the
 * on-honey ink palette (for use inside HoneyBanner); otherwise uses the
 * light-surface se-ink / se-ink3 palette. */

export function CountdownCells({
  target,
  countdown,
  dark,
  className,
}: {
  /** Precomputed {d,h,m} from a countdown a parent is already ticking (e.g.
   *  a single shared `useCountdown()` call) — pass this to avoid each
   *  CountdownCells instance running its own 1s interval. Takes priority
   *  over `target` when both are given. */
  countdown?: { d: number; h: number; m: number } | null;
  /** Target date — when `countdown` isn't supplied, CountdownCells runs its
   *  own internal useCountdown hook against this. */
  target?: Date;
  dark?: boolean;
  className?: string;
}) {
  // Hooks must run unconditionally — pass null when a precomputed
  // `countdown` was given so this internal tick never starts.
  const hookValue = useCountdown(countdown ? null : target ?? null);
  const c = countdown ?? hookValue;
  if (!c) return null;

  const valueClass = dark ? 'text-[#0e2c19]' : 'text-se-ink';
  const labelClass = dark ? 'text-[rgba(14,44,25,0.6)]' : 'text-se-ink3';
  const sepClass = dark ? 'text-[rgba(14,44,25,0.4)]' : 'text-se-ink3';

  const cells: Array<{ value: number; label: string }> = [
    { value: c.d, label: 'days' },
    { value: c.h, label: 'hrs' },
    { value: c.m, label: 'min' },
  ];

  return (
    <div className={cn('flex items-center gap-[7px]', className)}>
      {cells.map((cell, i) => (
        <React.Fragment key={cell.label}>
          {i > 0 && (
            <span aria-hidden="true" className={cn('-mt-1.5 text-[18px] font-bold', sepClass)}>
              :
            </span>
          )}
          <div className="flex min-w-[46px] flex-col items-center">
            <span
              className={cn(
                'text-[25px] font-bold leading-none tabular-nums',
                valueClass
              )}
            >
              {String(cell.value).padStart(2, '0')}
            </span>
            <span
              className={cn(
                'mt-1 text-[9px] font-bold uppercase leading-none tracking-[0.14em]',
                labelClass
              )}
            >
              {cell.label}
            </span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

/* ─── SEDarkPanel ────────────────────────────────── */
/* Dark pine gradient panel (hero banners, confirmation cards, share-prompt
 * cards) with an optional decorative radial glow blob in the corner.
 * Consolidates 4 previously hand-rolled copies — pass each site's own
 * direction/glow position/size/opacity/fade to preserve its exact look. */

/** Old Tailwind bg-gradient-to-* directions, mapped to an equivalent angle
 *  for callers that haven't migrated to `angle` yet. */
const SE_DARK_PANEL_DIRECTION_ANGLE: Record<'b' | 'br', number> = {
  b: 180,
  br: 135,
};

export interface SEDarkPanelProps extends React.HTMLAttributes<HTMLElement> {
  /** Wrapping element — defaults to 'div'; pass 'header' for hero banners
   *  that want the semantic landmark. */
  as?: 'div' | 'header';
  /** @deprecated use `angle` instead. Mapped to an angle for back-compat:
   *  'b' → 180, 'br' → 135. */
  direction?: 'b' | 'br';
  /** Gradient angle in degrees, matching the design's
   *  `linear-gradient(<angle>deg, se-deep, se-deepest)`. Defaults to 172,
   *  the design's type-led hero angle. */
  angle?: number;
  /** Show the decorative radial glow blob. Defaults to true. */
  glow?: boolean;
  /** Glow position, as Tailwind position-utility classes (e.g. "-right-[90px] -top-[70px]"). */
  glowPosition?: string;
  /** Glow size, as a Tailwind size-* class (e.g. "size-[260px]"). */
  glowSize?: string;
  /** Glow opacity, as a Tailwind opacity-* class (e.g. "opacity-[0.28]"). */
  glowOpacity?: string;
  /** Radial-gradient fade-out stop (e.g. "68%"). */
  glowFade?: string;
}

export function SEDarkPanel({
  as = 'div',
  direction,
  angle,
  glow = true,
  glowPosition = '-right-[90px] -top-[70px]',
  glowSize = 'size-[260px]',
  glowOpacity = 'opacity-[0.28]',
  glowFade = '68%',
  className,
  style,
  children,
  ...props
}: SEDarkPanelProps) {
  const Comp = as as React.ElementType;
  const resolvedAngle =
    angle ?? (direction ? SE_DARK_PANEL_DIRECTION_ANGLE[direction] : 172);
  return (
    <Comp
      className={cn('relative overflow-hidden text-se-cream', className)}
      style={{
        backgroundImage: `linear-gradient(${resolvedAngle}deg, var(--color-se-deep), var(--color-se-deepest))`,
        ...style,
      }}
      {...props}
    >
      {glow && (
        <div
          aria-hidden="true"
          className={cn('pointer-events-none absolute rounded-full', glowPosition, glowSize, glowOpacity)}
          style={{ background: `radial-gradient(circle, #5bb579, transparent ${glowFade})` }}
        />
      )}
      {children}
    </Comp>
  );
}
