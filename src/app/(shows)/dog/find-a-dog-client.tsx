'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Search } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Input } from '@/components/ui/input';
import { SE_H } from '@/components/show-experience/tokens';
import { useDebounce } from '@/hooks/use-debounce';
import { cn } from '@/lib/utils';

/**
 * Find a Dog (Mandy, 1 Oct 2026): type part of a dog's name, tap the dog, read
 * its results and judges' critiques. Only dogs that have already been judged at
 * a show run on Remi ever come up — never one known only from an upcoming
 * entry (services/public-dog-summary.ts → lib/public-dog-history.ts).
 */

const MIN_LETTERS = 2;

const sexLabel = (sex: 'dog' | 'bitch') => (sex === 'dog' ? 'Dog' : 'Bitch');
const showsLabel = (n: number) => `Shown at ${n} Remi show${n === 1 ? '' : 's'}`;
const critiquesLabel = (n: number) => (n === 1 ? "1 judge's critique" : `${n} judges' critiques`);

export function FindADogClient() {
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query.trim(), 300);
  const ready = debounced.length >= MIN_LETTERS;

  const { data: dogs, isFetching, isError } = trpc.dogs.searchPublic.useQuery(
    { query: debounced },
    { enabled: ready, staleTime: 60_000 },
  );

  const waiting = query.trim().length >= MIN_LETTERS && (debounced !== query.trim() || isFetching);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8 sm:px-8 sm:pt-12">
      <h1 className={cn(SE_H, 'font-serif text-3xl text-foreground sm:text-4xl')}>Find a Dog</h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
        Look up a dog that has been shown at a Remi show, and read its results and the judges&rsquo; critiques.
      </p>

      <label htmlFor="find-a-dog" className="mt-8 block text-base font-semibold text-foreground">
        Dog&rsquo;s name
      </label>
      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="find-a-dog"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type part of the name"
          className="h-14 rounded-xl pl-12 text-lg sm:h-14 md:text-lg"
        />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Any part of the name will do, such as the kennel name.
      </p>

      <div aria-live="polite" className="mt-8">
        {waiting && <p className="text-base text-muted-foreground">Searching&hellip;</p>}

        {!waiting && ready && isError && (
          <p className="text-base text-foreground">Sorry, something went wrong. Please try again.</p>
        )}

        {!waiting && ready && !isError && dogs && dogs.length === 0 && (
          <div className="rounded-xl border bg-muted/40 p-5">
            <p className="text-base font-semibold text-foreground">No dogs found with that name.</p>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              A dog appears here once it has been judged at a show run on Remi and the results have been
              published.
            </p>
          </div>
        )}

        {!waiting && ready && !isError && dogs && dogs.length > 0 && (
          <>
            <p className="text-sm font-medium text-muted-foreground">
              {dogs.length === 1 ? '1 dog found' : `${dogs.length} dogs found`}
            </p>
            <ul className="mt-3 space-y-3">
              {dogs.map((dog) => (
                <li key={dog.id}>
                  <Link
                    href={`/dog/${dog.id}`}
                    className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-lg font-semibold leading-snug text-foreground">
                        {dog.registeredName}
                      </p>
                      <p className="mt-1 text-base text-muted-foreground">
                        {[dog.breed, sexLabel(dog.sex)].filter(Boolean).join(' · ')}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {showsLabel(dog.shows)}
                        {dog.critiques > 0 && (
                          <>
                            {' · '}
                            <span className="font-medium text-primary">{critiquesLabel(dog.critiques)}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <p className="mt-10 border-t pt-6 text-sm leading-relaxed text-muted-foreground">
        Only shows a dog has already been judged at are shown here &mdash; never where it is entered next.
      </p>
    </div>
  );
}
