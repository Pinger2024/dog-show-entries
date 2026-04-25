'use client';

/**
 * Compact "Share" trigger that opens the full ShareKit in a Dialog.
 * Drop-in replacement for the old <ShowShareDropdown> in the sticky
 * action bar — same surface area on the page, much richer experience
 * once tapped.
 */
import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ShareKit } from './share-kit';

interface ShareKitDialogProps {
  showId: string;
  showName: string;
  showType: string;
  showDate: string;
  organisationName: string;
  venueName?: string | null;
  entryCloseDate?: string | Date | null;
  shareUrl: string;
  onShare?: Parameters<typeof ShareKit>[0]['onShare'];
  className?: string;
  /** Optional label for the trigger; defaults to a hidden a11y string. */
  triggerLabel?: string;
}

export function ShareKitDialog(props: ShareKitDialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-9 gap-1.5 shadow-sm', props.className)}
          aria-label={props.triggerLabel ?? 'Share this show'}
        >
          <Share2 className="size-4" />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif">Share this show</DialogTitle>
          <DialogDescription>
            Open your phone share sheet, or create a poster for Instagram.
          </DialogDescription>
        </DialogHeader>
        <ShareKit
          {...props}
          compact
          className="mt-2"
        />
      </DialogContent>
    </Dialog>
  );
}
