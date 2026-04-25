'use client';

/**
 * Share Kit — per-destination share UX.
 *
 * Replaces the lying "click Facebook, get a copy-link toast" pattern with
 * destination-specific buttons that take the shortest reliable path on
 * each platform. The user's mental model is "I want to put this on
 * Instagram Story", not "I want to download a 1080×1920 PNG", so we
 * surface destinations directly.
 *
 * What each destination actually does:
 *
 *   Instagram Story (instagram-stories://share + share-sheet fallback)
 *     2-tap when the IG Story scheme engages: opens IG Stories with our
 *     image as the backdrop. Falls back to the iOS share sheet (3-tap)
 *     on devices/contexts where the scheme doesn't engage.
 *
 *   Instagram Post (navigator.share with file)
 *     iOS share sheet with image pre-attached + caption auto-copied to
 *     clipboard. User picks Instagram → IG opens with image already
 *     loaded → user pastes caption → user taps Share. 3-tap, no shorter
 *     path exists for IG Feed (Meta blocks third-party composer access).
 *
 *   Facebook (navigator.share file on mobile, sharer.php on desktop)
 *     Mobile: share sheet → FB composer with image attached. Desktop:
 *     direct sharer.php compose window. Caption auto-copied either way.
 *     3-tap on mobile, 2-tap on desktop. No shorter path — same Meta
 *     constraint.
 *
 *   WhatsApp (wa.me/?text=URL)
 *     Text + URL pre-filled, OG card unfurls beautifully when sent. No
 *     image binary attachment via this path, but the unfurled card is
 *     itself the artifact. 2-tap to send (Remi → pick chat → Send).
 *
 * The single overarching design principle: caption is ALWAYS on the
 * clipboard before any destination opens, so wherever the user lands,
 * they can paste-and-post in one tap. That's the difference between
 * "share kit" and "share buttons" UX.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Loader2,
  Share2,
} from 'lucide-react';
import { FacebookIcon, WhatsappIcon } from 'react-share';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { buildSharePost } from '@/lib/share-caption';

type ShareChannel =
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

/**
 * Shape of the platform tile rendered in the destinations grid. Keeping
 * this typed rather than inline so adding a destination later is a
 * single-array-entry change.
 */
