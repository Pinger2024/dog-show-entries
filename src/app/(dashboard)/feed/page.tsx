'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  Loader2,
  Trophy,
  Award,
  Rss,
  Dog,
  Heart,
  ChevronDown,
} from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getPlacementLabel, placementColors } from '@/lib/placements';
import { formatRelativeDate } from '@/lib/date-utils';

export default function FeedPage() {
  const [mobileFollowingOpen, setMobileFollowingOpen] = useState(false);
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.timeline.getFeed.useInfiniteQuery(
      { limit: 20 },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      }
    );

  const { data: followedDogs } = trpc.follows.getFollowedDogs.useQuery();

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-8 pb-16 md:pb-0">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
          My Feed
        </h1>
        <p className="mt-1.5 text-muted-foreground">
          Updates from dogs you follow and your own dogs.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        {/* Main feed */}
        <div>
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-16 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
                <Rss className="size-7 text-primary" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-semibold">Your feed is empty</h3>
                <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                  Follow dogs to see their updates and show results here.
                  Browse shows to discover dogs, or share your own dogs&apos; moments.
                </p>
              </div>
              <Link href="/shows">
                <Button variant="outline" size="sm">
                  Browse shows
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <FeedItem key={item.id} item={item} />
              ))}

              {hasNextPage && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? (
                      <Loader2 className="mr-1.5 size-4 animate-spin" />
                    ) : null}
                    Load more
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mobile: followed dogs (collapsible) */}
        <div className="lg:hidden">
          <button
            onClick={() => setMobileFollowingOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg border p-3 text-left"
          >
            <span className="flex items-center gap-2 font-serif text-sm font-semibold">
              <Heart className="size-3.5 text-muted-foreground" />
              Following
              {followedDogs && followedDogs.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  ({followedDogs.length})
                </span>
              )}
            </span>
            <ChevronDown
              className={`size-4 text-muted-foreground transition-transform ${mobileFollowingOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {mobileFollowingOpen && (
            <div className="mt-2 rounded-lg border p-3">
              {!followedDogs || followedDogs.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  You&apos;re not following any dogs yet. Visit a dog&apos;s profile and click Follow.
                </p>
              ) : (
                <div className="space-y-2">
                  {followedDogs.map((dog) => (
                    <Link
                      key={dog.id}
                      href={`/dog/${dog.id}`}
                      className="flex items-center gap-2.5 rounded-md p-1.5 transition-colors hover:bg-muted/50"
                    >
                      {dog.photoUrl ? (
                        <Image
                          src={dog.photoUrl}
                          alt={dog.registeredName}
                          width={32}
                          height={32}
                          className="size-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                          <Dog className="size-3.5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">
                          {dog.registeredName}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {dog.breed}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar: followed dogs (desktop) */}
        <div className="hidden lg:block">
          <div className="sticky top-6 rounded-lg border p-4">
            <h3 className="flex items-center gap-2 font-serif text-sm font-semibold">
              <Heart className="size-3.5 text-muted-foreground" />
              Following
            </h3>
            {!followedDogs || followedDogs.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                You&apos;re not following any dogs yet. Visit a dog&apos;s profile and click Follow.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {followedDogs.map((dog) => (
                  <Link
                    key={dog.id}
                    href={`/dog/${dog.id}`}
                    className="flex items-center gap-2.5 rounded-md p-1.5 transition-colors hover:bg-muted/50"
                  >
                    {dog.photoUrl ? (
                      <Image
                        src={dog.photoUrl}
                        alt={dog.registeredName}
                        width={32}
                        height={32}
                        className="size-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                        <Dog className="size-3.5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">
                        {dog.registeredName}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {dog.breed}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Feed item component ─── */

type FeedItemData = {
  itemType: string;
  id: string;
  createdAt: Date;
  dog?: {
    id: string;
    registeredName: string;
    breed: string | null;
    photoUrl: string | null;
  };
  // Show result fields
  show?: {
    id: string;
    name: string;
    date: string;
    showType: string;
  };
  classes?: {
    className: string;
    classNumber: number | null;
    placement: number | null;
    specialAward: string | null;
  }[];
  // User post fields
  caption?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  type?: string;
  author?: { id: string; name: string | null } | null;
};

function FeedItem({ item }: { item: FeedItemData }) {
  const dog = item.dog;

  return (
    <div className="rounded-lg border bg-card p-4 sm:p-5">
      {/* Dog header */}
      {dog && (
        <Link
          href={`/dog/${dog.id}`}
          className="mb-3 flex items-center gap-2.5"
        >
          {dog.photoUrl ? (
            <Image
              src={dog.photoUrl}
              alt={dog.registeredName}
              width={36}
              height={36}
              className="size-9 rounded-full object-cover"
            />
          ) : (
            <div className="flex size-9 items-center justify-center rounded-full bg-muted">
              <Dog className="size-4 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-serif text-sm font-semibold hover:underline">
              {dog.registeredName}
            </p>
            {dog.breed && (
              <p className="text-[10px] text-muted-foreground">{dog.breed}</p>
            )}
          </div>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {formatRelativeDate(new Date(item.createdAt))}
          </span>
        </Link>
      )}

      {/* Show result content */}
      {item.itemType === 'show_result' && item.show && (
        <div className="rounded-md border border-amber-200/40 bg-amber-50/20 p-3">
          <div className="flex items-start gap-2.5">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-100">
              <Trophy className="size-3.5 text-amber-600" />
            </div>
            <div className="min-w-0 flex-1">
              <Link
                href={`/shows/${item.show.slug ?? item.show.id}/results`}
                className="font-serif text-sm font-bold hover:underline"
              >
                {item.show.name}
              </Link>
              <p className="text-[10px] text-muted-foreground">
                {format(new Date(item.show.date), 'd MMMM yyyy')}
              </p>
              {item.classes && (
                <div className="mt-2 space-y-1">
                  {item.classes.map((cls, i) => (
                    <div
                      key={i}
                      className="flex flex-wrap items-center gap-1.5 text-xs"
                    >
                      <span>{cls.className}</span>
                      {cls.placement && (
                        <Badge
                          variant="outline"
                          className={`text-[9px] font-semibold ${placementColors[cls.placement] ?? ''}`}
                        >
                          {getPlacementLabel(cls.placement)}
                        </Badge>
                      )}
                      {cls.specialAward && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-amber-700">
                          <Award className="size-2" />
                          {cls.specialAward}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* User post content */}
      {item.itemType === 'post' && (
        <>
          {item.caption && (
            <p className="text-[0.9375rem] leading-relaxed">{item.caption}</p>
          )}
          {item.imageUrl && (
            <div className="mt-2 overflow-hidden rounded-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.imageUrl}
                alt={item.caption || 'Timeline photo'}
                className="max-h-80 w-full object-contain bg-muted/30"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
