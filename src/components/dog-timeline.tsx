'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { format } from 'date-fns';
import {
  Trophy,
  Award,
  Loader2,
  ImagePlus,
  Trash2,
  X,
  PenLine,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getPlacementLabel, placementColors } from '@/lib/placements';
import { formatRelativeDate } from '@/lib/date-utils';
import { showTypeLabels } from '@/lib/show-types';

/* ─── Post creation form ─── */

function CreatePost({
  dogId,
  onPostCreated,
}: {
  dogId: string;
  onPostCreated: () => void;
}) {
  const [caption, setCaption] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadedImage, setUploadedImage] = useState<{
    url: string;
    key: string;
  } | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [showVideoInput, setShowVideoInput] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createPost = trpc.timeline.createPost.useMutation({
    onSuccess: () => {
      setCaption('');
      setImagePreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setUploadedImage(null);
      setVideoUrl('');
      setShowVideoInput(false);
      setExpanded(false);
      onPostCreated();
    },
    onError: (err) => toast.error(err.message),
  });

  async function handleFileSelect(file: File) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Only JPEG, PNG, and WebP images are supported');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }

    setImagePreview(URL.createObjectURL(file));
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('dogId', dogId);

    try {
      const res = await fetch('/api/upload/timeline-photo', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }
      const { url, key } = await res.json();
      setUploadedImage({ url, key });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
      setImagePreview(null);
    } finally {
      setUploading(false);
    }
  }

  function removeImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    setUploadedImage(null);
  }

  function handleSubmit() {
    const trimmedVideo = videoUrl.trim();
    if (!caption.trim() && !uploadedImage && !trimmedVideo) return;
    createPost.mutate({
      dogId,
      caption: caption.trim() || undefined,
      imageUrl: uploadedImage?.url,
      imageStorageKey: uploadedImage?.key,
      videoUrl: trimmedVideo || undefined,
      type: trimmedVideo ? 'video' : uploadedImage ? 'photo' : 'note',
    });
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex w-full items-center gap-3 rounded-sm border border-stone-200 bg-white px-4 py-3 text-left text-sm text-stone-400 transition-colors hover:border-stone-300 hover:text-stone-500"
      >
        <PenLine className="size-4" />
        Share a moment...
      </button>
    );
  }

  return (
    <div className="rounded-sm border border-stone-200 bg-white p-4">
      <Textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="What's happening with your dog today?"
        rows={3}
        maxLength={2000}
        className="resize-none border-0 p-0 text-[0.9375rem] shadow-none focus-visible:ring-0"
        autoFocus
      />

      {/* Image preview */}
      {imagePreview && (
        <div className="relative mt-3 overflow-hidden rounded-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imagePreview}
            alt="Preview"
            className="max-h-48 w-full object-contain bg-stone-50"
          />
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60">
              <Loader2 className="size-5 animate-spin text-stone-500" />
            </div>
          )}
          <button
            onClick={removeImage}
            className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-black/50 text-white"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Video URL input */}
      {showVideoInput && (
        <div className="mt-3 flex items-center gap-2">
          <input
            type="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="Paste YouTube or Vimeo link"
            className="flex-1 rounded-sm border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-700 placeholder:text-stone-300 focus:border-stone-400 focus:outline-none"
          />
          <button
            onClick={() => { setShowVideoInput(false); setVideoUrl(''); }}
            className="flex size-6 items-center justify-center rounded-full text-stone-300 hover:text-stone-500"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs text-stone-500 transition-colors hover:bg-stone-50 hover:text-stone-700"
          >
            <ImagePlus className="size-3.5" />
            Photo
          </button>
          <button
            type="button"
            onClick={() => setShowVideoInput(!showVideoInput)}
            className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs text-stone-500 transition-colors hover:bg-stone-50 hover:text-stone-700"
          >
            <Video className="size-3.5" />
            Video
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
              e.target.value = '';
            }}
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setExpanded(false);
              setCaption('');
              setVideoUrl('');
              setShowVideoInput(false);
              removeImage();
            }}
            className="h-8 text-xs"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={
              createPost.isPending ||
              uploading ||
              (!caption.trim() && !uploadedImage && !videoUrl.trim())
            }
            className="h-8 text-xs"
          >
            {createPost.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              'Post'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Timeline view ─── */

export function DogTimeline({
  dogId,
  isOwner,
}: {
  dogId: string;
  isOwner: boolean;
}) {
  const { data: session } = useSession();
  const utils = trpc.useUtils();

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.timeline.getForDog.useInfiniteQuery(
      { dogId, limit: 15 },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      }
    );

  const deletePost = trpc.timeline.deletePost.useMutation({
    onSuccess: () => {
      utils.timeline.getForDog.invalidate({ dogId });
    },
    onError: (err) => toast.error(err.message),
  });

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-4">
      {/* Post creation (for dog owners only) */}
      {isOwner && session?.user && (
        <CreatePost
          dogId={dogId}
          onPostCreated={() => utils.timeline.getForDog.invalidate({ dogId })}
        />
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="size-5 animate-spin text-stone-300" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && items.length === 0 && (
        <div className="py-12 text-center">
          <PenLine className="mx-auto size-8 text-stone-200" />
          <p className="mt-3 font-serif text-sm italic text-stone-400">
            {isOwner
              ? 'Share your first moment — show results will appear here automatically'
              : 'No timeline posts yet. Show results will appear here as they come in.'}
          </p>
        </div>
      )}

      {/* Timeline items */}
      {items.map((item) => {
        if (item.itemType === 'show_result') {
          return (
            <ShowResultCard
              key={item.id}
              item={item as ShowResultItem}
            />
          );
        }

        return (
          <UserPostCard
            key={item.id}
            item={item as UserPostItem}
            canDelete={
              isOwner ||
              (item as UserPostItem).author?.id === session?.user?.id
            }
            onDelete={() => deletePost.mutate({ postId: item.id })}
            deleting={deletePost.isPending}
          />
        );
      })}

      {/* Load more */}
      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="h-9 gap-1.5 text-xs text-stone-500"
          >
            {isFetchingNextPage ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              'Load more'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ─── Timeline item types ─── */

interface ShowResultItem {
  itemType: 'show_result';
  id: string;
  createdAt: Date;
  show: {
    id: string;
    name: string;
    date: string;
    showType: string;
  };
  classes: {
    className: string;
    classNumber: number | null;
    placement: number | null;
    specialAward: string | null;
    critiqueText: string | null;
  }[];
}

interface UserPostItem {
  itemType: 'post';
  id: string;
  createdAt: Date;
  type: string;
  caption: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  pinned: boolean;
  author: { id: string; name: string | null } | null;
}

/* ─── Show result card ─── */

function ShowResultCard({ item }: { item: ShowResultItem }) {
  const bestPlacement = Math.min(
    ...item.classes.map((c) => c.placement ?? 99)
  );
  const hasSpecialAward = item.classes.some((c) => c.specialAward);

  return (
    <div className="rounded-sm border border-amber-200/40 bg-gradient-to-b from-amber-50/30 to-transparent p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
          <Trophy className="size-4 text-amber-600" />
        </div>
        <div className="min-w-0 flex-1">
          <Link
            href={`/shows/${item.show.id}/results`}
            className="font-serif text-[0.9375rem] font-bold text-stone-800 hover:text-stone-600"
          >
            {item.show.name}
          </Link>
          <p className="text-xs text-stone-400">
            {format(new Date(item.show.date), 'd MMMM yyyy')}
          </p>

          <div className="mt-2.5 space-y-1">
            {item.classes.map((cls, i) => (
              <div key={i} className="flex flex-wrap items-center gap-1.5 text-sm">
                <span className="text-stone-600">{cls.className}</span>
                {cls.placement && (
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-semibold ${placementColors[cls.placement] ?? ''}`}
                  >
                    {getPlacementLabel(cls.placement)}
                  </Badge>
                )}
                {cls.specialAward && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700">
                    <Award className="size-2.5" />
                    {cls.specialAward}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 text-right text-[0.6875rem] text-stone-300">
        {formatRelativeDate(new Date(item.show.date))}
      </p>
    </div>
  );
}

/* ─── User post card ─── */

function UserPostCard({
  item,
  canDelete,
  onDelete,
  deleting,
}: {
  item: UserPostItem;
  canDelete: boolean;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div className="group rounded-sm border border-stone-100 bg-white p-4">
      {item.caption && (
        <p className="text-[0.9375rem] leading-relaxed text-stone-700">
          {item.caption}
        </p>
      )}
      {item.imageUrl && (
        <div className="mt-3 overflow-hidden rounded-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.imageUrl}
            alt={item.caption || 'Timeline photo'}
            className="max-h-80 w-full object-contain bg-stone-50"
          />
        </div>
      )}
      {item.videoUrl && <VideoEmbed url={item.videoUrl} />}
      <div className="mt-2.5 flex items-center justify-between">
        <p className="text-[0.6875rem] text-stone-300">
          {item.author?.name && (
            <span className="text-stone-400">{item.author.name} &middot; </span>
          )}
          {formatRelativeDate(new Date(item.createdAt))}
        </p>
        {canDelete && (
          <button
            onClick={onDelete}
            disabled={deleting}
            className="flex size-6 items-center justify-center rounded-full text-stone-300 opacity-0 transition-all hover:bg-stone-50 hover:text-stone-500 group-hover:opacity-100"
            title="Delete post"
          >
            <Trash2 className="size-3" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Video embed (YouTube / Vimeo) ─── */

function VideoEmbed({ url }: { url: string }) {
  const embedUrl = getEmbedUrl(url);

  if (!embedUrl) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex items-center gap-2 rounded-sm border border-stone-100 bg-stone-50 px-3 py-2.5 text-xs text-stone-500 transition-colors hover:border-stone-200 hover:text-stone-700"
      >
        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        Watch video
      </a>
    );
  }

  return (
    <div className="mt-3 aspect-video overflow-hidden rounded-sm bg-stone-50">
      <iframe
        src={embedUrl}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="h-full w-full border-0"
        title="Video"
      />
    </div>
  );
}

function getEmbedUrl(url: string): string | null {
  // YouTube
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (ytMatch) return `https://www.youtube-nocookie.com/embed/${ytMatch[1]}`;

  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;

  return null;
}
