'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { trpc } from '@/lib/trpc';

const STORAGE_KEY = 'remi.activeOrgId';

/**
 * Which club is the secretary currently "looking at".
 *
 * Single source of truth for every multi-org screen — /secretary, /club,
 * /billing, /shows listing. Pages used to silently grab organisations[0],
 * which meant Amanda (member of several clubs) would see arbitrary data
 * with no way to switch. The OrgSwitcher writes the active id; this hook
 * reads it; queries re-key on change.
 *
 * Stored per-browser, not per-user, because "which club am I managing
 * right now" is a session/device preference — she might be on Clyde
 * Valley at her desk and BAGSD on her phone.
 *
 * Backed by a module-level store via useSyncExternalStore so switching club
 * in the sidebar updates EVERY consumer (club page logo/name, header,
 * billing) in the same tick. The old version gave each hook instance its own
 * useState seeded once on mount, so after a switch the page kept showing the
 * previous club's logo + name — and its org query stayed keyed to the old
 * id — until a full refresh. Amanda hit exactly this: she picked South
 * Western but Clyde Valley's branding lingered (2026-06-01).
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Also react to switches made in other tabs/windows.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) onChange();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }
  return () => {
    listeners.delete(onChange);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
  };
}

function getSnapshot(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

function getServerSnapshot(): string | null {
  return null;
}

/** Set the active club and notify every useActiveOrganisation() consumer. */
export function setActiveOrgIdGlobal(id: string) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, id);
  }
  listeners.forEach((l) => l());
}

export function useActiveOrganisation() {
  const { data: dashboard, isLoading } = trpc.secretary.getDashboard.useQuery();
  const organisations = useMemo(
    () => dashboard?.organisations ?? [],
    [dashboard]
  );

  const storedId = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  // Resolve the active org. If the stored id isn't in the user's current
  // membership list (e.g. they were removed from that club), fall through
  // to the first available.
  const activeOrg = useMemo(() => {
    if (organisations.length === 0) return null;
    if (storedId) {
      const match = organisations.find((o) => o.id === storedId);
      if (match) return match;
    }
    return organisations[0] ?? null;
  }, [organisations, storedId]);

  const setActiveOrgId = useCallback((id: string) => {
    setActiveOrgIdGlobal(id);
  }, []);

  return {
    activeOrg,
    activeOrgId: activeOrg?.id ?? null,
    organisations,
    setActiveOrgId,
    isLoading,
  };
}
