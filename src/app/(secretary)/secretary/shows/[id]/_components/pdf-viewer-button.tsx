'use client';

import { useState } from 'react';
import { ExternalLink, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

// Opens a PDF inside a full-screen Remi dialog instead of navigating the
// current window/PWA to the PDF URL. iOS PWA users tapping a plain
// target="_blank" PDF link get stranded — iOS opens it in real Safari with
// no easy way back into the app, and a mobile browser tab showing a PDF
// hides the back affordance entirely. The dialog always has a close
// button, so even if iOS refuses to render the PDF in the iframe, the
// user is one tap from returning to Remi (backlog #82 round 2).
//
// The iframe loads the PDF with `?preview=1` so makePdfResponse sends
// Content-Disposition: inline, which allows embedding. The dialog also
// offers a fallback "Open in new tab" link that uses window.open() — on
// desktop this is the quickest way to print, and on iOS it breaks out
// into real Safari (escaping the PWA shell) as a deliberate fallback.

export function PdfViewerButton({
  icon,
  label,
  url,
  variant = 'outline',
  className,
}: {
  icon: React.ReactNode;
  label: string;
  url: string;
  variant?: 'outline' | 'default' | 'ghost';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const inlineUrl = url.includes('?') ? `${url}&preview=1` : `${url}?preview=1`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant={variant}
        className={`min-h-[2.75rem] ${className ?? ''}`}
        onClick={() => setOpen(true)}
      >
        {icon}
        {label}
      </Button>
      <DialogContent
        showCloseButton={false}
        className="max-w-none sm:max-w-none p-0 gap-0 sm:w-[95vw] sm:h-[95vh] sm:rounded-lg max-sm:inset-0 max-sm:top-0 max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:max-h-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none flex flex-col"
      >
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <div className="flex items-center justify-between gap-2 border-b bg-background px-3 py-2 sm:px-4 sm:py-3">
          <h2 className="flex min-w-0 items-center gap-2 truncate text-sm font-semibold sm:text-base">
            {icon}
            <span className="truncate">{label}</span>
          </h2>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {/* Save — uses the attachment URL (no ?preview=1) so the server
                sends Content-Disposition: attachment. On iOS this typically
                opens the share sheet with "Save to Files" as an option. */}
            <Button variant="outline" size="sm" asChild>
              <a href={url} download target="_blank" rel="noopener noreferrer" className="gap-1">
                <Save className="size-3.5" />
                <span className="hidden sm:inline">Save</span>
              </a>
            </Button>
            {/* Fallback for when the iframe refuses to render the PDF. */}
            <Button variant="outline" size="sm" asChild>
              <a href={inlineUrl} target="_blank" rel="noopener noreferrer" className="gap-1">
                <ExternalLink className="size-3.5" />
                <span className="hidden sm:inline">Open in new tab</span>
              </a>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="gap-1">
              Close
            </Button>
          </div>
        </div>
        <iframe src={inlineUrl} title={label} className="min-h-0 flex-1 w-full border-0" />
      </DialogContent>
    </Dialog>
  );
}