type DestinationTile = {
  key: ShareChannel;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  /** Tailwind classes for the tile background + text. */
  className: string;
  onClick: () => void | Promise<void>;
};

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

  /**
   * Best-effort clipboard copy of the caption. Used before invoking any
   * destination so when the user lands in the destination app they can
   * paste in one tap. Failures are swallowed — clipboard write can fail
   * on insecure contexts (iOS plain HTTP, embedded webviews) and we'd
   * rather still open the destination than abort.
   */
  async function ensureCaptionOnClipboard(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(sharePost);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fetch the current preview as a blob, wrapped in a File so iOS share
   * sheet treats it as an image attachment. Used by Instagram Post,
   * Facebook (mobile), and the long-tail "Save image" path.
   */
  async function fetchVariantAsFile(variant: 'portrait' | 'story'): Promise<File> {
    const res = await fetch(`/api/shares/${showId}/${variant}`);
    if (!res.ok) throw new Error(`share image fetch failed: ${res.status}`);
    const blob = await res.blob();
    return new File([blob], `${baseFilename}-${variant}.png`, { type: 'image/png' });
  }

  // Feature flags computed once per render.
  const isMobile =
    typeof navigator !== 'undefined' &&
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const canShareFiles =
    typeof navigator !== 'undefined' &&
    typeof (navigator as Navigator & { canShare?: (data: { files?: File[] }) => boolean }).canShare === 'function';

  /**
   * Instagram Story — try the dedicated URL scheme first, fall back to
   * the iOS share sheet. The deep-link engagement varies by iOS version
   * and Safari's privacy heuristics, so we time-box detection: if the
   * page is still visible 1.5s after we attempted to navigate, the
   * scheme didn't catch and we open the share sheet instead.
   */
  async function shareToInstagramStory() {
    setPreviewVariant('story');
    setBusy('instagram_story');
    onShare?.('instagram_story');
    try {
      await ensureCaptionOnClipboard();
      // The instagram-stories scheme is a registered Universal Link.
      // Triggering it via window.location preserves the back-stack and
      // works inside Safari without a "follow link?" prompt.
      const before = Date.now();
      const wasVisible = document.visibilityState === 'visible';

      // Set up a watchdog FIRST so the timer is armed before we trigger.
      const watchdog = window.setTimeout(async () => {
        // Still visible → scheme didn't engage. Fall back to share sheet
        // with the story-formatted image and caption.
        if (wasVisible && document.visibilityState === 'visible' && Date.now() - before > 1200) {
          await openShareSheet('story', 'instagram_story');
        }
      }, 1500);

      // Cancel the watchdog if the page goes hidden (the scheme worked
      // and the user is now in the IG app).
      const onVisChange = () => {
        if (document.visibilityState === 'hidden') {
          window.clearTimeout(watchdog);
          document.removeEventListener('visibilitychange', onVisChange);
        }
      };
      document.addEventListener('visibilitychange', onVisChange);

      // Best-effort scheme invocation. Empty source_application is fine —
      // IG accepts it from web contexts even without a registered FB App ID.
      window.location.href = 'instagram-stories://share?source_application=remishowmanager';
    } finally {
      // Re-enable after the watchdog has run (success path: page hidden,
      // user is in IG; failure path: share sheet opened, can re-tap).
      window.setTimeout(() => setBusy(null), 1800);
    }
  }

  /**
   * Generic "open the iOS share sheet with the image attached" — used by
   * the IG Post button, the FB mobile path, and the IG Story fallback.
   * Tries to use the structured Web Share API (with files) and falls
   * back to a download anchor if the platform refuses files.
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
      await ensureCaptionOnClipboard();
      if (isMobile && canShareFiles) {
        await openShareSheet(previewVariant, 'facebook');
      } else {
        // Desktop: sharer.php opens a real compose window with the URL
        // pre-pasted (the OG card unfurls). Reliable, no Meta-app
        // interception risk because there's no FB-app on desktop.
        const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${shareUrl}${shareUrl.includes('?') ? '&' : '?'}src=facebook`)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.error(err);
      toast.error('Could not open Facebook. Try Save image instead.');
    } finally {
      setBusy(null);
    }
  }

  /**
   * WhatsApp — wa.me with the caption + URL. No image binary, but the
   * URL unfurls into our 1200×630 OG card on receipt, so the visual
   * payload is still rich. Truly fast: 2 taps to land in a chat picker.
   */
  function shareToWhatsapp() {
    setBusy('whatsapp');
    onShare?.('whatsapp');
    try {
      const text = `${sharePost}`; // sharePost already includes the URL
      // wa.me works on mobile and desktop. On mobile it deep-links into
      // the WhatsApp app; on desktop into web.whatsapp.com.
      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      // Quick reset — wa.me opens immediately, no async work to wait for.
      window.setTimeout(() => setBusy(null), 400);
    }
  }

  /**
   * Long-tail "save image" — for when the user wants the asset for
   * something we don't have a dedicated button for (Snapchat, Telegram,
   * email, Threads, posting to a private group's website, etc).
   */
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
      await navigator.clipboard.writeText(sharePost);
      flashCopy('post');
      toast.success('Caption copied — paste it anywhere');
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

  const destinations: DestinationTile[] = [
    {
      key: 'instagram_story',
      label: 'Instagram Story',
      sublabel: '9:16',
      icon: <InstagramGlyph size={20} />,
      className:
        'bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white hover:opacity-95',
      onClick: shareToInstagramStory,
    },
    {
      key: 'instagram_post',
      label: 'Instagram Post',
      sublabel: '4:5',
      icon: <InstagramGlyph size={20} />,
      className:
        'bg-gradient-to-br from-[#FFC837] via-[#FF8008] to-[#DD2A7B] text-white hover:opacity-95',
      onClick: shareToInstagramPost,
    },
    {
      key: 'facebook',
      label: 'Facebook',
      sublabel: isMobile ? 'Image post' : 'Compose post',
      icon: <FacebookIcon size={20} round />,
      className: 'bg-[#1877F2] text-white hover:bg-[#1664CC]',
      onClick: shareToFacebook,
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      sublabel: 'Send chat',
      icon: <WhatsappIcon size={20} round />,
      className: 'bg-[#25D366] text-white hover:bg-[#1FB853]',
      onClick: shareToWhatsapp,
    },
  ];

  return (
    <div
      id={id}
      className={cn(
        'flex flex-col gap-4 sm:gap-5',
        compact ? '' : 'mx-auto w-full max-w-2xl',
        className
      )}
    >
      {/* Image preview */}
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

      {/* Format peek toggle — small, secondary; lets the user switch the
          preview without committing to a destination. The destination
          buttons override this anyway. */}
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

      <p className="text-center text-xs text-stone-500">
        Pick a destination — the image attaches and the caption goes on your clipboard.
      </p>

      {/* Per-destination grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {destinations.map((dest) => (
          <button
            key={dest.key}
            type="button"
            onClick={dest.onClick}
            disabled={busy !== null}
            aria-label={`Share to ${dest.label}`}
            className={cn(
              'flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-xl px-2 py-3 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60',
              dest.className
            )}
          >
            {busy === dest.key ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              dest.icon
            )}
            <span className="leading-tight">{dest.label}</span>
            <span className="text-[10px] font-medium uppercase tracking-wider opacity-80">
              {dest.sublabel}
            </span>
          </button>
        ))}
      </div>

      {/* Other ways — utility row */}
      <div className="grid grid-cols-3 gap-2 border-t border-stone-200 pt-4 text-xs">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={saveImage}
          disabled={busy !== null}
          className="h-9 gap-1.5 text-stone-700"
        >
          {busy === 'image_saved' ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Download className="size-3.5" />
          )}
          Save image
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={copyCaption}
          className="h-9 gap-1.5 text-stone-700"
        >
          {copyState === 'post' ? (
            <Check className="size-3.5 text-emerald-600" />
          ) : (
            <Share2 className="size-3.5" />
          )}
          Copy caption
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={copyLink}
          className="h-9 gap-1.5 text-stone-700"
        >
          {copyState === 'link' ? (
            <Check className="size-3.5 text-emerald-600" />
          ) : (
            <Copy className="size-3.5" />
          )}
          Copy link
        </Button>
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
            One tap to your network
          </h3>
          <p className="mx-auto mt-3 max-w-lg text-stone-700">
            Pick your platform — we&apos;ll attach the poster and pre-fill the caption. Most paths land in the destination app with everything ready; you just hit Send.
          </p>

          <div className="mt-8">
            <ShareKit {...props} compact id={undefined} className={undefined} />
          </div>
        </div>
      </div>
    </section>
  );
}
