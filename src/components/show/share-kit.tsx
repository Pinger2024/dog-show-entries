'use client';

/**
 * Share Kit — the new "Save & Post" share UX.
 *
 * Replaces the old per-platform buttons (which on mobile were lying —
 * "Facebook" was actually "copy link"). The Lu.ma / Partiful pattern:
 * generate a beautiful per-show image, give the user one tap to save it
 * to their camera roll, copy a punchy caption to the clipboard, and let
 * them post natively in whichever app they want.
 *
 * Design choices that matter:
 *   - Image preview at the top: the user sees what they're about to send.
 *     This is the single biggest UX win over the old flow — invisible
 *     output makes people anxious about sharing.
 *   - Toggle between Post (1080×1350) and Story (1080×1920). Same data,
 *     different aspect, picked to match the destination format.
 *   - "Save image" is the primary action. Uses the Web Share API with a
 *     File payload when available (iOS adds "Save Image to Photos" right
 *     in the share sheet), falls back to a download anchor.
 *   - "Copy post" pairs the caption with the URL — one paste fills a
 *     Facebook compose window cleanly.
 *   - WhatsApp + Copy link kept as fast paths; both still work fine.
 *
 * No dedicated Facebook / Instagram buttons. The research is unanimous:
 * everyone (Lu.ma, Posh, Partiful) has converged on "make the asset, let
 * the user post it" as the only reliable path on mobile.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Loader2,
  Share2,
  ClipboardList,
} from 'lucide-react';
import { WhatsappIcon, WhatsappShareButton } from 'react-share';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { buildSharePost } from '@/lib/share-caption';

type ShareChannel =
  | 'image_saved_portrait'
  | 'image_saved_story'
  | 'copy_post'
  | 'whatsapp'
  | 'copy';

interface ShareKitProps {
  /** Show UUID — used to build the per-show image URLs. */
  showId: string;
  showName: string;
  showType: string;
  /** Pre-formatted human date — e.g. "Saturday 4 May 2026". */
  showDate: string;
  organisationName: string;
  venueName?: string | null;
  /** Entry close date — Date object or ISO string. Drives caption urgency. */
  entryCloseDate?: string | Date | null;
  /** Canonical share URL. Caller passes `${origin}/shows/${slug}`. */
  shareUrl: string;
  /** Optional fire-and-forget share-event reporter. */
  onShare?: (channel: ShareChannel) => void;
  /** Compact rendering for embedded use (e.g. inside a Dialog). */
  compact?: boolean;
  className?: string;
  id?: string;
}

type ImageVariant = 'portrait' | 'story';

