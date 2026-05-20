'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';

const STORAGE_KEY = 'remi.activeOrgId';

/**
 * Which club is the secretary currently "looking at".
 *
 * Single source of truth for every multi-org screen — /secretary, /club,
 * /billing, /shows listing. Pages used to silently grab organisations[0],
 * which meant Amanda (member of several clubs) would see arbitrary data
 * with no way to switch. Now: the OrgSwitcher in the sidebar writes into
 * localStorage, this hook reads from it, and queries re-key on change.
 *
 * Stored per-browser, not per-user, because "which club am I managing
 * right now" is a session/device preference — she might be on Clyde
 * Valley at her desk and BAGSD on her phone.
 */
export function useActiveOrganisation() {
  const { data: dashboard, isLoading } = trpc.secretary.getDashboard.useQuery();
  const organisations = useMemo(
    () => dashboard?.organisations ?? [],
    [dashboard]
  );

  const [storedId, setStoredId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setStoredId(window.localStorage.getItem(STORAGE_KEY));
  }, []);

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
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    setStoredId(id);
  }, []);

  return {
    activeOrg,
    activeOrgId: activeOrg?.id ?? null,
    organisations,
    setActiveOrgId,
    isLoading,
  };
}
