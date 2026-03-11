'use client';

import { createContext, useContext } from 'react';

const ShowIdContext = createContext<string | null>(null);

export function ShowIdProvider({
  showId,
  children,
}: {
  showId: string;
  children: React.ReactNode;
}) {
  return (
    <ShowIdContext.Provider value={showId}>{children}</ShowIdContext.Provider>
  );
}

/**
 * Returns the resolved UUID for the current show.
 *
 * The secretary layout resolves the URL param (which may be a slug
 * like "burnbrae-spring-show-bonanza-2026") to the real UUID via
 * `shows.getById`, then provides it through context so that child
 * pages can safely pass it to secretary tRPC procedures that
 * validate with `z.string().uuid()`.
 */
export function useShowId(): string {
  const id = useContext(ShowIdContext);
  if (!id) {
    throw new Error('useShowId must be used within a ShowIdProvider');
  }
  return id;
}
