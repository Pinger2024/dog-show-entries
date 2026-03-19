'use client';

import { useState } from 'react';
import { Share2, Check, ExternalLink } from 'lucide-react';
import {
  FacebookShareButton,
  WhatsappShareButton,
  TwitterShareButton,
  EmailShareButton,
  TelegramShareButton,
  FacebookIcon,
  WhatsappIcon,
  XIcon,
  EmailIcon,
  TelegramIcon,
} from 'react-share';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ShowShareDropdownProps {
  showName: string;
  showType: string;
  showDate: string;
  organisationName: string;
  venueName?: string;
  className?: string;
  /** Explicit canonical URL to share. Falls back to window.location.origin + pathname (no query params or hash). */
  shareUrl?: string;
}

export function ShowShareDropdown({
  showName,
  showType,
  showDate,
  organisationName,
  venueName,
  className,
  shareUrl: shareUrlProp,
}: ShowShareDropdownProps) {
  const [copied, setCopied] = useState(false);

  // Use explicit prop, or strip query params / hash from current URL to get a clean public URL
  const shareUrl = shareUrlProp
    ?? (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '');
  const messageText = `Check out ${showName} — a ${showType} by ${organisationName}${venueName ? ` at ${venueName}` : ''} on ${showDate}. Enter online on Remi!`;
  const tweetText = `${showName} — ${showType} by ${organisationName}, ${showDate}. Enter online on Remi!`;
  const hashtags = ['DogShow', 'Remi', showType.replace(/\s+/g, '')];
  const emailSubject = `${showName} — ${showType}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn("h-9 shadow-sm", className)}>
          {copied ? (
            <>
              <Check className="size-4" />
              Shared!
            </>
          ) : (
            <>
              <Share2 className="size-4" />
              Share
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {typeof window !== 'undefined' && (
          <>
            <DropdownMenuItem asChild>
              <FacebookShareButton url={shareUrl} className="!flex w-full cursor-pointer items-center gap-2 !rounded-sm !px-2 !py-1.5 !text-sm">
                <FacebookIcon size={18} round />
                Facebook
              </FacebookShareButton>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <WhatsappShareButton url={shareUrl} title={messageText} className="!flex w-full cursor-pointer items-center gap-2 !rounded-sm !px-2 !py-1.5 !text-sm">
                <WhatsappIcon size={18} round />
                WhatsApp
              </WhatsappShareButton>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <TwitterShareButton url={shareUrl} title={tweetText} hashtags={hashtags} className="!flex w-full cursor-pointer items-center gap-2 !rounded-sm !px-2 !py-1.5 !text-sm">
                <XIcon size={18} round />
                X (Twitter)
              </TwitterShareButton>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <TelegramShareButton url={shareUrl} title={messageText} className="!flex w-full cursor-pointer items-center gap-2 !rounded-sm !px-2 !py-1.5 !text-sm">
                <TelegramIcon size={18} round />
                Telegram
              </TelegramShareButton>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <EmailShareButton url={shareUrl} subject={emailSubject} body={`${messageText}\n\n`} className="!flex w-full cursor-pointer items-center gap-2 !rounded-sm !px-2 !py-1.5 !text-sm">
                <EmailIcon size={18} round />
                Email
              </EmailShareButton>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem
          onClick={() => {
            navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? (
            <Check className="mr-2 size-4 text-emerald-600" />
          ) : (
            <ExternalLink className="mr-2 size-4" />
          )}
          {copied ? 'Link copied!' : 'Copy link'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
