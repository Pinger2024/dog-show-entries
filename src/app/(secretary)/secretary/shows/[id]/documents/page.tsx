'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  Award,
  BarChart3,
  BookMarked,
  BookOpen,
  Calendar,
  CheckSquare,
  ClipboardList,
  Download,
  FileSpreadsheet,
  Gavel,
  Hash,
  List,
  ListOrdered,
  Loader2,
  Map,
  PoundSterling,
  Printer,
  Sparkles,
  Trophy,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
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
import { downloadCsv } from '../_lib/show-utils';
import { useShowId } from '../_lib/show-context';
import { PdfViewerButton } from '../_components/pdf-viewer-button';

const placementPreviews = [
  { label: '1st', colour: 'bg-red-100 text-red-800 border-red-300' },
  { label: '2nd', colour: 'bg-blue-100 text-blue-800 border-blue-300' },
  { label: '3rd', colour: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { label: 'Reserve', colour: 'bg-green-100 text-green-800 border-green-300' },
  { label: 'VHC', colour: 'bg-purple-100 text-purple-800 border-purple-300' },
];

/**
 * Fetch a same-origin file and kick off a download via a temporary anchor +
 * object URL. Works inside an iOS-PWA standalone session where a plain
 * <a download> link is silently ignored.
 */
async function downloadBlob(url: string, filename: string) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
}

