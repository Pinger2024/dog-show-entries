'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useShowId } from '../../_lib/show-context';
import type { ActionPanelProps } from '../checklist-action-registry';

/** Maps action keys to their target sections within the show */
const LINK_MAP: Record<string, { path: string; label: string }> = {
  venue_confirm: { path: '', label: 'Show Overview' },
  classes_setup: { path: '/entries', label: 'Entries & Classes' },
  sponsors: { path: '/sponsors', label: 'Sponsors' },
  stewards_assign: { path: '/people', label: 'People' },
  judges_assign_breeds: { path: '/people', label: 'People — Judges' },
  rings_finalise: { path: '/entries', label: 'Entries — Rings' },
  catalogue_generate: { path: '/catalogue', label: 'Catalogue' },
};

export function QuickLinkAction({ actionKey }: ActionPanelProps) {
  const showId = useShowId();
  const link = actionKey ? LINK_MAP[actionKey] : null;

  if (!link) return null;

  return (
    <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
      <Link href={`/secretary/shows/${showId}${link.path}`}>
        <ExternalLink className="size-3" />
        Go to {link.label}
      </Link>
    </Button>
  );
}
