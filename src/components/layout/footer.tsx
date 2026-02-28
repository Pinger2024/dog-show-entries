import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto max-w-7xl px-3 py-10 sm:px-4 sm:py-14 lg:px-6">
        <div className="flex flex-col items-center gap-8 sm:flex-row sm:justify-between">
          <div className="flex flex-col items-center gap-1.5 sm:items-start">
            <span className="font-serif text-lg sm:text-xl font-bold tracking-tight text-primary">
              Remi
            </span>
            <p className="text-sm sm:text-[0.9375rem] text-muted-foreground">
              Made for the dog show community
            </p>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-8 gap-y-2">
            <Link
              href="/about"
              className="text-sm sm:text-[0.9375rem] text-muted-foreground transition-colors hover:text-foreground"
            >
              About
            </Link>
            <Link
              href="/help"
              className="text-sm sm:text-[0.9375rem] text-muted-foreground transition-colors hover:text-foreground"
            >
              Help
            </Link>
            <Link
              href="/pricing"
              className="text-sm sm:text-[0.9375rem] text-muted-foreground transition-colors hover:text-foreground"
            >
              Pricing
            </Link>
            <Link
              href="/privacy"
              className="text-sm sm:text-[0.9375rem] text-muted-foreground transition-colors hover:text-foreground"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-sm sm:text-[0.9375rem] text-muted-foreground transition-colors hover:text-foreground"
            >
              Terms
            </Link>
          </nav>
        </div>
        <div className="mt-8 sm:mt-10 border-t pt-5 sm:pt-6 text-center sm:text-left">
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
            <p className="text-xs sm:text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Remi. All rights reserved.
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Questions?{' '}
              <a
                href="mailto:hello@remishow.co.uk"
                className="text-primary hover:underline"
              >
                hello@remishow.co.uk
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
