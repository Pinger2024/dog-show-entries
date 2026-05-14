'use client';

import { useState, type ReactNode } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Friendly help affordance for show setup sections.
// Sits next to a section title and opens a soft callout panel below
// with a "What this is" / "What to do" / optional tip block. Designed
// for the target user: 60+, not confident with computers, scares
// easily off if the screen looks busy. Closed by default so the
// section reads cleanly when help isn't needed.
//
// Use as:
//   <SectionHeading
//     title="Entry Fees"
//     help={{
//       what: "How much exhibitors pay to enter their dogs.",
//       todo: ["Set the first entry fee", "Set the same-dog extra class fee"],
//       tip: "Most clubs charge less for extra classes on the same dog.",
//     }}
//   />

export interface SectionHelpContent {
  /** Plain English description of what this section is for. One short paragraph. */
  what: string;
  /** Step-by-step list of what the user needs to do. */
  todo: string[];
  /** Optional small tip or reassurance. */
  tip?: string;
}

export function SectionHeading({
  title,
  subtitle,
  help,
  level = 'h4',
  className,
}: {
  title: string;
  subtitle?: string;
  help?: SectionHelpContent;
  level?: 'h3' | 'h4' | 'h5';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const Tag = level;

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center gap-1.5">
        <Tag
          className={cn(
            'font-semibold',
            level === 'h3' && 'text-base',
            level === 'h4' && 'text-sm',
            level === 'h5' && 'text-xs',
          )}
        >
          {title}
        </Tag>
        {help && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
            aria-expanded={open}
            aria-label={open ? 'Hide help' : 'Show help'}
          >
            <HelpCircle className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{open ? 'Hide help' : 'Help'}</span>
          </button>
        )}
      </div>
      {subtitle && (
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      )}
      {help && open && (
        <HelpPanel content={help} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

function HelpPanel({
  content,
  onClose,
}: {
  content: SectionHelpContent;
  onClose: () => void;
}) {
  return (
    <div className="relative mt-2 rounded-lg border border-primary/20 bg-primary/[0.04] p-3 pr-9 text-sm">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-primary/10 hover:text-foreground"
        aria-label="Close help"
      >
        <X className="size-3.5" />
      </button>
      <p className="font-medium text-foreground">What this is</p>
      <p className="mt-1 leading-relaxed text-muted-foreground">{content.what}</p>
      {content.todo.length > 0 && (
        <>
          <p className="mt-3 font-medium text-foreground">What to do</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 leading-relaxed text-muted-foreground">
            {content.todo.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </>
      )}
      {content.tip && (
        <p className="mt-3 rounded-md bg-primary/10 px-2 py-1.5 text-xs italic text-primary">
          Tip: {content.tip}
        </p>
      )}
    </div>
  );
}

// Standalone help block — for places where there isn't a heading to
// hang the icon off (e.g. the top of a card body, intro banners).
export function InlineHelp({
  label = 'How does this section work?',
  content,
}: {
  label?: string;
  content: SectionHelpContent;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
        aria-expanded={open}
      >
        <HelpCircle className="size-3.5" aria-hidden="true" />
        {label}
      </button>
      {open && <HelpPanel content={content} onClose={() => setOpen(false)} />}
    </div>
  );
}
