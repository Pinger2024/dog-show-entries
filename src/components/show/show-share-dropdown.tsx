'use client';

import { useState } from 'react';
import { Share2, Check, Copy } from 'lucide-react';
import {
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
  // Append a channel-specific query param to the URLs we send out via social
  // share. This gives each channel a distinct URL so platform link-preview
  // caches (WhatsApp's in particular — it has no public debugger) re-scrape
  // and pick up the current OG image. It also doubles as a lightweight
  // attribution breadcrumb when we later want to see where entries came from.
  const withSource = (channel: string) =>
    `${shareUrl}${shareUrl.includes('?') ? '&' : '?'}src=${channel}`;
  const messageText = `Check out ${showName} — a ${showType} by ${organisationName}${venueName ? ` at ${venueName}` : ''} on ${showDate}. Enter online on Remi!`;

  const isMobile =
    typeof navigator !== 'undefined' &&
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  async function shareFacebook() {
    // The Facebook mobile app intercepts sharer.php URLs and lands on a blank
    // screen — tapping "Share to Facebook" takes you to the app with nothing
    // to share. The native share sheet hands off to the FB app correctly, so
    // prefer navigator.share on mobile; on desktop, where Facebook is never
    // installed as an app, open the web sharer in a new tab.
    const fbShareUrl = withSource('facebook');
    if (isMobile && navigator.share) {
      try {
        await navigator.share({ title: showName, text: messageText, url: fbShareUrl });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fbShareUrl)}`;
    window.open(fbUrl, '_blank', 'noopener,noreferrer');
  }

  async function shareInstagram() {
    // Instagram has no web share URL — use the native OS share sheet on mobile,
    // fall back to clipboard on desktop.
    const igShareUrl = withSource('instagram');
    if (navigator.share) {
      try {
        await navigator.share({ title: showName, text: messageText, url: igShareUrl });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    await navigator.clipboard.writeText(igShareUrl);
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
        <WhatsappShareButton url={withSource('whatsapp')} title={messageText}>
          <Button variant="outline" className="h-9 gap-1.5 shadow-sm bg-[#25D366]/10 border-[#25D366]/30 text-[#25D366] hover:bg-[#25D366]/20 hover:text-[#20BD5A]" asChild>
            <span>
              <WhatsappIcon size={16} round />
              <span className="hidden sm:inline">WhatsApp</span>
            </span>
          </Button>
        </WhatsappShareButton>
      )}

      {/* Desktop (sm+): channels inline, no dropdown — faster access */}
      <Button
        variant="outline"
        className="hidden h-9 gap-1.5 border-[#1877F2]/30 bg-[#1877F2]/10 text-[#1877F2] shadow-sm hover:bg-[#1877F2]/20 hover:text-[#1877F2] sm:inline-flex"
        onClick={shareFacebook}
        aria-label="Share on Facebook"
      >
        <FacebookIcon size={16} round />
        <span>Facebook</span>
      </Button>
      <Button
        variant="outline"
        className="hidden h-9 gap-1.5 border-[#E1306C]/30 bg-[#E1306C]/10 text-[#E1306C] shadow-sm hover:bg-[#E1306C]/20 hover:text-[#E1306C] sm:inline-flex"
        onClick={shareInstagram}
        aria-label="Share on Instagram"
      >
        <InstagramIcon size={16} />
        <span>Instagram</span>
      </Button>
      <Button
        variant="outline"
        className="hidden h-9 gap-1.5 shadow-sm sm:inline-flex"
        onClick={copyLink}
        aria-label="Copy link"
      >
        {copied ? (
          <>
            <Check className="size-4 text-emerald-600" />
            <span>Copied!</span>
          </>
        ) : (
          <>
            <Copy className="size-4" />
            <span>Copy link</span>
          </>
        )}
      </Button>

      {/* Mobile (narrow): keep a compact dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="h-9 shadow-sm sm:hidden" aria-label="Share">
            {copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {typeof window !== 'undefined' && (
            <>
              <DropdownMenuItem onClick={shareFacebook} className="cursor-pointer gap-2">
                <FacebookIcon size={18} round />
                Facebook
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
