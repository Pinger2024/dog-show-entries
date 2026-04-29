'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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

export function CloseAccountForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const closeAccount = trpc.users.closeAccount.useMutation();
  const canConfirm = confirmText === 'CLOSE' && !closeAccount.isPending;

  async function handleClose() {
    if (confirmText !== 'CLOSE') return;
    setError(null);

    try {
      await closeAccount.mutateAsync({ confirmation: 'CLOSE' });
      // Sign out clears the JWT cookie locally and redirects.
      await signOut({ redirect: false });
      router.push('/?account_closed=1');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Something went wrong. Please contact us at hello@remishowmanager.co.uk.'
      );
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-5 text-destructive" />
          <CardTitle className="font-serif text-lg text-destructive">
            Close your account
          </CardTitle>
        </div>
        <CardDescription>
          This will remove your personal details from Remi. Financial records
          (orders, payments and refunds) are kept for 6 years to comply with
          HMRC rules &mdash; see our{' '}
          <a
            href="/privacy"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Privacy Policy
          </a>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Before you close</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-amber-800">
            <li>You won&apos;t be able to sign in with this account again.</li>
            <li>
              If you run shows on Remi, please hand them over to another
              secretary or email{' '}
              <a
                href="mailto:hello@remishowmanager.co.uk"
                className="underline underline-offset-2"
              >
                hello@remishowmanager.co.uk
              </a>{' '}
              first.
            </li>
            <li>You can sign up again with the same email later if you change your mind.</li>
          </ul>
        </div>

        <AlertDialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) {
              setConfirmText('');
              setError(null);
            }
          }}
        >
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              className="w-full sm:w-auto min-h-[2.75rem]"
            >
              Close my account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Are you absolutely sure?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Your name, address, phone, and login will be removed from
                Remi. This cannot be undone from your end &mdash; you would
                need to contact us to recover the account.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-2">
              <Label htmlFor="confirm-close">
                Type <span className="font-mono font-semibold">CLOSE</span> to
                confirm
              </Label>
              <Input
                id="confirm-close"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="CLOSE"
                autoComplete="off"
                autoCapitalize="characters"
                className="min-h-[2.75rem]"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={closeAccount.isPending}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={!canConfirm}
                onClick={(e) => {
                  e.preventDefault();
                  void handleClose();
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {closeAccount.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Closing&hellip;
                  </>
                ) : (
                  'Close my account'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
