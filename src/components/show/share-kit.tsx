'use client';

/**
 * Share Kit — link-first sharing with optional poster assets.
 *
 * The normal mobile expectation is "tap Share, choose an app, send".
 * That works best when we share the show URL and let Open Graph create
 * the rich card inside WhatsApp, Messages, Facebook, etc. Poster images
 * remain available for Instagram or club publicity, but they are no
 * longer the main route through the UI.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Image as ImageIcon,
  Loader2,
  Share2,
} from 'lucide-react';
import { FacebookIcon, WhatsappIcon } from 'react-share';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { buildSharePost } from '@/lib/share-caption';

type ShareChannel =
  | 'native'
  | 'instagram_story'
  | 'instagram_post'
  | 'facebook'
  | 'whatsapp'
  | 'image_saved'
  | 'copy_post'
  | 'copy';

interface ShareKitProps {
  showId: string;
  showName: string;
  showType: string;
  showDate: string;
  organisationName: string;
  venueName?: string | null;
  /** Drives caption urgency line. */
  entryCloseDate?: string | Date | null;
  shareUrl: string;
  onShare?: (channel: ShareChannel) => void;
  /** Compact rendering for embedded use (e.g. inside a Dialog). */
  compact?: boolean;
  className?: string;
  id?: string;
}

