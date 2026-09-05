'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
  MessageSquare,
  PoundSterling,
  Printer,
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
import { downloadCsv } from '../_lib/show-utils';
import { useShowId } from '../_lib/show-context';
import { documentRowVisible } from '../_lib/document-eligibility';
import { PdfViewerButton } from '../_components/pdf-viewer-button';
import { CatalogueJobButton } from '@/components/catalogue/catalogue-job-button';
import { buildAbsenteeRow, buildFinancialStatementRow, membershipClaimLabel } from '@/lib/report-rows';

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
  extra,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  note?: string;
  /** Optional calm secondary detail line, below description/note — e.g. the
   *  prize-card "needed" counts. Kept separate from `note` (which is a
   *  warning-styled callout) so it never reads as an alert. */
  extra?: React.ReactNode;
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
          {extra && (
            <p className="mt-1 text-xs text-muted-foreground">{extra}</p>
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

/** Excel download button for a server-generated .xlsx report (Mandy's
 * original ask: "the option to generate on excel or pdf"). Same shape as
 * CsvButton — self-contained busy state, routed through downloadBlob so
 * iOS PWA users get a real save. Every xlsx route reuses the exact row
 * builder or DB query its PDF/CSV sibling uses, so the two can't disagree. */
function XlsxButton({ href, filename, label = 'Excel' }: { href: string; filename: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      className="min-h-[2.75rem]"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadBlob(href, filename);
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
  const { data: prizeCardCounts } = trpc.secretary.getPrizeCardCounts.useQuery({ showId });

  const resultsFinalised = Boolean(catalogueData?.show?.resultsPublishedAt);
  // SV / WUSV regional shows get the graded results report + spreadsheet the
  // regional group circulates after the show (Mandy 2026-06-27). RKC shows
  // use the Marked Catalogue for this instead — never show both.
  const isWusvShow = stats?.showRuleset === 'wusv';
  const docCtx = { showRuleset: stats?.showRuleset, showType: show?.showType };
  const isKcChampionship = documentRowVisible('sh01', docCtx);

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

  // Prize cards — official template design, one page per placement
  // (1st/2nd/3rd/Reserve) with the club/show/judge details overprinted.
  // No customisation options: the artwork and layout are fixed.
  const prizeCardHref = `/api/prize-cards/${showId}`;
  const prizeCardPrintHref = `/api/prize-cards/${showId}/print`;

  // Calm one-liner so Mandy can order just what she needs instead of a full
  // suite per class (her words, 2026-07-30). Nothing shown while the counts
  // are still loading — this is a secondary detail, not worth a spinner.
  const prizeCardCountsLine = !prizeCardCounts
    ? null
    : prizeCardCounts.total === 0
      ? 'No entries yet — card counts appear as entries come in'
      : `For current entries: ${prizeCardCounts.total} card${prizeCardCounts.total === 1 ? '' : 's'} — ` +
        `${prizeCardCounts.first}× 1st · ${prizeCardCounts.second}× 2nd · ` +
        `${prizeCardCounts.third}× 3rd · ${prizeCardCounts.reserve}× Reserve`;

  function exportEntryReportCsv() {
    const headers = ['Entry Date', 'Status', 'Exhibitor', 'Email', 'Dog', 'Breed', 'Group', 'Sex', 'Classes', 'Fee (£)', 'NFC', 'Membership'];
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
      membershipClaimLabel(e.order),
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

  // Shared with this report's .xlsx twin via lib/report-rows.ts — the same
  // pure row-builder feeds both outputs so they can never disagree.
  function exportWithdrawnAndAbsentCsv() {
    const headers = ['Catalogue No', 'Dog Name', 'Breed', 'Sex', 'Classes', 'Owner', 'Exhibitor', 'Status'];
    const rows = (withdrawnAndAbsent ?? []).map((e) => {
      const r = buildAbsenteeRow(e);
      return [r.catalogueNumber, r.dogName, r.breed, r.sex, r.classes, r.owner, r.exhibitor, r.status];
    });
    downloadCsv(headers, rows, `withdrawn-and-absent-${showId}`);
  }

  // Shared with the Financial Statement .xlsx via lib/report-rows.ts.
  function exportFinancialStatementCsv() {
    const catalogueBuyerEmails = new Set<string>([
      ...(catalogueOrders?.printed ?? []).map((o) => o.email.toLowerCase()),
      ...(catalogueOrders?.online ?? []).map((o) => o.email.toLowerCase()),
    ]);
    const headers = ['Dog', 'Exhibitor', 'Status', 'Classes', 'Fee', 'Catalogue Ordered'];
    const rows = (entryReport ?? []).map((e) => {
      const r = buildFinancialStatementRow(e, catalogueBuyerEmails);
      return [r.dog, r.exhibitor, r.status, r.classes, r.fee, r.catalogueOrdered];
    });
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
              <CatalogueJobButton icon={<List className="size-4" />} label="View" showId={showId} format="by-class" />
            </DocRow>
            {documentRowVisible('grading-cards', docCtx) && (
              <DocRow
                icon={<Award className="size-4" />}
                label="Grading Cards"
                description="One A5 double-sided card per dog — fold once for a 4-panel hand card the judge grades and hands back"
                note={!catalogueData?.entries?.length ? 'Ring numbers will be blank until entries are confirmed' : undefined}
              >
                <PdfViewerButton icon={<Award className="size-4" />} label="View" url={`/api/reports/${showId}/grading-cards`} />
              </DocRow>
            )}
            {documentRowVisible('catalogue-standard', docCtx) && (
              <DocRow
                icon={<BookOpen className="size-4" />}
                label="Catalogue — Standard"
                description="RKC-format catalogue grouped by breed and sex"
              >
                <CatalogueJobButton icon={<BookOpen className="size-4" />} label="View" showId={showId} format="standard" />
              </DocRow>
            )}
            {documentRowVisible('catalogue-steward', docCtx) && (
              <DocRow
                icon={<Gavel className="size-4" />}
                label="Catalogue — Steward"
                description="Condensed two-column format with write-in placements — minimises print cost"
              >
                <CatalogueJobButton icon={<Gavel className="size-4" />} label="View" showId={showId} format="judging" />
              </DocRow>
            )}
          </DocSection>

          {documentRowVisible('judges-book', docCtx) && (
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
          )}

          <DocSection title="Schedule" description="Complete schedule with cover page, judges, classes, entry fees, and postal entry form" icon={Calendar}>
            <DocRow icon={<Calendar className="size-4" />} label="Show Schedule" description="Full printable schedule">
              <PdfViewerButton icon={<Calendar className="size-4" />} label="View" url={`/api/schedule/${showId}`} />
            </DocRow>
          </DocSection>

          <DocSection title="Entry Lists" description="Working lists you check while entries are coming in" icon={FileSpreadsheet}>
            <DocRow icon={<ListOrdered className="size-4" />} label="Exhibitor List" description="Alphabetical list of exhibitors and their dogs">
              <PdfViewerButton icon={<ListOrdered className="size-4" />} label="View" url={`/api/reports/${showId}/catalogue-order`} />
              <XlsxButton href={`/api/reports/${showId}/catalogue-order-xlsx`} filename={`Exhibitor-List-${showId}.xlsx`} />
            </DocRow>
            <DocRow icon={<BookMarked className="size-4" />} label="Pre-booked Catalogues" description="Who ordered a printed or online catalogue">
              <PdfViewerButton icon={<BookMarked className="size-4" />} label="View" url={`/api/reports/${showId}/catalogue-orders`} />
              <XlsxButton href={`/api/reports/${showId}/catalogue-orders-xlsx`} filename={`Pre-booked-Catalogues-${showId}.xlsx`} />
            </DocRow>
            <DocRow icon={<BarChart3 className="size-4" />} label="Class Breakdown" description="Entry counts and revenue per class">
              <PdfViewerButton icon={<BarChart3 className="size-4" />} label="View" url={`/api/reports/${showId}/class-breakdown`} />
              <XlsxButton href={`/api/reports/${showId}/class-breakdown-xlsx`} filename={`Class-Breakdown-${showId}.xlsx`} />
            </DocRow>
            <DocRow icon={<FileSpreadsheet className="size-4" />} label="Entry Report (CSV)" description="Every entry — exhibitor, dog, classes and fee, one row each">
              <CsvButton label="Download CSV" onGenerate={exportEntryReportCsv} />
            </DocRow>
          </DocSection>

          {documentRowVisible('ring-numbers', docCtx) && (
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
            {documentRowVisible('ring-board', docCtx) && (
              <DocRow icon={<Map className="size-4" />} label="Ring Board" description="Ring assignments showing judges, breeds, and classes with entry counts">
                <PdfViewerButton icon={<Map className="size-4" />} label="View" url={`/api/ring-board/${showId}`} />
              </DocRow>
            )}
            {documentRowVisible('award-board', docCtx) && (
              <DocRow icon={<Award className="size-4" />} label="Award Board" description="A4 landscape wipe-clean grid — laminate and re-use to record placements and best-of awards on the day">
                <PdfViewerButton icon={<Award className="size-4" />} label="View" url={`/api/award-board/${showId}`} />
              </DocRow>
            )}
            {documentRowVisible('prize-cards', docCtx) && (
              <DocRow
                icon={<Award className="size-4" />}
                label="Prize Cards"
                description="Official A5 template for 1st, 2nd, 3rd and Reserve, with your club, show and judge details printed on. Print single-sided — turn off two-sided in your print box."
                extra={prizeCardCountsLine}
              >
                {/* Download is the primary action — this is the real PDF
                    (non-preview, so Content-Disposition: attachment), the
                    file Mandy uploads to Doxzoo for printing. */}
                {downloadingKey === 'prize-cards' ? (
                  <Button disabled className="min-h-[2.75rem]"><Loader2 className="size-4 animate-spin" />Downloading…</Button>
                ) : (
                  <Button className="min-h-[2.75rem]" onClick={() => handleDownload('prize-cards', prizeCardHref, 'Prize-Cards.pdf')}>
                    <Download className="size-4" />Download
                  </Button>
                )}
                {/* Print opens the mobile-print HTML wrapper in a new tab —
                    it is NOT a PDF, so it must never go through
                    handleDownload/blob-download (that saved the HTML bytes
                    with a .pdf extension, giving Mandy a blank page). The
                    wrapper embeds the real PDF in an iframe and auto-opens
                    the browser print dialog. */}
                <Button
                  variant="outline"
                  className="min-h-[2.75rem]"
                  onClick={() => window.open(prizeCardPrintHref, '_blank')}
                >
                  <Printer className="size-4" />Print
                </Button>
                <PdfViewerButton icon={<Award className="size-4" />} label="Preview" url={prizeCardHref} variant="outline" />
              </DocRow>
            )}
          </DocSection>
          )}
        </div>
      </div>

      {/* ─────────────────────── After the Show ─────────────────────── */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          After the Show
        </h2>
        <DocSection title="Results & Returns" description="Documents for RKC submission and show records after judging is complete" icon={Trophy}>
          {documentRowVisible('judge-critiques', docCtx) && (
            <DocRow
              icon={<MessageSquare className="size-4" />}
              label="Judge critiques"
              description="Invite the judge to send their critiques, check them, and publish to the results page"
            >
              <Button className="min-h-[2.75rem]" asChild>
                <Link href={`/secretary/shows/${showId}/critiques`}>
                  <MessageSquare className="size-4" />
                  Open
                </Link>
              </Button>
            </DocRow>
          )}
          {documentRowVisible('marked-catalogue', docCtx) && (
            <DocRow
              icon={<CheckSquare className="size-4" />}
              label="Marked Catalogue"
              description="Full catalogue with results, placements, absentees, and awards annotated — required by the RKC within 14 days for championship shows"
              note={!resultsFinalised ? 'Will be empty until results are published' : undefined}
            >
              <CatalogueJobButton icon={<CheckSquare className="size-4" />} label="View" showId={showId} format="marked" />
            </DocRow>
          )}
          <DocRow
            icon={<UserX className="size-4" />}
            label="Absentees (Catalogue PDF)"
            description="Dogs marked absent on paid entries — matches your printed catalogue, excludes Junior Handling"
          >
            <CatalogueJobButton icon={<UserX className="size-4" />} label="View" showId={showId} format="absentees" />
            <XlsxButton href={`/api/reports/${showId}/absentee-catalogue-xlsx`} filename={`Absentees-${showId}.xlsx`} />
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
            <XlsxButton href={`/api/reports/${showId}/absentee-report-xlsx`} filename={`Absentee-Report-${showId}.xlsx`} />
          </DocRow>
          <DocRow
            icon={<FileSpreadsheet className="size-4" />}
            label="Withdrawn & Absent (CSV)"
            description="Every withdrawn or absent entry on a paid order, including Junior Handling"
          >
            <CsvButton label="Download CSV" onGenerate={exportWithdrawnAndAbsentCsv} />
            <XlsxButton href={`/api/reports/${showId}/withdrawn-absent-xlsx`} filename={`Withdrawn-And-Absent-${showId}.xlsx`} />
          </DocRow>
          {isKcChampionship && (
            <DocRow icon={<UserX className="size-4" />} label="RKC SH01 Return" description="Championship show absentee return for RKC submission">
              <PdfViewerButton icon={<UserX className="size-4" />} label="View" url={`/api/reports/${showId}/sh01`} />
              <XlsxButton href={`/api/reports/${showId}/sh01-xlsx`} filename={`KC-Absentee-Report-SH01-${showId}.xlsx`} />
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
          <DocRow icon={<PoundSterling className="size-4" />} label="Full Financial Statement (CSV)" description="Every entry with its fee and catalogue-order status, for club records">
            <CsvButton label="Download CSV" onGenerate={exportFinancialStatementCsv} />
            <XlsxButton href={`/api/reports/${showId}/financial-statement-xlsx`} filename={`Financial-Statement-${showId}.xlsx`} />
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