export function ShareKit({
  showId,
  showName,
  showType,
  showDate,
  organisationName,
  venueName,
  entryCloseDate,
  shareUrl,
  onShare,
  compact = false,
  className,
  id,
}: ShareKitProps) {
  const [variant, setVariant] = useState<ImageVariant>('portrait');
  const [copyState, setCopyState] = useState<'idle' | 'post' | 'link'>('idle');
  const [saving, setSaving] = useState(false);
  // Block double-resets when the user clicks twice in quick succession.
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const sharePost = useMemo(
    () => buildSharePost(
      {
        showName,
        showType,
        organisationName,
        showDate,
        venueName,
        entryCloseDate: entryCloseDate
          ? typeof entryCloseDate === 'string'
            ? entryCloseDate
            : entryCloseDate.toISOString()
          : null,
      },
      shareUrl
    ),
    [showName, showType, organisationName, showDate, venueName, entryCloseDate, shareUrl]
  );

  const imageUrl = `/api/shares/${showId}/${variant}`;

  // Filename for the saved/downloaded image. Sluggish but human-readable.
  const imageFilename = `${showName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'show'}-${variant}.png`;

  function flashCopy(which: 'post' | 'link') {
    setCopyState(which);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyState('idle'), 2000);
  }

  /**
   * Save the previewed image. Tries the Web Share API first (iOS Safari
   * surfaces "Save Image to Photos" in the share sheet), falls back to a
   * regular download anchor. The fetch happens whichever path runs —
   * so we don't redundantly load the image just to feature-detect.
   */
  async function saveImage() {
    setSaving(true);
    try {
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], imageFilename, { type: 'image/png' });

      const channel: ShareChannel = variant === 'portrait'
        ? 'image_saved_portrait'
        : 'image_saved_story';

      // Web Share API path — iOS gets "Save to Photos" + share-to-app
      const nav = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
        share?: (data: ShareData & { files?: File[] }) => Promise<void>;
      };
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        try {
          await nav.share({ files: [file], title: showName });
          onShare?.(channel);
          return;
        } catch (e) {
          // User cancelled the share sheet — that's a normal exit, no error
          if ((e as Error).name === 'AbortError') return;
          // Otherwise fall through to download
        }
      }

      // Fallback: classic download anchor. Works on every desktop browser
      // and on Android Chrome. iOS Safari may open the image inline rather
      // than download — the user can then long-press to save.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = imageFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Image saved — open Instagram or Facebook and post it', {
        duration: 5000,
      });
      onShare?.(channel);
    } catch (err) {
      console.error(err);
      toast.error('Could not save the image. Try long-pressing the preview.');
    } finally {
      setSaving(false);
    }
  }

  async function copyPost() {
    onShare?.('copy_post');
    try {
      await navigator.clipboard.writeText(sharePost);
      flashCopy('post');
      toast.success('Caption copied — paste it into Facebook, Instagram, or WhatsApp');
    } catch {
      toast.error('Could not copy. Long-press the preview to copy manually.');
    }
  }

  async function copyLink() {
    onShare?.('copy');
    try {
      await navigator.clipboard.writeText(shareUrl);
      flashCopy('link');
    } catch {
      toast.error('Could not copy the link.');
    }
  }

  return (
    <div
      id={id}
      className={cn(
        'flex flex-col gap-4 sm:gap-5',
        compact ? '' : 'mx-auto w-full max-w-2xl',
        className
      )}
    >
      {/* Format toggle */}
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setVariant('portrait')}
          className={cn(
            'rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition',
            variant === 'portrait'
              ? 'bg-stone-900 text-white'
              : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
          )}
        >
          Post · 4:5
        </button>
        <button
          type="button"
          onClick={() => setVariant('story')}
          className={cn(
            'rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition',
            variant === 'story'
              ? 'bg-stone-900 text-white'
              : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
          )}
        >
          Story · 9:16
        </button>
      </div>

      {/* Image preview — the visible artifact users are about to share */}
      <div
        className={cn(
          'mx-auto w-full overflow-hidden rounded-xl border border-amber-300/40 bg-stone-50 shadow-sm',
          variant === 'portrait' ? 'max-w-[280px] sm:max-w-[320px]' : 'max-w-[200px] sm:max-w-[240px]'
        )}
        style={{ aspectRatio: variant === 'portrait' ? '4 / 5' : '9 / 16' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={variant}
          src={imageUrl}
          alt={`${showName} share image preview`}
          className="size-full object-cover"
          loading="lazy"
        />
      </div>

      <p className="text-center text-xs text-stone-500">
        Tap <span className="font-semibold text-stone-700">Save image</span>, then post it on Instagram, Facebook, or WhatsApp.
      </p>

      {/* Primary action — Save image */}
      <Button
        type="button"
        onClick={saveImage}
        disabled={saving}
        className="h-12 w-full text-base font-semibold shadow-sm"
      >
        {saving ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Preparing image...
          </>
        ) : (
          <>
            <Download className="size-5" />
            Save image
          </>
        )}
      </Button>

      {/* Secondary actions */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button
          type="button"
          variant="outline"
          onClick={copyPost}
          className="h-11 gap-2 border-amber-300/50 bg-amber-50/50 text-amber-900 hover:bg-amber-100 hover:text-amber-900"
        >
          {copyState === 'post' ? (
            <>
              <Check className="size-4 text-emerald-600" />
              Caption copied
            </>
          ) : (
            <>
              <ClipboardList className="size-4" />
              Copy caption
            </>
          )}
        </Button>

        <WhatsappShareButton
          url={`${shareUrl}${shareUrl.includes('?') ? '&' : '?'}src=whatsapp`}
          title={sharePost}
          beforeOnClick={() => onShare?.('whatsapp')}
        >
          <Button
            asChild
            variant="outline"
            className="h-11 w-full gap-2 border-[#25D366]/40 bg-[#25D366]/10 text-[#1da851] hover:bg-[#25D366]/20 hover:text-[#1da851]"
          >
            <span>
              <WhatsappIcon size={16} round />
              WhatsApp
            </span>
          </Button>
        </WhatsappShareButton>

        <Button
          type="button"
          variant="outline"
          onClick={copyLink}
          className="h-11 gap-2"
        >
          {copyState === 'link' ? (
            <>
              <Check className="size-4 text-emerald-600" />
              Link copied
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
  );
}

/**
 * Big invitational card variant — used inline on the show page between
 * Judges and Entry Fees. Replaces the old <TellAFriend>.
 */
export function ShareKitCard(props: ShareKitProps) {
  return (
    <section
      id={props.id}
      className={cn(
        'mx-auto max-w-4xl scroll-mt-24 px-4 py-10 sm:px-6 sm:py-14 lg:px-8',
        props.className
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
            Share this show
          </p>
          <h3 className="mt-2 font-serif text-2xl font-bold leading-tight text-stone-900 sm:text-3xl">
            Spread the word in seconds
          </h3>
          <p className="mx-auto mt-3 max-w-lg text-stone-700">
            We&apos;ve made you a ready-to-post poster. Save the image, paste the caption, and you&apos;re done — perfect for breed groups on Facebook or WhatsApp.
          </p>

          <div className="mt-8">
            <ShareKit {...props} compact id={undefined} className={undefined} />
          </div>
        </div>
      </div>
    </section>
  );
}