function DocSection({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}

function DocRow({
  icon,
  label,
  description,
  note,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 text-muted-foreground">{icon}</div>
        <div className="min-w-0">
          <p className="font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
          {note && (
            <p className="mt-1 text-xs font-medium text-se-honey-deep">{note}</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:shrink-0">{children}</div>
    </div>
  );
}

/** CSV download button that works for both client-computed CSVs (onClick)
 * and server-generated CSV routes (href), routed through downloadBlob so
 * iOS PWA users get a real save instead of a silently-ignored tap. */
function CsvButton({
  label,
  onGenerate,
  disabled,
}: {
  label: string;
  onGenerate: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      className="min-h-[2.75rem]"
      disabled={disabled || busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onGenerate();
        } catch (err) {
          toast.error(`Download failed — ${(err as Error).message}`);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
      {label}
    </Button>
  );
}

export default function DocumentsPage() {
  const showId = useShowId();
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  async function handleDownload(key: string, href: string, filename: string) {
    if (downloadingKey) return;
    setDownloadingKey(key);
    try {
      await downloadBlob(href, filename);
    } catch (err) {
      toast.error(`Download failed — ${(err as Error).message}`);
    } finally {
      setDownloadingKey(null);
    }
  }

  const { data: show } = trpc.shows.getById.useQuery({ id: showId });
  const { data: catalogueData } = trpc.secretary.getCatalogueData.useQuery({ showId });
  const { data: stats } = trpc.secretary.getShowStats.useQuery({ showId });
  const { data: showJudges } = trpc.secretary.getShowJudges.useQuery({ showId });
  const { data: entryReport } = trpc.secretary.getEntryReport.useQuery({ showId });
  const { data: catalogueOrders } = trpc.secretary.getCatalogueOrders.useQuery({ showId });
  const { data: extrasSummary } = trpc.secretary.getExtrasSummary.useQuery({ showId });
  const { data: paymentReport } = trpc.secretary.getPaymentReport.useQuery({ showId });
  const { data: withdrawnAndAbsent } = trpc.secretary.getAbsenteeList.useQuery({ showId });

  // Admin-only UI gate — only Amanda + Michael see internal Print Shop
  // fulfilment tools like the Mixam overprint generator. Not a phase gate.
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';

  const resultsFinalised = Boolean(catalogueData?.show?.resultsPublishedAt);
  const isKcChampionship = show?.showType === 'championship' && show?.showRuleset !== 'wusv';
  // SV / WUSV regional shows get the graded results report + spreadsheet the
  // regional group circulates after the show (Mandy 2026-06-27). RKC shows
  // use the Marked Catalogue for this instead — never show both.
  const isWusvShow = stats?.showRuleset === 'wusv';

  // Distinct judges (by id) so a multi-judge show can offer a separate Judge's
  // Book per judge — e.g. the breed judge's book and the Junior Handling
  // judge's book printed separately (Mandy 2026-06-19).
  const distinctJudges = (() => {
    const seen: Record<string, boolean> = {};
    const out: { id: string; name: string }[] = [];
    for (const ja of showJudges ?? []) {
      const jid = ja.judge?.id;
      const jname = ja.judge?.name;
      if (jid && jname && !seen[jid]) {
        seen[jid] = true;
        out.push({ id: jid, name: jname });
      }
    }
    return out;
  })();

  // Ring Numbers format — one card per A4 page (grid, home printing) or
  // one ring number per page (professional/booklet printing). This is an
  // output option, not two different documents, so it gets one row with a
  // format control rather than two separate buttons (Mandy: two buttons for
  // one route reads as two documents).
  const [ringNumberFormat, setRingNumberFormat] = useState<'grid' | 'single'>('grid');
  const ringNumbersHref = `/api/ring-numbers/${showId}${ringNumberFormat === 'single' ? '?format=single' : ''}`;

  // Prize card options
  const [prizeCardPlacements, setPrizeCardPlacements] = useState('5');
  const [includeJudge, setIncludeJudge] = useState(true);
  const [prizeCardStyle, setPrizeCardStyle] = useState<'filled' | 'outline'>('outline');
  const prizeCardQuery = `placements=${prizeCardPlacements}&judge=${includeJudge}&style=${prizeCardStyle}`;
  const prizeCardHref = `/api/prize-cards/${showId}?${prizeCardQuery}`;
  const prizeCardPrintHref = `/api/prize-cards/${showId}/print?${prizeCardQuery}`;

  function exportEntryReportCsv() {
    const headers = ['Entry Date', 'Status', 'Exhibitor', 'Email', 'Dog', 'Breed', 'Group', 'Sex', 'Classes', 'Fee (£)', 'NFC'];
    const rows = (entryReport ?? []).map((e) => [
      e.entryDate ? new Date(e.entryDate).toLocaleDateString('en-GB') : '',
      e.status,
      e.exhibitor?.name ?? '',
      e.exhibitor?.email ?? '',
      e.dog?.registeredName ?? 'Junior Handler',
      e.dog?.breed?.name ?? '',
      e.dog?.breed?.group?.name ?? '',
      e.dog?.sex ?? '',
      e.entryClasses.map((ec) => ec.showClass?.classDefinition?.name ?? '').filter(Boolean).join('; '),
      (e.totalFee / 100).toFixed(2),
      e.isNfc ? 'Yes' : 'No',
    ]);
    downloadCsv(headers, rows, `entry-report-${showId}`);
  }

  function exportPaymentReportCsv() {
    const headers = ['Exhibitor', 'Email', 'Item', 'Entry Fee (£)', 'Add-ons (£)', 'Total (£)', 'Status', 'Payments'];
    const rows = (paymentReport?.rows ?? []).map((r) => [
      r.exhibitor?.name ?? '',
      r.exhibitor?.email ?? '',
      r.itemDetail ? `${r.itemLabel} (${r.itemDetail})` : r.itemLabel,
      (r.entryFee / 100).toFixed(2),
      (r.addons / 100).toFixed(2),
      (r.total / 100).toFixed(2),
      r.status,
      r.payments.map((p) => `${p.status}: £${(p.amount / 100).toFixed(2)}`).join('; '),
    ]);
    downloadCsv(headers, rows, `payment-report-${showId}`);
  }

  function exportCatalogueOrdersCsv() {
    const printed = catalogueOrders?.printed ?? [];
    const online = catalogueOrders?.online ?? [];
    const headers = ['Type', 'Name', 'Email', 'Quantity'];
    const rows = [
      ...printed.map((p) => ['Printed', p.name, p.email, String(p.quantity)]),
      ...online.map((o) => ['Online', o.name, o.email, String(o.quantity)]),
    ];
    downloadCsv(headers, rows, `catalogue-orders-${showId}`);
  }

  function exportExtrasSummaryCsv() {
    if (!extrasSummary) return;
    const headers = ['Section', 'Name', 'Email', 'Phone', 'Detail / Quantity', 'Total (£)'];
    const rows: string[][] = [];
    for (const section of extrasSummary.sundrySections) {
      for (const buyer of section.buyers) {
        rows.push([
          section.label,
          buyer.name ?? '',
          buyer.email ?? '',
          buyer.phone ?? '',
          `Qty ${buyer.quantity}`,
          ((buyer.quantity * buyer.unitPrice) / 100).toFixed(2),
        ]);
      }
    }
    for (const sp of extrasSummary.classSponsors) {
      rows.push(['Class Sponsor', sp.sponsorName, '', '', sp.detail, sp.amountPence ? (sp.amountPence / 100).toFixed(2) : '']);
    }
    for (const sp of extrasSummary.showSponsors) {
      rows.push(['Show Sponsor', sp.sponsorName, sp.email ?? '', sp.phone ?? '', sp.detail, sp.amountPence ? (sp.amountPence / 100).toFixed(2) : '']);
    }
    downloadCsv(headers, rows, `extras-summary-${showId}`);
  }

  function exportWithdrawnAndAbsentCsv() {
    const headers = ['Catalogue No', 'Dog Name', 'Breed', 'Sex', 'Classes', 'Owner', 'Exhibitor', 'Status'];
    const rows = (withdrawnAndAbsent ?? []).map((e) => [
      e.catalogueNumber ?? '',
      e.dog?.registeredName ?? 'Junior Handler',
      e.dog?.breed?.name ?? '',
      e.dog?.sex === 'dog' ? 'Dog' : e.dog?.sex === 'bitch' ? 'Bitch' : '',
      (e.entryClasses ?? [])
        .map((ec) => {
          const num = ec.showClass?.classNumber;
          const name = ec.showClass?.classDefinition?.name ?? '';
          return num != null ? `${num}. ${name}` : name;
        })
        .filter(Boolean)
        .join('; '),
      e.dog?.owners?.map((o) => o.ownerName).join(' & ') ?? '',
      e.exhibitor?.name ?? '',
      e.status === 'withdrawn' ? 'Withdrawn' : 'Absent',
    ]);
    downloadCsv(headers, rows, `withdrawn-and-absent-${showId}`);
  }

  function exportFinancialStatementCsv() {
    const catalogueBuyerEmails = new Set<string>([
      ...(catalogueOrders?.printed ?? []).map((o) => o.email.toLowerCase()),
      ...(catalogueOrders?.online ?? []).map((o) => o.email.toLowerCase()),
    ]);
    const headers = ['Dog', 'Exhibitor', 'Status', 'Classes', 'Fee', 'Catalogue Ordered'];
    const rows = (entryReport ?? []).map((e) => [
      e.dog?.registeredName ?? 'Unknown',
      e.exhibitor?.name ?? 'Unknown',
      e.status,
      e.entryClasses.map((ec) => ec.showClass?.classDefinition?.name ?? '').join('; '),
      (e.totalFee / 100).toFixed(2),
      e.exhibitor?.email && catalogueBuyerEmails.has(e.exhibitor.email.toLowerCase()) ? 'Yes' : 'No',
    ]);
    downloadCsv(headers, rows, `financial-statement-${showId}`);
  }

  return (
    <div className="space-y-6">
      {/* ─────────────────────── Before the Show ─────────────────────── */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Before the Show
        </h2>
        <div className="space-y-4">
          <DocSection title="Catalogues" description="Printable catalogues in different formats — all A5 size" icon={BookOpen}>
            <DocRow
              icon={<List className="size-4" />}
              label="Catalogue — By Class"
              description="Entries grouped by class number"
            >
              <PdfViewerButton icon={<List className="size-4" />} label="View" url={`/api/catalogue/${showId}/by-class`} />
            </DocRow>
            <DocRow
              icon={<BookOpen className="size-4" />}
              label="Catalogue — Standard"
              description="RKC-format catalogue grouped by breed and sex"
            >
              <PdfViewerButton icon={<BookOpen className="size-4" />} label="View" url={`/api/catalogue/${showId}/standard`} />
            </DocRow>
            <DocRow
              icon={<Gavel className="size-4" />}
              label="Catalogue — Steward"
              description="Condensed two-column format with write-in placements — minimises print cost"
            >
              <PdfViewerButton icon={<Gavel className="size-4" />} label="View" url={`/api/catalogue/${showId}/judging`} />
            </DocRow>
          </DocSection>

          <DocSection title="Judge's Book" description="One page per class with exhibit numbers, placement columns, and signature area" icon={ClipboardList}>
            {distinctJudges.length > 1 ? (
              distinctJudges.map((j) => (
                <DocRow
                  key={j.id}
                  icon={<ClipboardList className="size-4" />}
                  label={`Judge's Book — ${j.name}`}
                  description={`${j.name}'s classes only`}
                >
                  <PdfViewerButton icon={<ClipboardList className="size-4" />} label="View" url={`/api/judges-book/${showId}?judge=${j.id}`} />
                </DocRow>
              ))
            ) : (
              <DocRow
                icon={<ClipboardList className="size-4" />}
                label="Judge's Book"
                description="All classes, one page each"
              >
                <PdfViewerButton icon={<ClipboardList className="size-4" />} label="View" url={`/api/judges-book/${showId}`} />
              </DocRow>
            )}
          </DocSection>

          <DocSection title="Schedule" description="Complete schedule with cover page, judges, classes, entry fees, and postal entry form" icon={Calendar}>
            <DocRow icon={<Calendar className="size-4" />} label="Show Schedule" description="Full printable schedule">
              <PdfViewerButton icon={<Calendar className="size-4" />} label="View" url={`/api/schedule/${showId}`} />
            </DocRow>
          </DocSection>

          <DocSection title="Entry Lists" description="Working lists you check while entries are coming in" icon={FileSpreadsheet}>
            <DocRow icon={<ListOrdered className="size-4" />} label="Exhibitor List" description="Alphabetical list of exhibitors and their dogs">
              <PdfViewerButton icon={<ListOrdered className="size-4" />} label="View" url={`/api/reports/${showId}/catalogue-order`} />
            </DocRow>
            <DocRow icon={<BookMarked className="size-4" />} label="Pre-booked Catalogues" description="Who ordered a printed or online catalogue">
              <PdfViewerButton icon={<BookMarked className="size-4" />} label="View" url={`/api/reports/${showId}/catalogue-orders`} />
            </DocRow>
            <DocRow icon={<BarChart3 className="size-4" />} label="Class Breakdown" description="Entry counts and revenue per class">
              <PdfViewerButton icon={<BarChart3 className="size-4" />} label="View" url={`/api/reports/${showId}/class-breakdown`} />
            </DocRow>
            <DocRow icon={<FileSpreadsheet className="size-4" />} label="Entry Report (CSV)" description="Every entry — exhibitor, dog, classes and fee, one row each">
              <CsvButton label="Download CSV" onGenerate={exportEntryReportCsv} />
            </DocRow>
          </DocSection>

          <DocSection title="Ring & Show Day Materials" description="Print these ahead of time to have ready on the day" icon={Hash}>
            <DocRow icon={<Hash className="size-4" />} label="Ring Numbers" description="6 cards per A4 page for home printing, or one per page for professional printing">
              <Select value={ringNumberFormat} onValueChange={(v) => setRingNumberFormat(v as 'grid' | 'single')}>
                <SelectTrigger className="w-full min-h-[2.75rem] sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="grid">Grid (6 per page)</SelectItem>
                  <SelectItem value="single">Single (1 per page)</SelectItem>
                </SelectContent>
              </Select>
              <PdfViewerButton icon={<Hash className="size-4" />} label="View" url={ringNumbersHref} />
            </DocRow>
            <DocRow icon={<Map className="size-4" />} label="Ring Board" description="Ring assignments showing judges, breeds, and classes with entry counts">
              <PdfViewerButton icon={<Map className="size-4" />} label="View" url={`/api/ring-board/${showId}`} />
            </DocRow>
            <DocRow icon={<Award className="size-4" />} label="Award Board" description="A4 landscape wipe-clean grid — laminate and re-use to record placements and best-of awards on the day">
              <PdfViewerButton icon={<Award className="size-4" />} label="View" url={`/api/award-board/${showId}`} />
            </DocRow>
            <DocRow icon={<Award className="size-4" />} label="Prize Cards" description="A5 prize cards for 1st through to HC — customise below, then download">
              {downloadingKey === 'prize-print' ? (
                <Button disabled className="min-h-[2.75rem]"><Loader2 className="size-4 animate-spin" />Downloading…</Button>
              ) : (
                <Button className="min-h-[2.75rem]" onClick={() => handleDownload('prize-print', prizeCardPrintHref, 'Prize-Cards-Print.pdf')}>
                  <Printer className="size-4" />Print
                </Button>
              )}
              <PdfViewerButton icon={<Award className="size-4" />} label="Preview" url={prizeCardHref} variant="outline" />
            </DocRow>
            {isAdmin && (
              <DocRow
                icon={<Sparkles className="size-4" />}
                label="Mixam Overprint PDF"
                description="5-page overprint for Mixam-preprinted blanks — admin/Print Shop use only"
              >
                <Button
                  variant="outline"
                  className="min-h-[2.75rem]"
                  disabled={downloadingKey === 'overprint'}
                  onClick={() => handleDownload('overprint', `/api/prize-card-overprint/${showId}`, 'Prize-Cards-Mixam-Overprint.pdf')}
                >
                  {downloadingKey === 'overprint' ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                  Download
                </Button>
              </DocRow>
            )}

            <div className="flex flex-wrap items-end gap-4 border-t pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="placements">Placements per class</Label>
                <Select value={prizeCardPlacements} onValueChange={setPrizeCardPlacements}>
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
                <Select value={prizeCardStyle} onValueChange={(v) => setPrizeCardStyle(v as 'filled' | 'outline')}>
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
                <Switch id="judge" checked={includeJudge} onCheckedChange={setIncludeJudge} />
                <Label htmlFor="judge">Include judge name</Label>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {placementPreviews.map((p) => (
                <div key={p.label} className={`rounded-md border px-3 py-1.5 text-xs font-medium ${p.colour}`}>
                  {p.label}
                </div>
              ))}
              <p className="self-center text-xs text-muted-foreground">
                {(stats?.totalClasses ?? 0) > 0
                  ? `${stats?.totalClasses ?? 0} classes × ${prizeCardPlacements} placements`
                  : 'Colour scheme preview'}
              </p>
            </div>
          </DocSection>
        </div>
      </div>

      {/* ─────────────────────── After the Show ─────────────────────── */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          After the Show
        </h2>
        <DocSection title="Results & Returns" description="Documents for RKC submission and show records after judging is complete" icon={Trophy}>
          <DocRow
            icon={<CheckSquare className="size-4" />}
            label="Marked Catalogue"
            description="Full catalogue with results, placements, absentees, and awards annotated — required by the RKC within 14 days for championship shows"
            note={!resultsFinalised ? 'Will be empty until results are published' : undefined}
          >
            <PdfViewerButton icon={<CheckSquare className="size-4" />} label="View" url={`/api/catalogue/${showId}/marked`} />
          </DocRow>
          <DocRow
            icon={<UserX className="size-4" />}
            label="Absentees (Catalogue PDF)"
            description="Dogs marked absent on paid entries — matches your printed catalogue, excludes Junior Handling"
          >
            <PdfViewerButton icon={<UserX className="size-4" />} label="View" url={`/api/catalogue/${showId}/absentees`} />
          </DocRow>
          <DocRow
            icon={<FileSpreadsheet className="size-4" />}
            label="Absentees (CSV)"
            description="Every dog marked absent, including entries from unpaid orders — excludes Junior Handling"
          >
            <CsvButton
              label="Download CSV"
              onGenerate={() => downloadBlob(`/api/absentee-report/${showId}`, `Absentee-Report-${showId}.csv`)}
            />
          </DocRow>
          <DocRow
            icon={<FileSpreadsheet className="size-4" />}
            label="Withdrawn & Absent (CSV)"
            description="Every withdrawn or absent entry on a paid order, including Junior Handling"
          >
            <CsvButton label="Download CSV" onGenerate={exportWithdrawnAndAbsentCsv} />
          </DocRow>
          {isKcChampionship && (
            <DocRow icon={<UserX className="size-4" />} label="RKC SH01 Return" description="Championship show absentee return for RKC submission">
              <PdfViewerButton icon={<UserX className="size-4" />} label="View" url={`/api/reports/${showId}/sh01`} />
            </DocRow>
          )}
          {isWusvShow && (
            <>
              <DocRow
                icon={<Trophy className="size-4" />}
                label="SV Graded Results"
                description="Graded results by coat and class — V/SG/G grades, placings, absentees kept in, with Best Male/Female, Most Promising, and Junior Handling"
              >
                <PdfViewerButton icon={<Trophy className="size-4" />} label="View" url={`/api/reports/${showId}/sv-results`} />
              </DocRow>
              <DocRow
                icon={<FileSpreadsheet className="size-4" />}
                label="SV Results Spreadsheet"
                description="One row per dog with full pedigree, grading and placing — the SV records format for the regional group"
              >
                {downloadingKey === 'sv-results-xlsx' ? (
                  <Button disabled className="min-h-[2.75rem]">
                    <Loader2 className="size-4 animate-spin" />Downloading…
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="min-h-[2.75rem]"
                    onClick={() =>
                      handleDownload(
                        'sv-results-xlsx',
                        `/api/reports/${showId}/sv-results-xlsx`,
                        `SV-Results-${showId}.xlsx`,
                      )
                    }
                  >
                    <Download className="size-4" />Download
                  </Button>
                )}
              </DocRow>
            </>
          )}
        </DocSection>

        {/* Money and orders — pulled once the show has run and the takings are
            settled, which is why they sit here rather than with the entry
            lists (Mandy's rule: group by when you PRODUCE it). */}
        <DocSection title="Money & Orders" description="Records for the club's books, once entries are paid and the show has run" icon={PoundSterling}>
          <DocRow icon={<PoundSterling className="size-4" />} label="Financial Statement (CSV)" description="Every entry with its fee and catalogue-order status, for club records">
            <CsvButton label="Download CSV" onGenerate={exportFinancialStatementCsv} />
          </DocRow>
          <DocRow icon={<FileSpreadsheet className="size-4" />} label="Payment Report (CSV)" description="Entry fees, add-ons and payment status per order">
            <CsvButton label="Download CSV" onGenerate={exportPaymentReportCsv} />
          </DocRow>
          <DocRow icon={<FileSpreadsheet className="size-4" />} label="Catalogue Order List (CSV)" description="Printed and online catalogue orders with quantities">
            <CsvButton label="Download CSV" onGenerate={exportCatalogueOrdersCsv} />
          </DocRow>
          <DocRow icon={<FileSpreadsheet className="size-4" />} label="Extras Summary (CSV)" description="Sundry item buyers and sponsors">
            <CsvButton label="Download CSV" onGenerate={exportExtrasSummaryCsv} />
          </DocRow>
        </DocSection>
      </div>
    </div>
  );
}
