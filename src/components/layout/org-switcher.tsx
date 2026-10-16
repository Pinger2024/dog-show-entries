'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useActiveOrganisation } from '@/lib/use-active-organisation';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Sidebar-top picker: "Managing: Clyde Valley ▼" that lets a secretary
 * who's a member of multiple clubs switch which one the rest of the
 * secretary pages load. Hidden when the user only has one club — no
 * point showing a picker with one option.
 */
export function OrgSwitcher() {
  const { activeOrg, organisations, setActiveOrgId, isLoading } =
    useActiveOrganisation();
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  if (isLoading || organisations.length <= 1 || !activeOrg) return null;

  const handleSelect = (id: string) => {
    setActiveOrgId(id);
    setOpen(false);
    // Invalidate every secretary-scoped query so pages refetch for the
    // new org. A targeted list would be faster but easy to forget to
    // update when we add new procedures.
    utils.secretary.invalidate();
    utils.shows.invalidate();
    utils.subscription.invalidate();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-auto w-full justify-between px-3 py-2 text-left"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Building2 className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Managing
              </p>
              <p className="truncate text-[13px] font-semibold">{activeOrg.name}</p>
            </div>
          </div>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-1" align="start">
        {organisations.map((org) => {
          const isActive = org.id === activeOrg.id;
          return (
            <button
              key={org.id}
              onClick={() => handleSelect(org.id)}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent',
                isActive && 'bg-accent/60'
              )}
            >
              <span className="truncate">{org.name}</span>
              {isActive && <Check className="size-4 shrink-0 text-primary" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
