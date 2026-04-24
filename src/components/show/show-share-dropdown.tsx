'use client';

import { useState } from 'react';
import { Share2, Check, ExternalLink, Copy } from 'lucide-react';
import {
  FacebookShareButton,
  WhatsappShareButton,
  FacebookIcon,
  WhatsappIcon,
} from 'react-share';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

function InstagramIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ color: '#E1306C' }}>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

interface ShowShareDropdownProps {
  showName: string;
  showType: string;
  showDate: string;
  organisationName: string;
  venueName?: string;
  className?: string;
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

  const shareUrl = shareUrlProp
    ?? (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '');
  const messageText = `Check out ${showName} — a ${showType} by ${organisationName}${venueName ? ` at ${venueName}` : ''} on ${showDate}. Enter online on Remi!`;

  async function shareInstagram() {
    // Instagram has no web share URL — use the native OS share sheet on mobile,
    // fall back to clipboard on desktop.
    if (navigator.share) {
      try {
        await navigator.share({ title: showName, text: messageText, url: shareUrl });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    await navigator.clipboard.writeText(shareUrl);
    toast.success('Link copied — paste it into Instagram to share');
  }

  function copyLink() {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {/* WhatsApp — most-used share channel for this audience */}
      {typeof window !== 'undefined' && (
        <WhatsappShareButton url={shareUrl} title={messageText}>
          <Button variant="outline" className="h-9 gap-1.5 shadow-sm bg-[#25D366]/10 border-[#25D366]/30 text-[#25D366] hover:bg-[#25D366]/20 hover:text-[#20BD5A]" asChild>
            <span>
              <WhatsappIcon size={16} round />
              <span className="hidden sm:inline">WhatsApp</span>
            </span>
          </Button>
        </WhatsappShareButton>
      )}

      {/* More options */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="h-9 shadow-sm">
            {copied ? (
              <>
                <Check className="size-4" />
                <span className="hidden sm:inline">Copied!</span>
              </>
            ) : (
              <>
                <Share2 className="size-4" />
                <span className="hidden sm:inline">Share</span>
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
              <DropdownMenuItem onClick={shareInstagram} className="cursor-pointer gap-2">
                <InstagramIcon size={18} />
                Instagram
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem onClick={copyLink} className="cursor-pointer gap-2">
            {copied ? (
              <Check className="size-4 text-emerald-600" />
            ) : (
              <Copy className="size-4" />
            )}
            {copied ? 'Copied!' : 'Copy link'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
