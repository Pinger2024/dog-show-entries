'use client';

import { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import {
  FacebookShareButton,
  WhatsappShareButton,
  FacebookIcon,
  WhatsappIcon,
} from 'react-share';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { useShowId } from '../../_lib/show-context';
import type { ActionPanelProps } from '../checklist-action-registry';

const MESSAGES: Record<string, (name: string, extra?: string) => string> = {
  share_show: (name) =>
    `Check out ${name} — enter online on Remi!`,
  share_closing: (name, closeDate) =>
    `Last chance to enter ${name}! Entries close ${closeDate ?? 'soon'}.`,
  share_results: (name) =>
    `Results from ${name} are now live!`,
};

export function ShareShowAction({ actionKey }: ActionPanelProps) {
  const showId = useShowId();
  const { data: show } = trpc.shows.getById.useQuery({ id: showId });
  const [copied, setCopied] = useState(false);

  if (!show) return null;

  const showUrl = `https://remishowmanager.co.uk/shows/${show.slug ?? showId}`;
  const resultsUrl = `${showUrl}/results`;
  const shareUrl = actionKey === 'share_results' ? resultsUrl : showUrl;

  const closeDate = show.entryCloseDate
    ? format(
        typeof show.entryCloseDate === 'string'
          ? parseISO(show.entryCloseDate)
          : show.entryCloseDate,
        'd MMMM yyyy'
      )
    : undefined;

  const messageFn = actionKey ? MESSAGES[actionKey] : undefined;
  const message = messageFn ? messageFn(show.name, closeDate) : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-3">
      {/* Message preview */}
      <p className="text-sm font-medium text-foreground">{message}</p>

      {/* Show URL with copy button */}
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
          {shareUrl}
        </code>
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 text-xs"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="size-3 text-green-500" />
          ) : (
            <Copy className="size-3" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>

      {/* Share buttons */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <FacebookShareButton url={shareUrl} className="flex-1">
          <Button
            size="sm"
            variant="outline"
            className="h-9 w-full text-xs"
            asChild
          >
            <span>
              <FacebookIcon size={18} round />
              Share on Facebook
            </span>
          </Button>
        </FacebookShareButton>

        <WhatsappShareButton url={shareUrl} title={message} className="flex-1">
          <Button
            size="sm"
            variant="outline"
            className="h-9 w-full text-xs"
            asChild
          >
            <span>
              <WhatsappIcon size={18} round />
              Share on WhatsApp
            </span>
          </Button>
        </WhatsappShareButton>

        <Button
          size="sm"
          variant="outline"
          className="h-9 flex-1 text-xs"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="size-3 text-green-500" />
          ) : (
            <ExternalLink className="size-3" />
          )}
          {copied ? 'Link Copied!' : 'Copy Link'}
        </Button>
      </div>
    </div>
  );
}
