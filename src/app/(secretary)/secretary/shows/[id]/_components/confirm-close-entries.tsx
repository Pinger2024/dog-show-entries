'use client';

import type { ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

/**
 * Confirmation gate for closing a show's entries.
 *
 * Mandy 2026-07-12: a secretary closed the North East regional's entries by
 * accident — the "Close Entries" button fired on a single tap with no warning.
 * This wraps whichever close button a surface uses (passed as `children` via
 * the trigger's `asChild`, so its styling and pending state are untouched) and
 * makes closing a two-step, deliberate action with an easy way to back out.
 */
export function ConfirmCloseEntries({
  onConfirm,
  children,
}: {
  onConfirm: () => void;
  children: ReactNode;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Close entries for this show?</AlertDialogTitle>
          <AlertDialogDescription>
            This stops exhibitors from entering — the show will no longer accept
            new entries. You can reopen entries afterwards if you need to, but
            it&apos;s best to only close when entries are genuinely finished.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep entries open</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Yes, close entries</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
