'use client';

import { use, useState } from 'react';
import {
  Award,
  BookOpen,
  Calendar,
  ClipboardList,
  Download,
  FileText,
  Hash,
  List,
  Loader2,
  Map,
  SortAsc,
} from 'lucide-react';
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

interface DocumentLink {
  label: string;
  href: string;
  icon: React.ReactNode;
  description: string;
  badge?: string;
}

export default function DocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: showId } = use(params);

  const { data: catalogueData } =
    trpc.secretary.getCatalogueData.useQuery({ showId });
  const { data: stats } =
    trpc.secretary.getShowStats.useQuery({ showId });

  const entries = catalogueData?.entries ?? [];
  const hasNumbers = entries.some((e) => e.catalogueNumber);

  // Prize card options
  const [prizeCardPlacements, setPrizeCardPlacements] = useState('5');
  const [includeJudge, setIncludeJudge] = useState(true);
  const [prizeCardStyle, setPrizeCardStyle] = useState<'filled' | 'outline'>('filled');

  const catalogueDocuments: DocumentLink[] = hasNumbers
    ? [
        {
          label: 'Standard Catalogue',
          href: `/api/catalogue/${showId}/standard`,
          icon: <FileText className="size-4" />,
          description: 'KC-format catalogue grouped by breed and sex',
        },
        {
          label: 'Catalogue by Class',
          href: `/api/catalogue/${showId}/by-class`,
          icon: <List className="size-4" />,
          description: 'Entries grouped by class number',
        },
        {
          label: 'Alphabetical Catalogue',
          href: `/api/catalogue/${showId}/alphabetical`,
          icon: <SortAsc className="size-4" />,
          description: 'All entries sorted A–Z by registered name',
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
        ]
      : []),
    {
      label: 'Ring Plan',
      href: `/api/ring-board/${showId}`,
      icon: <Map className="size-4" />,
      description:
        'Ring assignments showing judges, breeds, and classes with entry counts',
    },
  ];

  const prizeCardHref = `/api/prize-cards/${showId}?placements=${prizeCardPlacements}&judge=${includeJudge}&style=${prizeCardStyle}`;

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
          <div className="grid gap-3 sm:grid-cols-2">
            {preShowDocuments.map((doc) => (
              <a
                key={doc.label}
                href={doc.href}
                download
                className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted"
              >
                <div className="mt-0.5 shrink-0 text-muted-foreground">
                  {doc.icon}
                </div>
                <div className="min-w-0">
                  <p className="font-medium">{doc.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.description}
                  </p>
                </div>
              </a>
            ))}
          </div>
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
            <div className="grid gap-3 sm:grid-cols-2">
              {catalogueDocuments.map((doc) => (
                <a
                  key={doc.label}
                  href={doc.href}
                  download
                  className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted"
                >
                  <div className="mt-0.5 shrink-0 text-muted-foreground">
                    {doc.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">{doc.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.description}
                    </p>
                  </div>
                </a>
              ))}
            </div>
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
          <div className="grid gap-3 sm:grid-cols-2">
            {showDayDocuments.map((doc) => (
              <a
                key={doc.label}
                href={doc.href}
                download
                className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted"
              >
                <div className="mt-0.5 shrink-0 text-muted-foreground">
                  {doc.icon}
                </div>
                <div className="min-w-0">
                  <p className="font-medium">
                    {doc.label}
                    {doc.badge && (
                      <Badge variant="secondary" className="ml-2 text-[10px]">
                        {doc.badge}
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {doc.description}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Prize Cards */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="size-5" />
            Prize Cards
          </CardTitle>
          <CardDescription>
            A5 prize cards for 1st through to VHC — customise and download
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
                <SelectTrigger id="placements" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="1">1st only</SelectItem>
                  <SelectItem value="2">1st – 2nd</SelectItem>
                  <SelectItem value="3">1st – 3rd</SelectItem>
                  <SelectItem value="4">1st – Reserve</SelectItem>
                  <SelectItem value="5">1st – VHC</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="card-style">Card Style</Label>
              <Select
                value={prizeCardStyle}
                onValueChange={(v) => setPrizeCardStyle(v as 'filled' | 'outline')}
              >
                <SelectTrigger id="card-style" className="w-40">
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

          <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-4">
            <Award className="size-8 shrink-0 text-amber-500" />
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
            <Button asChild>
              <a href={prizeCardHref} download>
                <Download className="size-4" />
                Download
              </a>
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map((p) => {
              const labels: Record<number, string> = {
                1: '1st',
                2: '2nd',
                3: '3rd',
                4: 'Reserve',
                5: 'VHC',
              };
              const colours: Record<number, string> = {
                1: 'bg-red-100 text-red-800 border-red-300',
                2: 'bg-blue-100 text-blue-800 border-blue-300',
                3: 'bg-yellow-100 text-yellow-800 border-yellow-300',
                4: 'bg-green-100 text-green-800 border-green-300',
                5: 'bg-orange-100 text-orange-800 border-orange-300',
              };
              return (
                <div
                  key={p}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium ${colours[p]}`}
                >
                  {labels[p]}
                </div>
              );
            })}
            <p className="self-center text-xs text-muted-foreground">
              Colour scheme preview
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
