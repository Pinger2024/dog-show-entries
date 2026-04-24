'use client';

import { useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { FacebookIcon, WhatsappIcon, WhatsappShareButton } from 'react-share';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Small pink Instagram SVG — there's no react-share Instagram equivalent. */
function InstagramIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{ color: '#E1306C' }}
    >
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

interface TellAFriendProps {
  showName: string;
  showType: string;
  showDate: string;
  organisationName: string;
  venueName?: string;
  /** Canonical URL to share. Callers pass `${origin}/shows/${slug}`. */
  shareUrl: string;
  /** Optional "share clicked" hook — used by Tier 3 to log attribution events. */
  onShare?: (channel: 'whatsapp' | 'facebook' | 'instagram' | 'copy') => void;
  className?: string;
  id?: string;
}

/**
 * Big, invitational share block. Threaded between the Judges section and
 * the Entry Fees section on the show page. Dog-show culture is
 * word-of-mouth; passive "Share" dropdowns under-perform — an explicit
 * invite does the work.
 */
export function TellAFriend({
  showName,
  showType,
  showDate,
  organisationName,
  venueName,
  shareUrl,
  onShare,
  className,
  id,
}: TellAFriendProps) {
  const [copied, setCopied] = useState(false);

  const isMobile =
    typeof navigator !== 'undefined' &&
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // Cache-bust the URL per channel so platform link-preview caches re-scrape.
  const withSource = (channel: string) =>
    `${shareUrl}${shareUrl.includes('?') ? '&' : '?'}src=${channel}`;

  const messageText = `Check out ${showName} — a ${showType} by ${organisationName}${
    venueName ? ` at ${venueName}` : ''
  } on ${showDate}. Enter online on Remi!`;

  async function shareFacebook() {
    onShare?.('facebook');
    const fbShareUrl = withSource('facebook');
    if (isMobile && navigator.share) {
      try {
        await navigator.share({ title: showName, text: messageText, url: fbShareUrl });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fbShareUrl)}`,
      '_blank',
      'noopener,noreferrer'
    );
  }

  async function shareInstagram() {
    onShare?.('instagram');
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
    onShare?.('copy');
    void navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section
      id={id}
      className={cn(
        'mx-auto max-w-4xl scroll-mt-24 px-4 py-10 sm:px-6 sm:py-14 lg:px-8',
        className
      )}
    >
      <div className="relative overflow-hidden rounded-2xl border border-amber-300/50 bg-gradient-to-br from-amber-50/70 via-white to-amber-50/50 p-6 shadow-sm sm:p-10">
        <span aria-hidden="true" className="absolute left-4 top-4 text-[10px] text-amber-500/50">◆</span>
        <span aria-hidden="true" className="absolute right-4 top-4 text-[10px] text-amber-500/50">◆</span>
        <span aria-hidden="true" className="absolute bottom-4 left-4 text-[10px] text-amber-500/50">◆</span>
        <span aria-hidden="true" className="absolute bottom-4 right-4 text-[10px] text-amber-500/50">◆</span>

        <div className="mx-auto max-w-2xl text-center">
          <Share2 className="mx-auto size-6 text-amber-700" />
          <p className="mt-3 font-serif text-[11px] uppercase italic tracking-[0.3em] text-amber-800">
            Tell a fellow exhibitor
          </p>
          <h3 className="mt-2 font-serif text-2xl font-bold leading-tight text-stone-900 sm:text-3xl">
            Know someone who&apos;d love this card?
          </h3>
          <p className="mx-auto mt-3 max-w-lg text-stone-700">
            Send them the show details — it takes two seconds and helps {organisationName}
            fill the rings.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            {/* WhatsApp — the dominant channel for this audience */}
            <WhatsappShareButton
              url={withSource('whatsapp')}
              title={messageText}
              beforeOnClick={() => {
                onShare?.('whatsapp');
              }}
            >
              <Button
                variant="outline"
                className="h-12 gap-2 border-[#25D366]/40 bg-[#25D366]/10 px-5 text-[#1da851] shadow-sm hover:bg-[#25D366]/20 hover:text-[#1da851]"
                asChild
              >
                <span>
                  <WhatsappIcon size={18} round />
                  WhatsApp
                </span>
              </Button>
            </WhatsappShareButton>

            <Button
              variant="outline"
              className="h-12 gap-2 border-[#1877F2]/30 bg-[#1877F2]/5 px-5 text-[#1877F2] shadow-sm hover:bg-[#1877F2]/15 hover:text-[#1877F2]"
              onClick={shareFacebook}
            >
              <FacebookIcon size={18} round />
              Facebook
            </Button>

            <Button
              variant="outline"
              className="h-12 gap-2 border-[#E1306C]/30 bg-[#E1306C]/5 px-5 text-[#E1306C] shadow-sm hover:bg-[#E1306C]/15 hover:text-[#E1306C]"
              onClick={shareInstagram}
            >
              <InstagramIcon size={18} />
              Instagram
            </Button>

            <Button
              variant="outline"
              className="h-12 gap-2 border-stone-300 bg-white px-5 shadow-sm"
              onClick={copyLink}
            >
              {copied ? (
                <>
                  <Check className="size-4 text-emerald-600" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="size-4" />
                  Copy link
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
