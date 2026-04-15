'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle,
  ClipboardList,
  Check,
  Download,
  ExternalLink,
  FileText,
  Gavel,
  Hash,
  List,
  Map,
  Printer,
  Share2,
  Sparkles,
  Trophy,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useShowId } from '../_lib/show-context';

const placementPreviews = [
  { label: '1st', colour: 'bg-red-100 text-red-800 border-red-300' },
  { label: '2nd', colour: 'bg-blue-100 text-blue-800 border-blue-300' },
  { label: '3rd', colour: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { label: 'Reserve', colour: 'bg-green-100 text-green-800 border-green-300' },
  { label: 'VHC', colour: 'bg-purple-100 text-purple-800 border-purple-300' },
];

interface DocumentLink {
  label: string;
  href: string;
  icon: React.ReactNode;
  description: string;
  badge?: string;
}

function DocumentLinkCard({ doc }: { doc: DocumentLink }) {
  const [copied, setCopied] = useState(false);

  const fullUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${doc.href}`
    : doc.href;

  async function handleShare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: doc.label, url: fullUrl });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
    }
    // Fallback: copy link
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    toast.success('PDF link copied');
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted">
      <div className="mt-0.5 shrink-0 text-muted-foreground">
        {doc.icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {doc.label}
          {doc.badge && (
            <Badge variant="secondary" className="ml-2 text-xs">
              {doc.badge}
            </Badge>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {doc.description}
        </p>
        <div className="mt-2 flex gap-2">
          <a
            href={doc.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <ExternalLink className="size-3" />
            Open
          </a>
          <button
            onClick={handleShare}
            className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {copied ? <Check className="size-3 text-emerald-600" /> : <Share2 className="size-3" />}
            {copied ? 'Copied!' : 'Share'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DocumentGrid({ documents }: { documents: DocumentLink[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {documents.map((doc) => (
        <DocumentLinkCard key={doc.label} doc={doc} />
      ))}
    </div>
  );
}

export default function DocumentsPage() {
  const showId = useShowId();

  const { data: catalogueData } =
    trpc.secretary.getCatalogueData.useQuery({ showId });
  const { data: stats } =
    trpc.secretary.getShowStats.useQuery({ showId });

  const entries = catalogueData?.entries ?? [];
  const hasNumbers = entries.some((e) => e.catalogueNumber);

  // Admin-only UI gate — only Amanda + Michael see internal Print Shop
  // fulfilment tools like the Mixam overprint generator.
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';

  // Prize card options
  const [prizeCardPlacements, setPrizeCardPlacements] = useState('5');
  const [includeJudge, setIncludeJudge] = useState(true);
  const [prizeCardStyle, setPrizeCardStyle] = useState<'filled' | 'outline'>('outline');

  const catalogueDocuments: DocumentLink[] = hasNumbers
    ? [
        {
          label: 'Standard Catalogue',
          href: `/api/catalogue/${showId}/standard`,
          icon: <FileText className="size-4" />,
          description: 'RKC-format catalogue grouped by breed and sex',
        },
        {
          label: 'Catalogue by Class',
          href: `/api/catalogue/${showId}/by-class`,
          icon: <List className="size-4" />,
          description: 'Entries grouped by class number',
        },
        {
          label: 'Judging Catalogue',
          href: `/api/catalogue/${showId}/judging`,
          icon: <Gavel className="size-4" />,
          description: 'Condensed two-column format with write-in placements — minimises print cost',
        },
        {
          label: 'Absentee List',
          href: `/api/catalogue/${showId}/absentees`,
          icon: <Download className="size-4" />,
          description: 'Withdrawn entries with catalogue numbers',
        },
      ]
    : [];

  const preShowDocuments: DocumentLink[] = [
    {
      label: 'Show Schedule',
      href: `/api/schedule/${showId}`,
      icon: <Calendar className="size-4" />,
      description:
        'Complete schedule with cover page, judges, classes, entry fees, and postal entry form',
    },
  ];

  const showDayDocuments: DocumentLink[] = [
    ...(hasNumbers
      ? [
          {
            label: "Judge's Book",
            href: `/api/judges-book/${showId}`,
            icon: <ClipboardList className="size-4" />,
            description:
              'One page per class with exhibit numbers, placement columns, and signature area',
          },
          {
            label: 'Ring Numbers (A4 Grid)',
            href: `/api/ring-numbers/${showId}`,
            icon: <Hash className="size-4" />,
            description:
              '6 ring number cards per A4 page — print on card stock, cut along the guidelines',
          },
          {
            label: 'Ring Numbers (Single)',
            href: `/api/ring-numbers/${showId}?format=single`,
            icon: <Hash className="size-4" />,
            description:
              'One ring number per page — for professional printing or booklet binding',
          },
        ]
      : []),
    {
      label: 'Ring Plan',
      href: `/api/ring-board/${showId}`,
      icon: <Map className="size-4" />,
      description:
        'Ring assignments showing judges, breeds, and classes with entry counts',
    },
    {
      label: 'Award Board',
      href: `/api/award-board/${showId}`,
      icon: <Award className="size-4" />,
      description:
        'A4 landscape wipe-clean grid — laminate and re-use with a dry-wipe marker to record placements and best-of awards on the day',
    },
  ];

  const prizeCardQuery = `placements=${prizeCardPlacements}&judge=${includeJudge}&style=${prizeCardStyle}`;
  const prizeCardHref = `/api/prize-cards/${showId}?${prizeCardQuery}`;
  const prizeCardPrintHref = `/api/prize-cards/${showId}/print?${prizeCardQuery}`;

  const postShowDocuments: DocumentLink[] = hasNumbers
    ? [
        {
          label: 'Marked Catalogue',
          href: `/api/catalogue/${showId}/marked`,
          icon: <CheckCircle className="size-4" />,
          description:
            'Full catalogue with results, placements, absentees, and awards annotated — required by the RKC within 14 days for championship shows',
          badge: 'RKC',
        },
        {
          label: 'Absentee Report',
          href: `/api/absentee-report/${showId}`,
          icon: <UserX className="size-4" />,
          description:
            'All entries marked absent — dog name, catalogue number, breed, class, and owner',
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      {!hasNumbers && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Hash className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  Catalogue numbers not yet assigned
                </p>
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                  Some documents require catalogue numbers. Go to the{' '}
                  <a
                    href={`/secretary/shows/${showId}/catalogue`}
                    className="font-medium underline"
                  >
                    Catalogue
                  </a>{' '}
                  tab to assign them first.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pre-Show Documents */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="size-5" />
            Pre-Show Documents
          </CardTitle>
          <CardDescription>
            Documents needed before show day — schedule, entry forms
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentGrid documents={preShowDocuments} />
        </CardContent>
      </Card>

      {/* Catalogues */}
      {catalogueDocuments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="size-5" />
              Catalogues
            </CardTitle>
            <CardDescription>
              Printable catalogues in different formats — all A5 size
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DocumentGrid documents={catalogueDocuments} />
          </CardContent>
        </Card>
      )}

      {/* Show Day Documents */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="size-5" />
            Show Day Documents
          </CardTitle>
          <CardDescription>
            Essential documents for running the show on the day
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentGrid documents={showDayDocuments} />
        </CardContent>
      </Card>

      {/* Post-Show Documents */}
      {postShowDocuments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="size-5" />
              Post-Show Documents
            </CardTitle>
            <CardDescription>
              Documents for RKC submission and show records after judging is complete
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DocumentGrid documents={postShowDocuments} />
          </CardContent>
        </Card>
      )}

      {/* Prize Cards — admin-only: Amanda + Michael fulfil orders via
          the Print Shop, regular secretaries don't need home-print PDFs. */}
      {isAdmin && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="size-5" />
            Prize Cards
            <span className="rounded-full bg-purple-600 px-2 py-0.5 text-[10px] font-semibold text-white">ADMIN</span>
          </CardTitle>
          <CardDescription>
            A5 prize cards for 1st through to HC — customise and download
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="placements">Placements per class</Label>
              <Select
                value={prizeCardPlacements}
                onValueChange={setPrizeCardPlacements}
              >
                <SelectTrigger id="placements" className="w-full sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="1">1st only</SelectItem>
                  <SelectItem value="2">1st – 2nd</SelectItem>
                  <SelectItem value="3">1st – 3rd</SelectItem>
                  <SelectItem value="4">1st – Reserve</SelectItem>
                  <SelectItem value="5">1st – VHC</SelectItem>
                  <SelectItem value="6">1st – HC</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="card-style">Card Style</Label>
              <Select
                value={prizeCardStyle}
                onValueChange={(v) => setPrizeCardStyle(v as 'filled' | 'outline')}
              >
                <SelectTrigger id="card-style" className="w-full sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="filled">Filled (coloured bg)</SelectItem>
                  <SelectItem value="outline">Outline (white bg)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="judge"
                checked={includeJudge}
                onCheckedChange={setIncludeJudge}
              />
              <Label htmlFor="judge">Include judge name</Label>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border bg-muted/50 p-4 sm:flex-row sm:items-center">
            <Award className="size-8 shrink-0 text-amber-500 hidden sm:block" />
            <div className="flex-1">
              <p className="font-medium">
                {(stats?.totalClasses ?? 0) > 0
                  ? `${stats?.totalClasses ?? 0} classes × ${prizeCardPlacements} placements`
                  : 'No classes yet'}
              </p>
              <p className="text-sm text-muted-foreground">
                Each card is A5 landscape with your club branding, colour-coded
                by placement
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button asChild className="w-full sm:w-auto min-h-[2.75rem]">
                <a href={prizeCardPrintHref} target="_blank" rel="noopener noreferrer">
                  <Printer className="size-4" />
                  Print
                </a>
              </Button>
              <Button asChild variant="outline" className="w-full sm:w-auto min-h-[2.75rem]">
                <a href={prizeCardHref} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                  Preview PDF
                </a>
              </Button>
            </div>
          </div>

          {/* Admin-only: Mixam overprint PDF generator.
              Produces a 5-page PDF with only the show-specific text +
              logo, positioned to land on the cream middle zone of the
              Mixam pre-printed blank prize cards. Used by fulfilment
              to run Print Shop orders: load red blanks → print page 1
              × N, swap to blue blanks → print page 2 × N, etc. */}
          {isAdmin && (
            <div className="flex flex-col gap-3 rounded-lg border border-dashed border-purple-300 bg-purple-50/50 p-4 sm:flex-row sm:items-center dark:border-purple-900 dark:bg-purple-950/30">
              <Sparkles className="size-8 shrink-0 text-purple-600 hidden sm:block" />
              <div className="flex-1">
                <p className="font-medium flex items-center gap-2">
                  Mixam Overprint PDF
                  <span className="rounded-full bg-purple-600 px-2 py-0.5 text-[10px] font-semibold text-white">ADMIN</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  5-page overprint for use with Mixam-preprinted blanks — feed
                  red blanks, print page 1 × N copies, swap to blue, print page 2, etc.
                </p>
              </div>
              <Button asChild variant="outline" className="w-full sm:w-auto min-h-[2.75rem]">
                <a
                  href={`/api/prize-card-overprint/${showId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download className="size-4" />
                  Download Overprint
                </a>
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {placementPreviews.map((p) => (
              <div
                key={p.label}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium ${p.colour}`}
              >
                {p.label}
              </div>
            ))}
            <p className="self-center text-xs text-muted-foreground">
              Colour scheme preview
            </p>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
