import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { signInHref } from '@/lib/sign-in';

/**
 * Signed out on the catalogue page. Someone who bought a catalogue without ever
 * making a password (extras without a dog) arrives here from the show-morning
 * email - give them the way in, back to this page afterwards.
 */
export function CatalogueSignIn({ idOrSlug }: { idOrSlug: string }) {
  return (
    <>
      <p className="text-muted-foreground">Please sign in to view your catalogue.</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Sign in with the email address you used to buy your catalogue.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <Button asChild className="min-h-[2.75rem]">
          <Link href={signInHref(`/shows/${idOrSlug}/catalogue`)}>Sign in</Link>
        </Button>
        <Button asChild variant="outline" className="min-h-[2.75rem]">
          <Link href="/browse">Browse Shows</Link>
        </Button>
      </div>
    </>
  );
}
