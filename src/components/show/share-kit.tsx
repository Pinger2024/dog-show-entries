'use client';

/**
 * Share Kit — task-first sharing for a WhatsApp-groups-and-Facebook-groups
 * audience (60+ UK dog-show secretaries and exhibitors).
 *
 * The hard part for this audience was never finding the share button — it
 * was knowing what to write. So the three primary actions (WhatsApp,
 * Facebook, Copy post) each hand over a ready-made caption + link; there's
 * no "choose an app, then compose a message" step. A poster image (for
 * Facebook posts, WhatsApp status, or printing) and the general OS share
 * sheet ("More apps…") are still available, tucked one tap further in.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  Share2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { buildSharePost } from '@/lib/share-caption';
import { SEDarkPanel, SEButton } from '@/components/show-experience/kit';
import { SE_H } from '@/components/show-experience/tokens';

// Free-text `channel` column on share_events (src/server/db/schema/share-events.ts)
// — safe to introduce new values without a migration. See DEVIATIONS.md.
type ShareChannel = 'whatsapp' | 'facebook' | 'copy_post' | 'copy_link' | 'poster_save' | 'native';

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

/** WhatsApp glyph — lucide doesn't ship one. Same path as the confirmation
 *  page's "Bring your ring-mates" share row (enter/page.tsx). */
function WhatsAppGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

/** Facebook glyph — lucide doesn't ship one. Same path as the confirmation
 *  page's share row (enter/page.tsx). */
function FacebookGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073" />
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
  const [postCopied, setPostCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [facebookCopied, setFacebookCopied] = useState(false);
  const [showPosterTools, setShowPosterTools] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const facebookCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
      if (linkCopyTimer.current) clearTimeout(linkCopyTimer.current);
      if (facebookCopyTimer.current) clearTimeout(facebookCopyTimer.current);
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

  /** "More apps…" — the general OS share sheet, for anything not covered
   *  by the WhatsApp/Facebook/Copy post task buttons (Messages, email,
   *  X, etc.). Falls back to a link copy where no share sheet exists. */
  async function shareViaMoreApps() {
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
      await copyText(shareUrl);
      toast.success('Link copied');
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        try {
          await copyText(shareUrl);
          toast.success('Link copied');
        } catch {
          toast.error('Could not share this show.');
        }
      }
    } finally {
      setBusy(null);
    }
  }

  /** Copy-link — link only, no caption. Small text action for people who
   *  just want the URL (pasting into a browser bar, a text field, etc).
   *  Feedback is in-place (the button label morphs to "Copied ✓" for
   *  ~1.6s, POLISH #9) rather than a toast — the button IS the
   *  confirmation. */
  async function copyShareLink() {
    setBusy('copy_link');
    onShare?.('copy_link');
    try {
      await copyText(shareUrl);
      setLinkCopied(true);
      if (linkCopyTimer.current) clearTimeout(linkCopyTimer.current);
      linkCopyTimer.current = setTimeout(() => setLinkCopied(false), 1600);
    } catch {
      toast.error('Could not copy the link.');
    } finally {
      setBusy(null);
    }
  }

  /** WhatsApp — hands wa.me the ready-made caption+URL so the message is
   *  fully written before the user's WhatsApp app even opens. */
  function whatsappHref() {
    return `https://wa.me/?text=${encodeURIComponent(sharePost)}`;
  }

  /** Facebook — device-aware, same proven pattern as the confirmation
   *  page's "Bring your ring-mates" share row (enter/page.tsx):
   *  mobile: the Facebook app hijacks facebook.com URLs and shows a blank
   *  screen (years-old Meta bug, no client-side fix), so we copy the
   *  ready-made post to the clipboard, show a brief in-place confirmation,
   *  and open facebook.com so the user can paste straight into a group.
   *  desktop: no app to intercept, so the web sharer popup works fine. */
  async function shareToFacebook() {
    setBusy('facebook');
    onShare?.('facebook');
    const fbShareUrl = `${shareUrl}?src=facebook`;
    const mobile =
      typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (mobile) {
      try {
        await copyText(sharePost);
        setFacebookCopied(true);
        if (facebookCopyTimer.current) clearTimeout(facebookCopyTimer.current);
        facebookCopyTimer.current = setTimeout(() => setFacebookCopied(false), 2200);
        window.open('https://www.facebook.com', '_blank', 'noopener,noreferrer');
      } catch {
        toast.error('Could not copy the post. Long-press to copy it manually.');
      } finally {
        setBusy(null);
      }
      return;
    }
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fbShareUrl)}`,
      '_blank',
      'noopener,noreferrer'
    );
    setBusy(null);
  }

  /** Save poster — the currently previewed format (portrait by default,
   *  or story if the user flipped the toggle). Best-effort copies the
   *  caption to the clipboard first (some share targets, e.g. Instagram,
   *  ignore share-sheet text for image attachments), then hands the image
   *  to the native share sheet where available, otherwise downloads it. */
  async function savePoster() {
    setBusy('poster_save');
    onShare?.('poster_save');
    try {
      await ensureCaptionOnClipboard();
      const file = await fetchVariantAsFile(previewVariant);
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
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Poster saved — the caption is copied too, ready to paste', {
        duration: 5000,
      });
    } catch (err) {
      console.error(err);
      toast.error('Could not save the poster.');
    } finally {
      setBusy(null);
    }
  }

  function flashPostCopied() {
    setPostCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setPostCopied(false), 2000);
  }

  /** Copy post — caption + URL together (POLISH-established `sharePost`),
   *  ready to paste into any app that doesn't get its own task button. */
  async function copyCaption() {
    setBusy('copy_post');
    onShare?.('copy_post');
    try {
      await copyText(sharePost);
      flashPostCopied();
      toast.success('Post copied — paste it anywhere');
    } catch {
      toast.error('Could not copy. Long-press the preview to copy manually.');
    } finally {
      setBusy(null);
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
      {/* PRIMARY — the three things a WhatsApp/Facebook-group secretary
          actually does. Each is task-first: the message is already
          written, they just pick where it goes. */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <SEButton
          asChild
          variant="fresh"
          className="h-11 w-full min-w-0 sm:flex-1"
        >
          <a
            href={whatsappHref()}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onShare?.('whatsapp')}
          >
            <WhatsAppGlyph size={17} />
            WhatsApp
          </a>
        </SEButton>
        <SEButton
          type="button"
          className="h-11 w-full min-w-0 whitespace-normal bg-se-cream text-center leading-tight text-se-deep sm:flex-1"
          onClick={shareToFacebook}
          disabled={busy !== null}
        >
          {busy === 'facebook' && !facebookCopied ? (
            <Loader2 className="size-4 shrink-0 animate-spin" />
          ) : facebookCopied ? (
            <Check className="size-4 shrink-0" />
          ) : (
            <FacebookGlyph size={16} />
          )}
          <span className={cn(facebookCopied && 'text-[11.5px]')}>
            {facebookCopied ? 'Post copied — paste it in your group' : 'Facebook'}
          </span>
        </SEButton>
        <SEButton
          type="button"
          // Spec calls for variant="onDark", but ShareKit's own buttons
          // always render on the white bg-se-surface inner card (both here
          // and in ShareKitDialog) — onDark's translucent-cream-on-dark
          // styling would be near-invisible text-on-white. Using the same
          // solid dark pill already established two blocks below for the
          // portrait/story toggle instead: same "muted third action" role,
          // readable contrast.
          className="h-11 w-full min-w-0 bg-se-ink text-white sm:flex-1"
          onClick={copyCaption}
          disabled={busy !== null}
        >
          {busy === 'copy_post' ? (
            <Loader2 className="size-4 animate-spin" />
          ) : postCopied ? (
            <Check className="size-4" />
          ) : (
            <Copy className="size-4" />
          )}
          {postCopied ? 'Copied ✓' : 'Copy post'}
        </SEButton>
      </div>

      {/* SECONDARY — poster tools, tucked behind a toggle so the primary
          card stays to the three obvious buttons. */}
      <div className="border-t border-se-line pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShowPosterTools((value) => !value)}
          className="h-10 w-full gap-2 text-se-ink2"
        >
          <ImageIcon className="size-4" />
          {showPosterTools ? 'Hide poster tools' : 'Show poster'}
        </Button>

        {showPosterTools && (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-center text-xs leading-[1.45] text-se-ink3">
              A ready-made poster for Facebook posts, WhatsApp status, or printing.
            </p>

            <div
              className={cn(
                'mx-auto w-full overflow-hidden rounded-xl border border-se-honey/40 bg-se-paper2 shadow-sm transition-all',
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
                    ? 'bg-se-ink text-white'
                    : 'bg-se-line text-se-ink3 hover:bg-se-line2'
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
                    ? 'bg-se-ink text-white'
                    : 'bg-se-line text-se-ink3 hover:bg-se-line2'
                )}
              >
                Story 9:16
              </button>
            </div>

            <SEButton
              type="button"
              variant="ghost"
              full
              className="h-11"
              onClick={savePoster}
              disabled={busy !== null}
            >
              {busy === 'poster_save' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Save poster
            </SEButton>

            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={shareViaMoreApps}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-se-ink2 disabled:opacity-60"
              >
                {busy === 'native' ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Share2 className="size-3.5" />
                )}
                More apps…
              </button>
              <button
                type="button"
                onClick={copyShareLink}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-se-ink2 disabled:opacity-60"
              >
                {busy === 'copy_link' ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : linkCopied ? (
                  <Check className="size-3.5 text-se-fresh-deep" />
                ) : (
                  <LinkIcon className="size-3.5" />
                )}
                {linkCopied ? 'Copied ✓' : 'Copy link'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Big invitational card variant — used inline on the show page, in the
 * "Spread the word" section.
 *
 * Container only is themed here (Show Experience green: dark pine gradient +
 * fresh radial glow, matching the hero) — the <ShareKit> widget inside keeps
 * its own light-surface styling untouched, wrapped in a small white card so
 * its se-ink-toned text/borders stay legible sitting on a dark background.
 */
export function ShareKitCard(props: ShareKitProps) {
  return (
    <section
      id={props.id}
      className={cn(
        'mx-auto max-w-4xl scroll-mt-24 px-5 py-8 sm:px-6 sm:py-10',
        props.className
      )}
    >
      <SEDarkPanel
        angle={165}
        className="rounded-[18px] p-[18px] pb-4"
        glowPosition="-right-10 -top-[30px]"
        glowSize="size-[150px]"
        glowOpacity="opacity-30"
        glowFade="70%"
      >
        <div className="relative mx-auto max-w-2xl text-center">
          <h3 className={cn(SE_H, 'font-semibold', 'text-balance text-[19px] leading-tight')}>
            Every share sells a few more entries.
          </h3>
          <p className="mx-auto mt-[3px] max-w-lg text-pretty text-[13px] leading-[1.45] text-se-cream-dim">
            One tap — the message is already written.
          </p>

          <div className="mt-6 rounded-2xl bg-se-surface p-4 text-left sm:p-5">
            <ShareKit {...props} compact id={undefined} className={undefined} />
          </div>
        </div>
      </SEDarkPanel>
    </section>
  );
}