/** Small Instagram glyph — lucide doesn't ship one. */
function InstagramGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

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
  // Which preview to show. The destination buttons that need a specific
  // format flip this on click so the preview matches what's about to go
  // out (and the user can see the version that'll be shared before they
  // pick).
  const [previewVariant, setPreviewVariant] = useState<'portrait' | 'story'>('portrait');
  const [busy, setBusy] = useState<ShareChannel | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'post' | 'link'>('idle');
  const [showPosterTools, setShowPosterTools] = useState(false);
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

  const previewUrl = `/api/shares/${showId}/${previewVariant}`;
  const baseFilename = showName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'show';

  const nativeShareText = `${showName} is now open for entries on Remi.`;
  const isMobile =
    typeof navigator !== 'undefined' &&
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  async function copyText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Fall through to the legacy copy path below. Local phone testing
        // over http://192.168.x.x often blocks the modern Clipboard API.
      }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);

    if (!copied) throw new Error('copy failed');
  }

  /**
   * Best-effort clipboard copy of the poster caption. Used only for
   * image-post flows where destination apps commonly ignore Web Share text.
   */
  async function ensureCaptionOnClipboard(): Promise<boolean> {
    try {
      await copyText(sharePost);
      return true;
    } catch {
      return false;
    }
  }

  async function fetchVariantAsFile(variant: 'portrait' | 'story'): Promise<File> {
    const res = await fetch(`/api/shares/${showId}/${variant}`);
    if (!res.ok) throw new Error(`share image fetch failed: ${res.status}`);
    const blob = await res.blob();
    return new File([blob], `${baseFilename}-${variant}.png`, { type: 'image/png' });
  }

  async function shareShowLink() {
    setBusy('native');
    onShare?.('native');
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: showName,
          text: nativeShareText,
          url: shareUrl,
        });
        return;
      }
      if (await copyLink()) toast.success('Link copied');
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        try {
          if (await copyLink()) toast.success('Link copied');
        } catch {
          toast.error('Could not share this show.');
        }
      }
    } finally {
      setBusy(null);
    }
  }

  /**
   * Instagram Story — browsers cannot pre-populate Instagram's native
   * story composer. We prepare the story-sized image and hand it to the
   * share sheet where supported, otherwise the image is saved.
   */
  async function shareToInstagramStory() {
    setPreviewVariant('story');
    setBusy('instagram_story');
    onShare?.('instagram_story');
    try {
      await ensureCaptionOnClipboard();
      await openShareSheet('story', 'instagram_story');
    } catch (err) {
      console.error(err);
      toast.error('Could not prepare the story image. Try Save image instead.');
    } finally {
      setBusy(null);
    }
  }

  /**
   * Generic "open the share sheet with the image attached" for poster
   * workflows. Falls back to a download if the platform refuses files.
   */
  async function openShareSheet(variant: 'portrait' | 'story', channel: ShareChannel) {
    const file = await fetchVariantAsFile(variant);
    const nav = navigator as Navigator & {
      canShare?: (data: { files?: File[] }) => boolean;
      share?: (data: ShareData & { files?: File[] }) => Promise<void>;
    };
    if (nav.canShare?.({ files: [file] }) && nav.share) {
      try {
        await nav.share({ files: [file], title: showName, text: sharePost });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    // Fallback — trigger a download. iOS Safari will open the image inline;
    // user can long-press → Save to Photos. Not ideal but better than nothing.
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Image saved — open Instagram or Facebook and post it', {
      duration: 5000,
    });
    void channel;
  }

  async function shareToInstagramPost() {
    setPreviewVariant('portrait');
    setBusy('instagram_post');
    onShare?.('instagram_post');
    try {
      await ensureCaptionOnClipboard();
      await openShareSheet('portrait', 'instagram_post');
    } catch (err) {
      console.error(err);
      toast.error('Could not open the share sheet. Try Save image instead.');
    } finally {
      setBusy(null);
    }
  }

  async function shareToFacebook() {
    setBusy('facebook');
    onShare?.('facebook');
    try {
      const facebookUrl = `${shareUrl}${shareUrl.includes('?') ? '&' : '?'}src=facebook`;
      // Mobile: the Facebook app often intercepts facebook.com/sharer URLs
      // and opens to a blank/no-op screen. The native share sheet is the
      // reliable path for installed apps on phones.
      if (isMobile) {
        if (navigator.share) {
          await navigator.share({
            title: showName,
            text: nativeShareText,
            url: facebookUrl,
          });
          return;
        }
        await copyText(facebookUrl);
        flashCopy('link');
        toast.success('Link copied — paste it into Facebook');
        return;
      }

      const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(facebookUrl)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        try {
          const facebookUrl = `${shareUrl}${shareUrl.includes('?') ? '&' : '?'}src=facebook`;
          await copyText(facebookUrl);
          flashCopy('link');
          toast.success('Link copied — paste it into Facebook');
        } catch {
          toast.error('Could not copy the link. Long-press the page address to copy it.');
        }
      }
    } finally {
      setBusy(null);
    }
  }

  function shareToWhatsapp() {
    setBusy('whatsapp');
    onShare?.('whatsapp');
    try {
      const whatsappUrl = `${shareUrl}${shareUrl.includes('?') ? '&' : '?'}src=whatsapp`;
      const text = `${nativeShareText}\n\n${whatsappUrl}`;
      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      // Quick reset — wa.me opens immediately, no async work to wait for.
      window.setTimeout(() => setBusy(null), 400);
    }
  }

  async function saveImage() {
    setBusy('image_saved');
    onShare?.('image_saved');
    try {
      const file = await fetchVariantAsFile(previewVariant);
      const nav = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
        share?: (data: ShareData & { files?: File[] }) => Promise<void>;
      };
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        try {
          await nav.share({ files: [file], title: showName });
          return;
        } catch (e) {
          if ((e as Error).name === 'AbortError') return;
        }
      }
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Image saved');
    } catch (err) {
      console.error(err);
      toast.error('Could not save the image.');
    } finally {
      setBusy(null);
    }
  }

  function flashCopy(which: 'post' | 'link') {
    setCopyState(which);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyState('idle'), 2000);
  }

  async function copyCaption() {
    onShare?.('copy_post');
    try {
      await copyText(sharePost);
      flashCopy('post');
      toast.success('Caption copied — paste it anywhere');
    } catch {
      toast.error('Could not copy. Long-press the preview to copy manually.');
    }
  }

  async function copyLink() {
    onShare?.('copy');
    try {
      await copyText(shareUrl);
      flashCopy('link');
      return true;
    } catch {
      toast.error('Could not copy the link.');
      return false;
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
      <Button
        type="button"
        onClick={shareShowLink}
        disabled={busy !== null}
        className="h-12 w-full gap-2 text-base font-semibold"
      >
        {busy === 'native' ? <Loader2 className="size-5 animate-spin" /> : <Share2 className="size-5" />}
        Share show link
      </Button>

      <div className="grid grid-cols-3 gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={shareToWhatsapp}
          disabled={busy !== null}
          className="h-11 gap-1.5"
        >
          {busy === 'whatsapp' ? <Loader2 className="size-4 animate-spin" /> : <WhatsappIcon size={18} round />}
          WhatsApp
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={shareToFacebook}
          disabled={busy !== null}
          className="h-11 gap-1.5"
        >
          {busy === 'facebook' ? <Loader2 className="size-4 animate-spin" /> : <FacebookIcon size={18} round />}
          Facebook
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={copyLink}
          className="h-11 gap-1.5"
        >
          {copyState === 'link' ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
          Copy
        </Button>
      </div>

      <div className="border-t border-stone-200 pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShowPosterTools((value) => !value)}
          className="h-10 w-full gap-2 text-stone-700"
        >
          <ImageIcon className="size-4" />
          {showPosterTools ? 'Hide poster tools' : 'Create Instagram poster'}
        </Button>

        {showPosterTools && (
          <div className="mt-4 flex flex-col gap-4">
            <div
              className={cn(
                'mx-auto w-full overflow-hidden rounded-xl border border-amber-300/40 bg-stone-50 shadow-sm transition-all',
                previewVariant === 'portrait' ? 'max-w-[280px] sm:max-w-[320px]' : 'max-w-[200px] sm:max-w-[240px]'
              )}
              style={{ aspectRatio: previewVariant === 'portrait' ? '4 / 5' : '9 / 16' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={previewVariant}
                src={previewUrl}
                alt={`${showName} share image preview`}
                className="size-full object-cover"
                loading="lazy"
              />
            </div>

            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setPreviewVariant('portrait')}
                className={cn(
                  'rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider transition',
                  previewVariant === 'portrait'
                    ? 'bg-stone-900 text-white'
                    : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                )}
              >
                Post 4:5
              </button>
              <button
                type="button"
                onClick={() => setPreviewVariant('story')}
                className={cn(
                  'rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider transition',
                  previewVariant === 'story'
                    ? 'bg-stone-900 text-white'
                    : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                )}
              >
                Story 9:16
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={shareToInstagramPost}
                disabled={busy !== null}
                className="h-11 gap-1.5"
              >
                {busy === 'instagram_post' ? <Loader2 className="size-4 animate-spin" /> : <InstagramGlyph size={18} />}
                Instagram Post
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={shareToInstagramStory}
                disabled={busy !== null}
                className="h-11 gap-1.5"
              >
                {busy === 'instagram_story' ? <Loader2 className="size-4 animate-spin" /> : <InstagramGlyph size={18} />}
                Story
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={saveImage}
                disabled={busy !== null}
                className="h-9 gap-1.5 text-stone-700"
              >
                {busy === 'image_saved' ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                Save image
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={copyCaption}
                className="h-9 gap-1.5 text-stone-700"
              >
                {copyState === 'post' ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                Copy caption
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Big invitational card variant — used inline on the show page between
 * Judges and Entry Fees.
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
            Share the link in one tap
          </h3>
          <p className="mx-auto mt-3 max-w-lg text-stone-700">
            Send the show link by WhatsApp, Facebook, Messages or email. The preview card appears automatically.
          </p>

          <div className="mt-8">
            <ShareKit {...props} compact id={undefined} className={undefined} />
          </div>
        </div>
      </div>
    </section>
  );
}
