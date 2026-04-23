'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { fireDogConfetti } from '@/lib/confetti';
import {
  CalendarDays,
  Camera,
  ChevronDown,
  Edit3,
  Gavel,
  ImageIcon,
  Loader2,
  Mail,
  MapPin,
  Trash2,
  Upload,
  X,
  Users,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { formatDateRange, poundsToPence } from '@/lib/date-utils';
import { showTypeLabels } from '@/lib/show-types';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { uploadImage } from '@/lib/upload';
import { formatDate } from './_lib/show-utils';
import { useShowId } from './_lib/show-context';
import { PhaseActionPanel } from './_components/phase-action-panel';
import { SetupWizard } from './_components/setup-wizard';
import { ClassManager, BulkClassCreator, AddIndividualClass } from './_components/class-manager';
import { SundryItemManager } from './_components/sundry-item-manager';

export default function OverviewPage() {
  const showId = useShowId();
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const searchParams = useSearchParams();

  const { data: show } = trpc.shows.getById.useQuery({ id: showId });

  // Fire confetti when arriving from show creation
  useEffect(() => {
    if (searchParams.get('created') === 'true') {
      fireDogConfetti();
      // Clean up the URL param without a navigation
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [searchParams]);

  if (!show) return null;

  // Show the setup wizard for draft/published shows
  if (show.status === 'draft' || show.status === 'published') {
    return <SetupWizard showId={showId} show={show} />;
  }

  // Derived display values
  const dateDisplay = formatDateRange(show.startDate, show.endDate);
  const venueDisplay = show.venue?.name ?? 'No venue set';
  const uniqueJudges = show.judgeAssignments?.length
    ? Array.from(
        new Map(show.judgeAssignments.map((a) => [a.judge.id, a.judge.name])).values()
      )
    : [];

  // Count how many secondary details exist
  const hasSecretaryInfo = !!(show.secretaryName || show.secretaryEmail);
  const hasScheduleInfo = !!(show.showOpenTime || show.entryCloseDate || show.postalCloseDate);
  const hasSecondaryDetails = hasSecretaryInfo || hasScheduleInfo || uniqueJudges.length > 0 || !!show.description;

  return (
    <div className="space-y-6">
      {/* Phase Action Panel */}
      <PhaseActionPanel />

      {/* Show Details — compact "boarding pass" style */}
      <Card className="overflow-hidden rounded-2xl shadow-sm">
        {/* Hero strip — key info at a glance */}
        <div className="border-b bg-gradient-to-br from-primary/[0.04] to-transparent px-4 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2.5">
              {/* Date — the most important thing */}
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <CalendarDays className="size-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Date</p>
                  <p className="truncate font-serif text-sm font-semibold tracking-tight">{dateDisplay}</p>
                </div>
              </div>

              {/* Venue */}
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <MapPin className="size-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Venue</p>
                  <p className="truncate text-sm font-medium">
                    {venueDisplay}
                    {show.venue?.postcode && (
                      <span className="ml-1 text-xs text-muted-foreground">({show.venue.postcode})</span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Edit button */}
            <EditShowDetailsDialog show={show} showId={showId} />
          </div>

          {/* Type / Scope / Structure badges — dense horizontal row */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="text-[11px] font-medium">
              {showTypeLabels[show.showType] ?? show.showType}
            </Badge>
            <Badge variant="outline" className="text-[11px] font-medium capitalize">
              {show.showScope.replace('_', ' ')}
            </Badge>
            {show.classSexArrangement && (
              <Badge variant="outline" className="text-[11px] font-medium">
                {show.classSexArrangement === 'separate_sex' ? 'Separate Dog & Bitch' : 'Combined'}
              </Badge>
            )}
            {show.showOpenTime && (
              <Badge variant="outline" className="text-[11px] font-medium">
                <Clock className="mr-0.5 size-3" />
                Opens {show.showOpenTime}
              </Badge>
            )}
          </div>
        </div>

        {/* Quick-reference row — close dates side by side */}
        {(show.entryCloseDate || show.postalCloseDate) && (
          <div className="grid grid-cols-2 divide-x border-b text-center">
            <div className="px-3 py-2.5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Entries Close</p>
              <p className="mt-0.5 text-xs font-semibold">{formatDate(show.entryCloseDate)}</p>
            </div>
            <div className="px-3 py-2.5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Postal Close</p>
              <p className="mt-0.5 text-xs font-semibold">{formatDate(show.postalCloseDate)}</p>
            </div>
          </div>
        )}

        {/* Expandable secondary details */}
        {hasSecondaryDetails && (
          <div>
            <button
              type="button"
              onClick={() => setDetailsExpanded((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground sm:px-6"
            >
              <span>{detailsExpanded ? 'Hide details' : 'More details'}</span>
              <ChevronDown
                className={`size-3.5 transition-transform duration-200 ${detailsExpanded ? 'rotate-180' : ''}`}
              />
            </button>

            {detailsExpanded && (
              <div className="animate-in slide-in-from-top-1 fade-in border-t px-4 pb-4 pt-3 sm:px-6">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  {/* Secretary info */}
                  {show.secretaryName && (
                    <div className="min-w-0">
                      <dt className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        <Users className="size-3" /> Secretary
                      </dt>
                      <dd className="mt-0.5 truncate font-medium">{show.secretaryName}</dd>
                    </div>
                  )}
                  {show.secretaryEmail && (
                    <div className="min-w-0">
                      <dt className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        <Mail className="size-3" /> Email
                      </dt>
                      <dd className="mt-0.5 truncate text-xs">{show.secretaryEmail}</dd>
                    </div>
                  )}

                  {/* Judges */}
                  {uniqueJudges.length > 0 && (
                    <div className="col-span-2 min-w-0">
                      <dt className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        <Gavel className="size-3" /> {uniqueJudges.length === 1 ? 'Judge' : 'Judges'}
                      </dt>
                      <dd className="mt-0.5 font-medium">{uniqueJudges.join(', ')}</dd>
                    </div>
                  )}

                  {/* Description */}
                  {show.description && (
                    <div className="col-span-2 min-w-0">
                      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Description</dt>
                      <dd className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                        {show.description}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Venue image upload */}
      {show.venue && (
        <VenueImageUpload
          venueId={show.venue.id}
          currentImageUrl={(show.venue as Record<string, unknown>).imageUrl as string | null}
          venueName={show.venue.name}
          showId={showId}
        />
      )}

      {/* Class management */}
      <ClassManager showId={showId} showType={show.showType} classes={show.showClasses ?? []} />

      {/* Add classes — prominent when empty, folded into ClassManager when classes exist */}
      {(show.showClasses?.length ?? 0) === 0 && (
        <>
          <BulkClassCreator showId={showId} />
          <AddIndividualClass showId={showId} />
        </>
      )}

      {/* Sundry items management */}
      <SundryItemManager showId={showId} />

      {/* Delete show (draft only) */}
      {show.status === 'draft' && (
        <DeleteShowSection showId={showId} showName={show.name} />
      )}
    </div>
  );
}

// ── Venue Image Upload ───────────────────────────────────

function VenueImageUpload({
  venueId,
  currentImageUrl,
  venueName,
  showId,
}: {
  venueId: string;
  currentImageUrl: string | null;
  venueName: string;
  showId: string;
}) {
  const [imageUrl, setImageUrl] = useState(currentImageUrl ?? '');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const updateMutation = trpc.secretary.updateVenue.useMutation({
    onSuccess: () => {
      utils.shows.getById.invalidate({ id: showId });
      toast.success('Venue photo updated');
    },
    onError: (err) => toast.error(err.message ?? 'Failed to update venue'),
  });

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const publicUrl = await uploadImage(file);
      setImageUrl(publicUrl);
      updateMutation.mutate({ venueId, imageUrl: publicUrl });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setUploading(false);
    }
  }, [venueId, updateMutation]);

  function handleRemove() {
    setImageUrl('');
    updateMutation.mutate({ venueId, imageUrl: null });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-serif text-base">
          <MapPin className="size-4 text-primary" />
          Venue Photo — {venueName}
        </CardTitle>
        <CardDescription className="text-xs">
          Shows on the public page in the venue section. Landscape images work best.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            'group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-all duration-200',
            imageUrl ? 'h-36 border-transparent' : 'h-28',
            dragOver
              ? 'border-primary bg-primary/5 scale-[1.01]'
              : !imageUrl && 'border-muted-foreground/20 bg-muted/20 hover:border-primary/40 hover:bg-muted/40'
          )}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleUpload(file);
          }}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="size-6 animate-spin text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Uploading...</span>
            </div>
          ) : imageUrl ? (
            <>
              <img src={imageUrl} alt={`${venueName} photo`} className="size-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="size-6 text-white" />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1.5 px-3 text-center">
              <div className="rounded-full bg-muted p-2.5">
                <ImageIcon className="size-5 text-muted-foreground" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                {dragOver ? 'Drop here' : 'Click or drag to upload venue photo'}
              </span>
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = '';
          }}
        />
        {imageUrl && (
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
              disabled={uploading}
            >
              <Upload className="size-3.5" />
              Replace
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={handleRemove}
              disabled={uploading}
            >
              <X className="size-3.5" />
              Remove
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Edit Show Details Dialog ──────────────────────────────

function EditShowDetailsDialog({
  show,
  showId,
}: {
  show: {
    name: string;
    showType: string;
    showScope: string;
    classSexArrangement: string | null;
    secretaryEmail: string | null;
    secretaryName: string | null;
    secretaryAddress: string | null;
    secretaryPhone: string | null;
    showOpenTime: string | null;
    startTime: string | null;
    onCallVet: string | null;
    startDate: string;
    endDate: string;
    entryCloseDate: Date | string | null;
    postalCloseDate: Date | string | null;
    kcLicenceNo: string | null;
    description: string | null;
    bannerImageUrl: string | null;
    bannerImageStorageKey: string | null;
    firstEntryFee: number | null;
    subsequentEntryFee: number | null;
    nfcEntryFee: number | null;
    juniorHandlerFee: number | null;
  };
  showId: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(show.name);
  const [showType, setShowType] = useState(show.showType);
  const [showScope, setShowScope] = useState(show.showScope);
  const [classSexArrangement, setClassSexArrangement] = useState(show.classSexArrangement ?? '');
  const [secretaryEmail, setSecretaryEmail] = useState(show.secretaryEmail ?? '');
  const [secretaryName, setSecretaryName] = useState(show.secretaryName ?? '');
  const [secretaryAddress, setSecretaryAddress] = useState(show.secretaryAddress ?? '');
  const [secretaryPhone, setSecretaryPhone] = useState(show.secretaryPhone ?? '');
  const [showOpenTime, setShowOpenTime] = useState(show.showOpenTime ?? '');
  const [onCallVet, setOnCallVet] = useState(show.onCallVet ?? '');
  const [startDate, setStartDate] = useState(show.startDate);
  const [endDate, setEndDate] = useState(show.endDate);
  const [entryCloseDate, setEntryCloseDate] = useState(
    show.entryCloseDate
      ? new Date(show.entryCloseDate).toISOString().slice(0, 16)
      : ''
  );
  const [postalCloseDate, setPostalCloseDate] = useState(
    show.postalCloseDate
      ? new Date(show.postalCloseDate).toISOString().slice(0, 16)
      : ''
  );
  const [kcLicenceNo, setKcLicenceNo] = useState(show.kcLicenceNo ?? '');
  const [description, setDescription] = useState(show.description ?? '');
  const [bannerImageUrl, setBannerImageUrl] = useState(show.bannerImageUrl ?? '');
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerDragOver, setBannerDragOver] = useState(false);
  const bannerFileRef = useRef<HTMLInputElement>(null);
  const [firstEntryFee, setFirstEntryFee] = useState(show.firstEntryFee != null ? (show.firstEntryFee / 100).toFixed(2) : '');
  const [subsequentEntryFee, setSubsequentEntryFee] = useState(show.subsequentEntryFee != null ? (show.subsequentEntryFee / 100).toFixed(2) : '');
  const [nfcEntryFee, setNfcEntryFee] = useState(show.nfcEntryFee != null ? (show.nfcEntryFee / 100).toFixed(2) : '');
  const [juniorHandlerFee, setJuniorHandlerFee] = useState(show.juniorHandlerFee != null ? (show.juniorHandlerFee / 100).toFixed(2) : '');
  const [startTime, setStartTime] = useState(show.startTime ?? '');

  const handleBannerUpload = useCallback(async (file: File) => {
    setBannerUploading(true);
    try {
      const publicUrl = await uploadImage(file);
      setBannerImageUrl(publicUrl);
      toast.success('Banner image uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setBannerUploading(false);
    }
  }, []);

  const utils = trpc.useUtils();
  const updateMutation = trpc.shows.update.useMutation({
    onSuccess: () => {
      utils.shows.getById.invalidate({ id: showId });
      toast.success('Show details updated');
      setOpen(false);
    },
    onError: (err) => toast.error(err.message ?? 'Failed to update show'),
  });

  function handleSave() {
    // Validate close dates are before show start date
    if (entryCloseDate && startDate && new Date(entryCloseDate) >= new Date(startDate)) {
      toast.error('Entry close date must be before the show start date');
      return;
    }
    if (postalCloseDate && startDate && new Date(postalCloseDate) >= new Date(startDate)) {
      toast.error('Postal close date must be before the show start date');
      return;
    }
    updateMutation.mutate({
      id: showId,
      name,
      showType: showType as 'companion' | 'primary' | 'limited' | 'open' | 'premier_open' | 'championship',
      showScope: showScope as 'single_breed' | 'group' | 'general',
      classSexArrangement: (classSexArrangement as 'separate_sex' | 'combined_sex') || null,
      secretaryEmail: secretaryEmail || null,
      secretaryName: secretaryName || null,
      secretaryAddress: secretaryAddress || null,
      secretaryPhone: secretaryPhone || null,
      showOpenTime: showOpenTime || null,
      onCallVet: onCallVet || null,
      startDate,
      endDate,
      entryCloseDate: entryCloseDate
        ? new Date(entryCloseDate).toISOString()
        : null,
      postalCloseDate: postalCloseDate
        ? new Date(postalCloseDate).toISOString()
        : null,
      kcLicenceNo: kcLicenceNo || null,
      description: description || null,
      bannerImageUrl: bannerImageUrl || null,
      firstEntryFee: firstEntryFee ? poundsToPence(Number(firstEntryFee)) : null,
      subsequentEntryFee: subsequentEntryFee ? poundsToPence(Number(subsequentEntryFee)) : null,
      nfcEntryFee: nfcEntryFee ? poundsToPence(Number(nfcEntryFee)) : null,
      juniorHandlerFee: juniorHandlerFee ? poundsToPence(Number(juniorHandlerFee)) : null,
      startTime: startTime || null,
    });
  }

  // Sync form state from server data when dialog opens
  useEffect(() => {
    if (!open) return;
    setName(show.name);
    setShowType(show.showType);
    setShowScope(show.showScope);
    setStartDate(show.startDate);
    setEndDate(show.endDate);
    setEntryCloseDate(
      show.entryCloseDate
        ? new Date(show.entryCloseDate).toISOString().slice(0, 16)
        : ''
    );
    setPostalCloseDate(
      show.postalCloseDate
        ? new Date(show.postalCloseDate).toISOString().slice(0, 16)
        : ''
    );
    setKcLicenceNo(show.kcLicenceNo ?? '');
    setDescription(show.description ?? '');
    setClassSexArrangement(show.classSexArrangement ?? '');
    setSecretaryEmail(show.secretaryEmail ?? '');
    setSecretaryName(show.secretaryName ?? '');
    setSecretaryAddress(show.secretaryAddress ?? '');
    setSecretaryPhone(show.secretaryPhone ?? '');
    setShowOpenTime(show.showOpenTime ?? '');
    setOnCallVet(show.onCallVet ?? '');
    setBannerImageUrl(show.bannerImageUrl ?? '');
    setFirstEntryFee(show.firstEntryFee != null ? (show.firstEntryFee / 100).toFixed(2) : '');
    setSubsequentEntryFee(show.subsequentEntryFee != null ? (show.subsequentEntryFee / 100).toFixed(2) : '');
    setNfcEntryFee(show.nfcEntryFee != null ? (show.nfcEntryFee / 100).toFixed(2) : '');
    setJuniorHandlerFee(show.juniorHandlerFee != null ? (show.juniorHandlerFee / 100).toFixed(2) : '');
    setStartTime(show.startTime ?? '');
  }, [open]); // reads current `show` via closure when dialog opens

  return (
    <>
      <Button variant="outline" size="sm" className="min-h-[2.75rem]" onClick={() => setOpen(true)}>
        <Edit3 className="size-4" />
        Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[min(85vh,calc(100dvh-4rem))] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Show Details</DialogTitle>
            <DialogDescription>
              Update the basic details for this show.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {/* Banner image upload */}
            <div className="space-y-1.5">
              <Label>Banner Image</Label>
              <p className="text-xs text-muted-foreground">
                Appears as the hero background on your show page. Use a wide landscape photo (1200&times;400px or larger).
              </p>
              <div
                className={cn(
                  'group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-all duration-200',
                  bannerImageUrl ? 'h-32 border-transparent' : 'h-28',
                  bannerDragOver
                    ? 'border-primary bg-primary/5 scale-[1.01]'
                    : !bannerImageUrl && 'border-muted-foreground/20 bg-muted/20 hover:border-primary/40 hover:bg-muted/40'
                )}
                onClick={() => bannerFileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setBannerDragOver(true); }}
                onDragLeave={() => setBannerDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setBannerDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleBannerUpload(file);
                }}
              >
                {bannerUploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="size-6 animate-spin text-primary" />
                    <span className="text-xs font-medium text-muted-foreground">Uploading...</span>
                  </div>
                ) : bannerImageUrl ? (
                  <>
                    <img src={bannerImageUrl} alt="Banner preview" className="size-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                      <Camera className="size-6 text-white" />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-1.5 px-3 text-center">
                    <div className="rounded-full bg-muted p-2.5">
                      <ImageIcon className="size-5 text-muted-foreground" />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">
                      {bannerDragOver ? 'Drop here' : 'Click or drag to upload banner'}
                    </span>
                  </div>
                )}
              </div>
              <input
                ref={bannerFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleBannerUpload(file);
                  e.target.value = '';
                }}
              />
              {bannerImageUrl && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); bannerFileRef.current?.click(); }}
                    disabled={bannerUploading}
                  >
                    <Upload className="size-3.5" />
                    Replace
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); setBannerImageUrl(''); }}
                    disabled={bannerUploading}
                  >
                    <X className="size-3.5" />
                    Remove
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Show Name</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Show Type</Label>
                <Select value={showType} onValueChange={setShowType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="companion">Companion</SelectItem>
                    <SelectItem value="primary">Primary</SelectItem>
                    <SelectItem value="limited">Limited</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="premier_open">Premier Open</SelectItem>
                    <SelectItem value="championship">Championship</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Show Scope</Label>
                <Select value={showScope} onValueChange={setShowScope}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single_breed">Single Breed</SelectItem>
                    <SelectItem value="group">Group</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Class Structure</Label>
                <Select value={classSexArrangement} onValueChange={setClassSexArrangement}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select class structure" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="separate_sex">Separate Dog & Bitch</SelectItem>
                    <SelectItem value="combined_sex">Combined Dog & Bitch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-secretary-email">Secretary Contact Email</Label>
                <Input
                  id="edit-secretary-email"
                  type="email"
                  value={secretaryEmail}
                  onChange={(e) => setSecretaryEmail(e.target.value)}
                  placeholder="e.g. secretary@club.co.uk"
                />
              </div>
            </div>

            {/* Secretary & Schedule Details */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-secretary-name">Secretary Name</Label>
                <Input
                  id="edit-secretary-name"
                  value={secretaryName}
                  onChange={(e) => setSecretaryName(e.target.value)}
                  placeholder="e.g. Amanda Smith"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-secretary-phone">Secretary Phone</Label>
                <Input
                  id="edit-secretary-phone"
                  type="tel"
                  value={secretaryPhone}
                  onChange={(e) => setSecretaryPhone(e.target.value)}
                  placeholder="e.g. 07700 900000"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-secretary-address">Secretary Address</Label>
              <Input
                id="edit-secretary-address"
                value={secretaryAddress}
                onChange={(e) => setSecretaryAddress(e.target.value)}
                placeholder="House/flat, street, town, postcode"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-show-open-time">Show Opens At</Label>
                <Input
                  id="edit-show-open-time"
                  type="time"
                  value={showOpenTime}
                  onChange={(e) => setShowOpenTime(e.target.value)}
                  placeholder="e.g. 09:00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-judging-commences">Judging Commences</Label>
                <Input
                  id="edit-judging-commences"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  placeholder="e.g. 10:00"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-on-call-vet">On-Call Vet</Label>
                <Input
                  id="edit-on-call-vet"
                  value={onCallVet}
                  onChange={(e) => setOnCallVet(e.target.value)}
                  placeholder="Vet name & contact"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-start">Start Date</Label>
                <Input
                  id="edit-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    const newStartDate = e.target.value;
                    setStartDate(newStartDate);

                    // If entry close date is on or after the new start date, auto-adjust
                    if (newStartDate && entryCloseDate) {
                      const closeDate = new Date(entryCloseDate);
                      const showDate = new Date(newStartDate);
                      if (closeDate >= showDate) {
                        // Set entry close to 7 days before the new start date at 23:59
                        const adjusted = new Date(showDate);
                        adjusted.setDate(adjusted.getDate() - 7);
                        const adjustedStr = adjusted.toISOString().slice(0, 11) + '23:59';
                        setEntryCloseDate(adjustedStr);
                        const displayDate = adjusted.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
                        toast.info(`Entry close date adjusted to ${displayDate} — it can't be after the show date`);
                      }
                    }

                    // Also check postal close date
                    if (newStartDate && postalCloseDate) {
                      const postalDate = new Date(postalCloseDate);
                      const showDate = new Date(newStartDate);
                      if (postalDate >= showDate) {
                        const adjusted = new Date(showDate);
                        adjusted.setDate(adjusted.getDate() - 10);
                        const adjustedStr = adjusted.toISOString().slice(0, 11) + '23:59';
                        setPostalCloseDate(adjustedStr);
                        const displayDate = adjusted.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
                        toast.info(`Postal close date adjusted to ${displayDate} — it can't be after the show date`);
                      }
                    }
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-end">End Date</Label>
                <Input
                  id="edit-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-entry-close">Entry Close Date</Label>
                <Input
                  id="edit-entry-close"
                  type="datetime-local"
                  value={entryCloseDate}
                  max={startDate ? `${startDate}T00:00` : undefined}
                  onChange={(e) => {
                    const newClose = e.target.value;
                    if (newClose && startDate && new Date(newClose) >= new Date(startDate)) {
                      toast.error('Entry close date must be before the show date');
                      return;
                    }
                    setEntryCloseDate(newClose);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-postal-close">Postal Close Date</Label>
                <Input
                  id="edit-postal-close"
                  type="datetime-local"
                  value={postalCloseDate}
                  max={startDate ? `${startDate}T00:00` : undefined}
                  onChange={(e) => {
                    const newClose = e.target.value;
                    if (newClose && startDate && new Date(newClose) >= new Date(startDate)) {
                      toast.error('Postal close date must be before the show date');
                      return;
                    }
                    setPostalCloseDate(newClose);
                  }}
                />
              </div>
            </div>
            {/* Entry Fees */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-first-fee">First Entry Fee</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
                  <Input
                    id="edit-first-fee"
                    type="number"
                    min="0"
                    step="0.01"
                    className="pl-7"
                    value={firstEntryFee}
                    onChange={(e) => setFirstEntryFee(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-subsequent-fee">Subsequent Fee</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
                  <Input
                    id="edit-subsequent-fee"
                    type="number"
                    min="0"
                    step="0.01"
                    className="pl-7"
                    value={subsequentEntryFee}
                    onChange={(e) => setSubsequentEntryFee(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-nfc-fee">NFC Fee</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
                  <Input
                    id="edit-nfc-fee"
                    type="number"
                    min="0"
                    step="0.01"
                    className="pl-7"
                    value={nfcEntryFee}
                    onChange={(e) => setNfcEntryFee(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-jh-fee">Junior Handler Fee</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
                  <Input
                    id="edit-jh-fee"
                    type="number"
                    min="0"
                    step="0.01"
                    className="pl-7"
                    value={juniorHandlerFee}
                    onChange={(e) => setJuniorHandlerFee(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-kc">RKC Licence Number</Label>
              <Input
                id="edit-kc"
                value={kcLicenceNo}
                onChange={(e) => setKcLicenceNo(e.target.value)}
                placeholder="e.g. 12345"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-description">Description</Label>
              <textarea
                id="edit-description"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description for exhibitors..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!name.trim() || !startDate || !endDate || updateMutation.isPending}
            >
              {updateMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Delete Show ─────────────────────────────────────────────

function DeleteShowSection({ showId, showName }: { showId: string; showName: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleteMutation = trpc.secretary.deleteShow.useMutation({
    onSuccess: () => {
      toast.success('Show deleted');
      window.location.href = '/secretary';
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <>
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive">Danger Zone</CardTitle>
        <CardDescription>
          Permanently delete this show and all associated classes. This action cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="destructive"
          onClick={() => setConfirmOpen(true)}
          disabled={deleteMutation.isPending}
        >
          {deleteMutation.isPending && (
            <Loader2 className="size-4 animate-spin" />
          )}
          <Trash2 className="size-4" />
          Delete Show
        </Button>
      </CardContent>
    </Card>

    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{showName}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the show and all its classes. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => deleteMutation.mutate({ showId })}>
            Delete Show
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

