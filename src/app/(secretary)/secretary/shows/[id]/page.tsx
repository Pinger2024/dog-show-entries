'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import {
  CalendarDays,
  Camera,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Edit3,
  Gavel,
  GripVertical,
  Hash,
  ImageIcon,
  Loader2,
  ListChecks,
  AlertTriangle,
  Mail,
  MapPin,
  Plus,
  Trash2,
  Upload,
  X,
  Users,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { formatCurrency, formatDateRange, penceToPoundsString, poundsToPence } from '@/lib/date-utils';
import { showTypeLabels } from '@/lib/show-types';
import { cn } from '@/lib/utils';
import { CLASS_TEMPLATES } from '@/lib/class-templates';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

export default function OverviewPage() {
  const showId = useShowId();
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  const { data: show } = trpc.shows.getById.useQuery({ id: showId });

  if (!show) return null;

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
      {/* Show Readiness */}
      <ReadinessCard showId={showId} />

      {/* Show Details — compact "boarding pass" style */}
      <Card className="overflow-hidden">
        {/* Hero strip — key info at a glance */}
        <div className="border-b bg-primary/[0.03] px-4 py-4 sm:px-6">
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
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Entries Close</p>
              <p className="mt-0.5 text-xs font-semibold">{formatDate(show.entryCloseDate)}</p>
            </div>
            <div className="px-3 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Postal Close</p>
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
      <ClassManager showId={showId} classes={show.showClasses ?? []} />

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
    onCallVet: string | null;
    startDate: string;
    endDate: string;
    entryCloseDate: Date | string | null;
    postalCloseDate: Date | string | null;
    kcLicenceNo: string | null;
    description: string | null;
    bannerImageUrl: string | null;
    bannerImageStorageKey: string | null;
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
  }, [open]); // reads current `show` via closure when dialog opens

  return (
    <>
      <Button variant="outline" size="sm" className="min-h-[2.75rem]" onClick={() => setOpen(true)}>
        <Edit3 className="size-4" />
        Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
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
                placeholder="Full postal address for schedule"
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

// ── Class Manager ─────────────────────────────────────────────

interface ClassManagerProps {
  showId: string;
  classes: {
    id: string;
    entryFee: number;
    sex: 'dog' | 'bitch' | null;
    sortOrder: number;
    classNumber?: number | null;
    classDefinition?: { name: string; type: string } | null;
    breed?: { name: string; group?: { name: string; sortOrder: number } | null } | null;
  }[];
}

function ClassManager({ showId, classes }: ClassManagerProps) {
  const [editingFees, setEditingFees] = useState<Record<string, string>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [hasInitializedCollapse, setHasInitializedCollapse] = useState(false);
  // Optimistic ordering: maps classId → sortOrder for instant visual feedback during drag
  const [optimisticOrder, setOptimisticOrder] = useState<Record<string, number> | null>(null);
  const [pendingAction, setPendingAction] = useState<{ message: string; action: () => void } | null>(null);
  const utils = trpc.useUtils();

  const updateMutation = trpc.secretary.updateShowClass.useMutation({
    onSuccess: () => {
      utils.shows.getById.invalidate({ id: showId });
      toast.success('Class updated');
    },
    onError: () => toast.error('Failed to update class'),
  });

  const deleteMutation = trpc.secretary.deleteShowClass.useMutation({
    onSuccess: () => {
      utils.shows.getById.invalidate({ id: showId });
      toast.success('Class removed');
    },
    onError: () => toast.error('Failed to remove class'),
  });

  const bulkDeleteMutation = trpc.secretary.bulkDeleteShowClasses.useMutation({
    onSuccess: (data) => {
      utils.shows.getById.invalidate({ id: showId });
      toast.success(`${data.deleted} classes removed`);
    },
    onError: (err) => toast.error(err.message ?? 'Failed to delete classes'),
  });

  const autoAssignMutation = trpc.secretary.autoAssignClassNumbers.useMutation({
    onSuccess: (data) => {
      utils.shows.getById.invalidate({ id: showId });
      toast.success(`${data.assigned} class numbers assigned`);
    },
    onError: () => toast.error('Failed to auto-assign class numbers'),
  });

  const reorderMutation = trpc.secretary.reorderClasses.useMutation({
    onSettled: () => {
      setOptimisticOrder(null);
      utils.shows.getById.invalidate({ id: showId });
    },
    onError: () => toast.error('Failed to reorder classes'),
  });

  function handleDragEnd(result: DropResult, groupIndex: number) {
    if (!result.destination || result.source.index === result.destination.index) return;

    // Build the full display order from all groups, applying the drag move within the target group
    const allIds: string[] = [];
    for (let gi = 0; gi < grouped.length; gi++) {
      const groupClassIds = grouped[gi].classes.map((c) => c.id);
      if (gi === groupIndex) {
        const [moved] = groupClassIds.splice(result.source.index, 1);
        groupClassIds.splice(result.destination.index, 0, moved);
      }
      allIds.push(...groupClassIds);
    }

    // Optimistic: apply new order instantly so UI doesn't snap back
    const newOrder: Record<string, number> = {};
    allIds.forEach((id, i) => { newOrder[id] = i; });
    setOptimisticOrder(newOrder);

    reorderMutation.mutate({ showId, classIds: allIds });
  }

  // Hooks must come before early returns (Rules of Hooks)
  const effectiveClasses = useMemo(() => {
    if (!optimisticOrder) return classes;
    return classes.map((c) => ({
      ...c,
      sortOrder: optimisticOrder[c.id] ?? c.sortOrder,
      classNumber: optimisticOrder[c.id] != null ? optimisticOrder[c.id] + 1 : c.classNumber,
    }));
  }, [classes, optimisticOrder]);

  const { isMultiBreed, grouped, breedGroupHeaders } = useMemo(() => {
    const distinctBreeds = new Set(effectiveClasses.filter((c) => c.breed).map((c) => c.breed!.name));
    const multiBreed = distinctBreeds.size >= 3;

    type GroupEntry = { key: string; label: string; classes: typeof effectiveClasses };
    const groups: GroupEntry[] = [];

    // Maps group index → breed group header to insert before that section
    const breedGroupHeaders = new Map<number, { name: string; breedCount: number }>();

    if (multiBreed) {
      const breedMap = new Map<string, { groupSort: number; groupName: string; classes: typeof effectiveClasses }>();
      for (const sc of effectiveClasses) {
        const breedName = sc.breed?.name ?? 'Other';
        const entry = breedMap.get(breedName) ?? {
          groupSort: sc.breed?.group?.sortOrder ?? 999,
          groupName: sc.breed?.group?.name ?? 'Other',
          classes: [],
        };
        entry.classes.push(sc);
        breedMap.set(breedName, entry);
      }

      const sortedBreeds = [...breedMap.entries()].sort((a, b) => {
        if (a[1].groupSort !== b[1].groupSort) return a[1].groupSort - b[1].groupSort;
        return a[0].localeCompare(b[0]);
      });

      const sexRank = (s: string | null) => s === 'dog' ? 0 : s === 'bitch' ? 1 : 2;
      let lastGroupName = '';
      for (const [breedName, { groupName, classes: breedClasses }] of sortedBreeds) {
        // Track group header positions
        if (groupName !== lastGroupName) {
          const breedsInGroup = sortedBreeds.filter(([, b]) => b.groupName === groupName).length;
          breedGroupHeaders.set(groups.length, { name: groupName, breedCount: breedsInGroup });
          lastGroupName = groupName;
        }
        const sorted = [...breedClasses].sort((a, b) => {
          const ra = sexRank(a.sex), rb = sexRank(b.sex);
          if (ra !== rb) return ra - rb;
          return a.sortOrder - b.sortOrder;
        });
        groups.push({ key: `breed-${breedName}`, label: breedName, classes: sorted });
      }
    } else {
      const sexOrder = ['dog', 'bitch', null] as const;
      const typeOrder = ['age', 'achievement', 'special', 'junior_handler', 'other'];

      for (const sex of sexOrder) {
        const sexClasses = effectiveClasses.filter((sc) =>
          sex === null ? !sc.sex : sc.sex === sex
        );
        if (sexClasses.length === 0) continue;

        for (const type of typeOrder) {
          const matchingClasses = sexClasses.filter(
            (sc) => (sc.classDefinition?.type ?? 'other') === type
          );
          if (matchingClasses.length === 0) continue;
          const sexLabel = sex === 'dog' ? 'Dog' : sex === 'bitch' ? 'Bitch' : 'Any Sex';
          const typeLabel =
            type === 'age' ? 'Age' :
            type === 'achievement' ? 'Achievement' :
            type === 'special' ? 'Special' :
            type === 'junior_handler' ? 'Junior Handler' : 'Other';
          groups.push({
            key: `${sex}-${type}`,
            label: `${sexLabel} — ${typeLabel} Classes`,
            classes: matchingClasses,
          });
        }
      }
    }

    // Sort groups by the minimum sortOrder of their classes so that
    // section-level reordering (which updates sortOrder) is respected.
    groups.sort((a, b) => {
      const minA = Math.min(...a.classes.map((c) => c.sortOrder));
      const minB = Math.min(...b.classes.map((c) => c.sortOrder));
      return minA - minB;
    });

    return { isMultiBreed: multiBreed, grouped: groups, breedGroupHeaders };
  }, [effectiveClasses]);

  // Collapse all sections except the first one on initial load
  useEffect(() => {
    if (hasInitializedCollapse || grouped.length <= 1) return;
    const initial: Record<string, boolean> = {};
    grouped.forEach((g, i) => { initial[g.key] = i > 0; });
    setCollapsedGroups(initial);
    setHasInitializedCollapse(true);
  }, [grouped, hasInitializedCollapse]);

  if (classes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Classes</CardTitle>
          <CardDescription>No classes added yet. Use the template below to get started.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  function startEditFee(classId: string, currentFeePence: number) {
    setEditingFees((prev) => ({
      ...prev,
      [classId]: penceToPoundsString(currentFeePence),
    }));
  }

  function saveFee(classId: string) {
    const val = editingFees[classId];
    if (val === undefined) return;
    const pounds = parseFloat(val);
    if (isNaN(pounds) || pounds < 0) {
      toast.error('Enter a valid fee in pounds (e.g. 5.00)');
      return;
    }
    const pence = poundsToPence(pounds);
    updateMutation.mutate({ showClassId: classId, entryFee: pence });
    setEditingFees((prev) => {
      const next = { ...prev };
      delete next[classId];
      return next;
    });
  }

  function cancelEditFee(classId: string) {
    setEditingFees((prev) => {
      const next = { ...prev };
      delete next[classId];
      return next;
    });
  }

  // Section-level drag: reorder entire groups
  function handleSectionDragEnd(result: DropResult) {
    if (!result.destination || result.source.index === result.destination.index) return;

    // Build new order by moving the entire group
    const newGrouped = [...grouped];
    const [movedGroup] = newGrouped.splice(result.source.index, 1);
    newGrouped.splice(result.destination.index, 0, movedGroup);

    // Flatten all class IDs in the new group order
    const allIds = newGrouped.flatMap((g) => g.classes.map((c) => c.id));

    // Optimistic: apply new order instantly so UI doesn't snap back
    const newOrder: Record<string, number> = {};
    allIds.forEach((id, i) => { newOrder[id] = i; });
    setOptimisticOrder(newOrder);

    reorderMutation.mutate({ showId, classIds: allIds });
  }

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Classes ({classes.length})</CardTitle>
            <CardDescription>Tap a section header to collapse it. Drag to reorder.</CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="min-h-[2.75rem] gap-1 px-2 text-xs text-muted-foreground"
              onClick={() => {
                const allCollapsed = grouped.every((g) => collapsedGroups[g.key]);
                const next: Record<string, boolean> = {};
                for (const g of grouped) next[g.key] = !allCollapsed;
                setCollapsedGroups(next);
              }}
            >
              {grouped.every((g) => collapsedGroups[g.key]) ? (
                <>
                  <ChevronsUpDown className="size-3.5" />
                  Expand
                </>
              ) : (
                <>
                  <ChevronsDownUp className="size-3.5" />
                  Collapse
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="min-h-[2.75rem]"
              onClick={() => autoAssignMutation.mutate({ showId })}
              disabled={autoAssignMutation.isPending}
            >
              {autoAssignMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Hash className="size-4" />
              )}
              Auto-number
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Section-level drag and drop */}
        <DragDropContext onDragEnd={(result) => {
          if (reorderMutation.isPending) return; // ignore drag while saving
          if (result.type === 'SECTION') {
            handleSectionDragEnd(result);
          } else {
            // Class-level drag — find group by stable key
            const groupKey = result.source.droppableId;
            const gi = grouped.findIndex((g) => g.key === groupKey);
            if (gi === -1) return;
            handleDragEnd(result, gi);
          }
        }}>
          <Droppable droppableId="sections" type="SECTION">
            {(sectionProvided) => (
              <div ref={sectionProvided.innerRef} {...sectionProvided.droppableProps} className="space-y-2">
                {grouped.map((group, gi) => {
                  const isCollapsed = collapsedGroups[group.key] ?? false;
                  const classRange = group.classes[0]?.classNumber && group.classes[group.classes.length - 1]?.classNumber
                    ? `#${group.classes[0].classNumber}–${group.classes[group.classes.length - 1].classNumber}`
                    : '';
                  const groupHeader = breedGroupHeaders.get(gi);

                  return (
                    <div key={group.key}>
                      {/* RKC breed group divider (multi-breed shows only) */}
                      {groupHeader && (
                        <div className="flex items-center gap-3 px-2 pb-1 pt-3 first:pt-0">
                          <div className="h-px flex-1 bg-border" />
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {groupHeader.name}
                          </span>
                          <Badge variant="outline" className="text-[10px] font-normal tabular-nums">
                            {groupHeader.breedCount} {groupHeader.breedCount === 1 ? 'breed' : 'breeds'}
                          </Badge>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                      )}
                    <Draggable draggableId={`section-${group.key}`} index={gi}>
                      {(sectionDragProvided, sectionSnapshot) => (
                        <div
                          ref={sectionDragProvided.innerRef}
                          {...sectionDragProvided.draggableProps}
                          className={cn('rounded-lg border', sectionSnapshot.isDragging && 'shadow-lg ring-2 ring-primary/20')}
                        >
                          {/* Section header — collapsible + draggable */}
                          <button
                            type="button"
                            onClick={() => toggleGroup(group.key)}
                            className={cn(
                              'flex w-full items-center gap-1.5 px-2 py-2 text-left transition-colors',
                              isCollapsed
                                ? 'rounded-lg bg-muted/60 hover:bg-muted'
                                : 'rounded-t-lg border-b bg-muted/30 hover:bg-muted/50'
                            )}
                          >
                            {/* Section drag handle */}
                            <div
                              {...sectionDragProvided.dragHandleProps}
                              className="flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground/40 active:bg-background active:text-foreground"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <GripVertical className="size-4" />
                            </div>

                            <ChevronDown className={cn(
                              'size-4 shrink-0 text-muted-foreground/60 transition-transform duration-200',
                              isCollapsed && '-rotate-90'
                            )} />

                            <div className="min-w-0 flex-1">
                              <span className={cn(
                                'text-xs font-semibold uppercase tracking-wider',
                                isCollapsed ? 'text-muted-foreground' : 'text-foreground/80'
                              )}>
                                {group.label}
                              </span>
                            </div>

                            <Badge variant="secondary" className="shrink-0 gap-1 text-[10px] font-medium tabular-nums">
                              {group.classes.length} {group.classes.length === 1 ? 'class' : 'classes'}
                              {classRange && <span className="text-muted-foreground">{classRange}</span>}
                            </Badge>

                            {/* Delete entire breed section (multi-breed only) */}
                            {isMultiBreed && (
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPendingAction({
                                    message: `Delete all ${group.classes.length} classes for ${group.label}?`,
                                    action: () => bulkDeleteMutation.mutate({
                                      showId,
                                      showClassIds: group.classes.map((c) => c.id),
                                    }),
                                  });
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setPendingAction({
                                      message: `Delete all ${group.classes.length} classes for ${group.label}?`,
                                      action: () => bulkDeleteMutation.mutate({
                                        showId,
                                        showClassIds: group.classes.map((c) => c.id),
                                      }),
                                    });
                                  }
                                }}
                                className="flex size-11 shrink-0 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive"
                                title={`Delete all ${group.label} classes`}
                              >
                                <Trash2 className="size-3.5" />
                              </div>
                            )}
                          </button>

                          {/* Class items — collapsible */}
                          {!isCollapsed && (
                            <Droppable droppableId={group.key} type="CLASS">
                              {(provided) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.droppableProps}
                                  className="space-y-1 px-2 py-2"
                                >
                                  {group.classes.map((sc, index) => (
                                    <Draggable key={sc.id} draggableId={sc.id} index={index}>
                                      {(dragProvided, snapshot) => (
                                        <div
                                          ref={dragProvided.innerRef}
                                          {...dragProvided.draggableProps}
                                          className={cn('flex items-center gap-1.5 rounded-md border bg-background px-2 py-1.5', snapshot.isDragging && 'shadow-lg ring-2 ring-primary/20')}
                                        >
                                          <div
                                            {...dragProvided.dragHandleProps}
                                            className="flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground/30 active:bg-muted active:text-foreground"
                                          >
                                            <GripVertical className="size-4" />
                                          </div>

                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs font-bold text-muted-foreground">
                                                #{sc.classNumber ?? '—'}
                                              </span>
                                              <span className="truncate text-sm font-medium">
                                                {sc.classDefinition?.name ?? 'Unknown'}
                                              </span>
                                            </div>
                                            <div className="mt-0.5 flex items-center gap-2">
                                              {sc.sex ? (
                                                <Badge variant="outline" className="text-[10px]">
                                                  {sc.sex === 'dog' ? 'Dog' : 'Bitch'}
                                                </Badge>
                                              ) : (
                                                <span className="text-[10px] text-muted-foreground">Any sex</span>
                                              )}
                                              {!isMultiBreed && sc.breed && (
                                                <span className="truncate text-[10px] text-muted-foreground">{sc.breed.name}</span>
                                              )}
                                            </div>
                                          </div>

                                          <div className="flex shrink-0 items-center gap-1">
                                            <button
                                              type="button"
                                              onClick={() => startEditFee(sc.id, sc.entryFee)}
                                              className="rounded px-2 py-1 text-sm font-semibold transition-colors hover:bg-muted"
                                            >
                                              {formatCurrency(sc.entryFee)}
                                            </button>
                                            <Button
                                              size="icon"
                                              variant="ghost"
                                              className="size-11 text-destructive hover:text-destructive"
                                              onClick={() => setPendingAction({
                                                message: 'Remove this class from the show?',
                                                action: () => deleteMutation.mutate({ showClassId: sc.id }),
                                              })}
                                              disabled={deleteMutation.isPending}
                                            >
                                              <Trash2 className="size-4" />
                                            </Button>
                                          </div>
                                        </div>
                                      )}
                                    </Draggable>
                                  ))}
                                  {provided.placeholder}
                                </div>
                              )}
                            </Droppable>
                          )}
                        </div>
                      )}
                    </Draggable>
                    </div>
                  );
                })}
                {sectionProvided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        {/* Add more classes — collapsed disclosure at the bottom of the card */}
        <AddClassesDisclosure showId={showId} />
      </CardContent>
    </Card>

    <AlertDialog open={!!pendingAction} onOpenChange={(open) => { if (!open) setPendingAction(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>{pendingAction?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => { pendingAction?.action(); setPendingAction(null); }}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

// ── Add Classes Disclosure (collapsed when show already has classes) ────

function AddClassesDisclosure({ showId }: { showId: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-4 border-t pt-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors',
          expanded
            ? 'bg-muted/50 text-foreground'
            : 'bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground'
        )}
      >
        <Plus className="size-4" />
        Add more classes
        <ChevronDown className={cn('ml-auto size-4 transition-transform duration-200', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="mt-3 space-y-6">
          <BulkClassCreator showId={showId} />
          <AddIndividualClass showId={showId} />
        </div>
      )}
    </div>
  );
}

// ── Bulk Class Creator ──────────────────────────────────────

function BulkClassCreator({ showId }: { showId: string }) {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedBreedIds, setSelectedBreedIds] = useState<string[]>([]);
  const [selectedClassDefIds, setSelectedClassDefIds] = useState<string[]>([]);
  const [splitBySex, setSplitBySex] = useState(false);
  const [feeInput, setFeeInput] = useState('');

  const { data: breeds } = trpc.breeds.list.useQuery();
  const { data: classDefs } = trpc.secretary.listClassDefinitions.useQuery();
  const utils = trpc.useUtils();

  const bulkMutation = trpc.secretary.bulkCreateClasses.useMutation({
    onSuccess: (data) => {
      toast.success(`Created ${data.created} classes`);
      utils.shows.getById.invalidate({ id: showId });
      setSelectedTemplate(null);
      setSelectedBreedIds([]);
      setSelectedClassDefIds([]);
    },
    onError: () => toast.error('Failed to create classes'),
  });

  const template = CLASS_TEMPLATES.find((t) => t.id === selectedTemplate);

  const matchedClassDefs = useMemo(() => {
    if (!template || !classDefs) return [];
    return classDefs.filter((cd) => template.classNames.includes(cd.name));
  }, [template, classDefs]);

  const breedsByGroup = useMemo(() => {
    const groups: Record<string, { id: string; name: string }[]> = {};
    for (const breed of breeds ?? []) {
      const groupName = breed.group?.name ?? 'Other';
      groups[groupName] ??= [];
      groups[groupName].push({ id: breed.id, name: breed.name });
    }
    return groups;
  }, [breeds]);

  const totalClasses = template?.isHandling
    ? selectedClassDefIds.length
    : selectedBreedIds.length *
      selectedClassDefIds.length *
      (splitBySex ? 2 : 1);

  function handleSelectTemplate(templateId: string) {
    const t = CLASS_TEMPLATES.find((t) => t.id === templateId);
    setSelectedTemplate(templateId);
    setSplitBySex(t?.splitBySex ?? false);
    setFeeInput(penceToPoundsString(t?.defaultFeePence ?? 500));
    if (t && classDefs) {
      const ids = classDefs
        .filter((cd) => t.classNames.includes(cd.name))
        .map((cd) => cd.id);
      setSelectedClassDefIds(ids);
    }
  }

  function handleCreate() {
    if (!template || selectedClassDefIds.length === 0) return;
    if (!template.isHandling && selectedBreedIds.length === 0) return;
    const parsedPounds = parseFloat(feeInput);
    const fee = Number.isNaN(parsedPounds) ? template.defaultFeePence : poundsToPence(parsedPounds);
    bulkMutation.mutate({
      showId,
      breedIds: template.isHandling ? [] : selectedBreedIds,
      classDefinitionIds: selectedClassDefIds,
      entryFee: fee,
      splitBySex: template.isHandling ? false : splitBySex,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Classes from Template</CardTitle>
        <CardDescription>
          Quickly add a standard set of classes for selected breeds.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {CLASS_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleSelectTemplate(t.id)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                selectedTemplate === t.id
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-muted/50'
              }`}
            >
              <p className="font-medium text-sm">{t.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t.description}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t.classNames.length} classes &middot;{' '}
                {formatCurrency(t.defaultFeePence)}/class
                {t.splitBySex ? ' &middot; Split by sex' : ''}
              </p>
            </button>
          ))}
        </div>

        {template && (
          <>
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Classes ({selectedClassDefIds.length} of {matchedClassDefs.length} selected)
                </Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setSelectedClassDefIds(matchedClassDefs.map((cd) => cd.id))
                    }
                  >
                    Select All
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedClassDefIds([])}
                  >
                    Clear
                  </Button>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1 rounded-lg border p-2">
                {matchedClassDefs.map((cd) => (
                  <label
                    key={cd.id}
                    className="flex items-center gap-2 text-sm cursor-pointer rounded px-1.5 py-1 hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={selectedClassDefIds.includes(cd.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedClassDefIds((prev) => [...prev, cd.id]);
                        } else {
                          setSelectedClassDefIds((prev) =>
                            prev.filter((id) => id !== cd.id)
                          );
                        }
                      }}
                    />
                    {cd.name}
                  </label>
                ))}
              </div>
            </div>

            {template.isHandling ? (
              <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 text-sm">
                {template.id === 'ykc_handling' ? (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Young Kennel Club</span> is the official RKC junior handling route. Handlers need YKC membership. Dogs can be on the Breed or Activity Register — crossbreeds welcome. Winners qualify for Crufts YKC Handling finals.
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Junior Handling Association</span> is an independent organisation with its own finals pathway. JHA membership required. The dog typically needs to enter another class at the show.
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Handling classes are not breed-specific and are not split by sex.
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    Breeds ({selectedBreedIds.length} selected)
                  </Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setSelectedBreedIds(
                          (breeds ?? []).map((b) => b.id)
                        )
                      }
                    >
                      Select All
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedBreedIds([])}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border p-2 space-y-3">
                  {Object.entries(breedsByGroup)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([groupName, groupBreeds]) => (
                      <div key={groupName}>
                        <div className="flex items-center gap-2 mb-1">
                          <button
                            type="button"
                            onClick={() => {
                              const groupIds = groupBreeds.map((b) => b.id);
                              const allSelected = groupIds.every((id) =>
                                selectedBreedIds.includes(id)
                              );
                              if (allSelected) {
                                setSelectedBreedIds((prev) =>
                                  prev.filter((id) => !groupIds.includes(id))
                                );
                              } else {
                                setSelectedBreedIds((prev) => [
                                  ...new Set([...prev, ...groupIds]),
                                ]);
                              }
                            }}
                            className="text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground"
                          >
                            {groupName}
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pl-2">
                          {groupBreeds.map((breed) => (
                            <label
                              key={breed.id}
                              className="flex items-center gap-2 text-sm cursor-pointer"
                            >
                              <Checkbox
                                checked={selectedBreedIds.includes(breed.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedBreedIds((prev) => [
                                      ...prev,
                                      breed.id,
                                    ]);
                                  } else {
                                    setSelectedBreedIds((prev) =>
                                      prev.filter((id) => id !== breed.id)
                                    );
                                  }
                                }}
                              />
                              {breed.name}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label className="text-sm font-medium">Entry Fee (&pound;)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="e.g. 5.00"
                  value={feeInput}
                  onChange={(e) => setFeeInput(e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-0.5">
                  {feeInput ? formatCurrency(poundsToPence(parseFloat(feeInput)) || 0) : '£0.00'}
                </p>
              </div>
              {!template.isHandling && (
                <div className="flex items-end gap-2 pb-6">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={splitBySex}
                      onCheckedChange={(v) => setSplitBySex(v === true)}
                    />
                    Split by sex (Dog / Bitch)
                  </label>
                </div>
              )}
              <div className="flex items-end pb-6">
                <p className="text-sm text-muted-foreground">
                  <span className="font-bold text-foreground">{totalClasses}</span>{' '}
                  classes will be created
                </p>
              </div>
            </div>

            <Button
              onClick={handleCreate}
              disabled={
                bulkMutation.isPending ||
                (!template.isHandling && selectedBreedIds.length === 0) ||
                selectedClassDefIds.length === 0
              }
            >
              {bulkMutation.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Create {totalClasses} Classes
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Add Individual Class ─────────────────────────────────────

function AddIndividualClass({ showId }: { showId: string }) {
  const [classDefId, setClassDefId] = useState<string>('');
  const [newClassName, setNewClassName] = useState('');
  const [breedId, setBreedId] = useState<string>('');
  const [sex, setSex] = useState<string>('combined');
  const [feeInput, setFeeInput] = useState('5.00');
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  const { data: classDefs } = trpc.secretary.listClassDefinitions.useQuery();
  const { data: breeds } = trpc.breeds.list.useQuery();
  const utils = trpc.useUtils();

  const createDefMutation = trpc.secretary.createClassDefinition.useMutation();
  const addClassMutation = trpc.secretary.addShowClass.useMutation({
    onSuccess: () => {
      toast.success('Class added');
      utils.shows.getById.invalidate({ id: showId });
      utils.secretary.listClassDefinitions.invalidate();
      setClassDefId('');
      setNewClassName('');
      setIsCreatingNew(false);
    },
    onError: (err) => toast.error(err.message),
  });

  async function handleAdd() {
    const pounds = parseFloat(feeInput);
    if (isNaN(pounds) || pounds <= 0) {
      toast.error('Enter a valid entry fee in pounds (e.g. 5.00)');
      return;
    }
    const fee = poundsToPence(pounds);

    let defId = classDefId;

    if (isCreatingNew) {
      if (!newClassName.trim()) {
        toast.error('Enter a class name');
        return;
      }
      const newDef = await createDefMutation.mutateAsync({
        name: newClassName.trim(),
      });
      defId = newDef.id;
    }

    if (!defId) {
      toast.error('Select or create a class');
      return;
    }

    addClassMutation.mutate({
      showId,
      classDefinitionId: defId,
      breedId: breedId && breedId !== 'any' ? breedId : undefined,
      sex: sex === 'combined' ? null : (sex as 'dog' | 'bitch'),
      entryFee: fee,
    });
  }

  const isPending = createDefMutation.isPending || addClassMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Individual Class</CardTitle>
        <CardDescription>
          Add a single class to this show. Pick an existing class type or create a custom one.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Class</Label>
          {!isCreatingNew ? (
            <div className="flex gap-2">
              <Select value={classDefId} onValueChange={setClassDefId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a class..." />
                </SelectTrigger>
                <SelectContent>
                  {classDefs?.map((cd) => (
                    <SelectItem key={cd.id} value={cd.id}>
                      {cd.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsCreatingNew(true);
                  setClassDefId('');
                }}
              >
                <Plus className="size-4" />
                New
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                placeholder="Custom class name..."
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsCreatingNew(false);
                  setNewClassName('');
                }}
              >
                <X className="size-4" />
                Cancel
              </Button>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label className="text-sm font-medium">Breed (optional)</Label>
            <Select value={breedId} onValueChange={setBreedId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Any breed" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any breed</SelectItem>
                {breeds?.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm font-medium">Sex</Label>
            <Select value={sex} onValueChange={setSex}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="combined">Combined (Dog &amp; Bitch)</SelectItem>
                <SelectItem value="dog">Dogs only</SelectItem>
                <SelectItem value="bitch">Bitches only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm font-medium">Entry Fee (&pound;)</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              placeholder="e.g. 5.00"
              value={feeInput}
              onChange={(e) => setFeeInput(e.target.value)}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-0.5">
              {feeInput ? formatCurrency(poundsToPence(parseFloat(feeInput)) || 0) : '£0.00'}
            </p>
          </div>
        </div>

        <Button
          onClick={handleAdd}
          disabled={isPending || (!classDefId && !newClassName.trim())}
        >
          {isPending && <Loader2 className="size-4 animate-spin" />}
          <Plus className="size-4" />
          Add Class
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Sundry Item Manager ────────────────────────────────────

const COMMON_SUNDRY_PRESETS = [
  { name: 'Printed Catalogue', description: 'Receive a printed show catalogue on the day', priceInPence: 500, maxPerOrder: 1 },
  { name: 'Online Catalogue', description: 'Access to the digital show catalogue', priceInPence: 300, maxPerOrder: 1 },
  { name: 'Donation', description: 'Support the club with a voluntary donation', priceInPence: 200 },
  { name: 'Club Membership — Sole', description: 'Annual single membership', priceInPence: 800, maxPerOrder: 1 },
  { name: 'Club Membership — Joint', description: 'Annual joint membership', priceInPence: 1200, maxPerOrder: 1 },
  { name: 'Club Membership — Family', description: 'Annual family membership', priceInPence: 1500, maxPerOrder: 1 },
];

function SundryItemManager({ showId }: { showId: string }) {
  const { data: items, isLoading } = trpc.secretary.getSundryItems.useQuery({ showId });
  const utils = trpc.useUtils();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editItem, setEditItem] = useState<{
    id: string;
    name: string;
    description: string | null;
    priceInPence: number;
    maxPerOrder: number | null;
    enabled: boolean;
  } | null>(null);
  const [pendingAction, setPendingAction] = useState<{ message: string; action: () => void } | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formMaxPerOrder, setFormMaxPerOrder] = useState('');

  function resetForm() {
    setFormName('');
    setFormDescription('');
    setFormPrice('');
    setFormMaxPerOrder('');
  }

  const createMutation = trpc.secretary.createSundryItem.useMutation({
    onSuccess: () => {
      toast.success('Sundry item added');
      utils.secretary.getSundryItems.invalidate({ showId });
      setShowAddDialog(false);
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.secretary.updateSundryItem.useMutation({
    onSuccess: () => {
      toast.success('Sundry item updated');
      utils.secretary.getSundryItems.invalidate({ showId });
      setEditItem(null);
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.secretary.deleteSundryItem.useMutation({
    onSuccess: (data) => {
      toast.success(data.softDeleted ? 'Item disabled (existing orders reference it)' : 'Item deleted');
      utils.secretary.getSundryItems.invalidate({ showId });
    },
    onError: (err) => toast.error(err.message),
  });

  const bulkCreateMutation = trpc.secretary.bulkCreateSundryItems.useMutation({
    onSuccess: (data) => {
      toast.success(`Added ${data.created} common items`);
      utils.secretary.getSundryItems.invalidate({ showId });
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleMutation = trpc.secretary.updateSundryItem.useMutation({
    onSuccess: () => {
      utils.secretary.getSundryItems.invalidate({ showId });
    },
    onError: (err) => toast.error(err.message),
  });

  function handleAdd() {
    const priceInPence = poundsToPence(parseFloat(formPrice) || 0);
    createMutation.mutate({
      showId,
      name: formName,
      description: formDescription || undefined,
      priceInPence,
      maxPerOrder: formMaxPerOrder ? parseInt(formMaxPerOrder) : undefined,
    });
  }

  function handleUpdate() {
    if (!editItem) return;
    const priceInPence = poundsToPence(parseFloat(formPrice) || 0);
    updateMutation.mutate({
      id: editItem.id,
      showId,
      name: formName,
      description: formDescription || null,
      priceInPence,
      maxPerOrder: formMaxPerOrder ? parseInt(formMaxPerOrder) : null,
    });
  }

  function openEditDialog(item: NonNullable<typeof editItem>) {
    setEditItem(item);
    setFormName(item.name);
    setFormDescription(item.description ?? '');
    setFormPrice(penceToPoundsString(item.priceInPence));
    setFormMaxPerOrder(item.maxPerOrder?.toString() ?? '');
  }

  function handleAddCommon() {
    // Filter out items that already exist (by name)
    const existingNames = new Set((items ?? []).map((i) => i.name));
    const newItems = COMMON_SUNDRY_PRESETS.filter((p) => !existingNames.has(p.name));
    if (newItems.length === 0) {
      toast.info('All common items already added');
      return;
    }
    bulkCreateMutation.mutate({ showId, items: newItems });
  }

  const enabledItems = (items ?? []).filter((i) => i.enabled);
  const disabledItems = (items ?? []).filter((i) => !i.enabled);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Sundry Items</CardTitle>
              <CardDescription>
                Add-on items exhibitors can purchase at checkout — catalogues, memberships, donations, etc.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
              <Button
                variant="outline"
                size="sm"
                className="min-h-[2.75rem]"
                onClick={handleAddCommon}
                disabled={bulkCreateMutation.isPending}
              >
                {bulkCreateMutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
                Add Common Items
              </Button>
              <Button
                size="sm"
                className="min-h-[2.75rem]"
                onClick={() => {
                  resetForm();
                  setShowAddDialog(true);
                }}
              >
                <Plus className="size-3.5" />
                Add Item
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (items ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No sundry items configured yet. Add items that exhibitors can purchase alongside their entries.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Mobile view */}
              <div className="space-y-2 sm:hidden">
                {enabledItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(item.priceInPence)}
                        {item.maxPerOrder === 1 ? ' · max 1' : item.maxPerOrder ? ` · max ${item.maxPerOrder}` : ''}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" className="min-h-[2.75rem] px-2.5" onClick={() => openEditDialog(item)}>
                        <Edit3 className="size-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-[2.75rem] px-2.5 text-destructive hover:bg-destructive/10"
                        onClick={() => setPendingAction({
                          message: 'Delete this sundry item?',
                          action: () => deleteMutation.mutate({ id: item.id, showId }),
                        })}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop view */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Limit</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enabledItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{item.name}</p>
                            {item.description && (
                              <p className="text-xs text-muted-foreground">{item.description}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{formatCurrency(item.priceInPence)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.maxPerOrder === 1 ? 'One per order' : item.maxPerOrder ? `Max ${item.maxPerOrder}` : 'Unlimited'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="default">Active</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => openEditDialog(item)}>
                              <Edit3 className="size-3.5" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 text-destructive hover:bg-destructive/10"
                              onClick={() => deleteMutation.mutate({ id: item.id, showId })}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {disabledItems.map((item) => (
                      <TableRow key={item.id} className="opacity-50">
                        <TableCell>
                          <div>
                            <p className="font-medium">{item.name}</p>
                          </div>
                        </TableCell>
                        <TableCell>{formatCurrency(item.priceInPence)}</TableCell>
                        <TableCell />
                        <TableCell>
                          <Badge variant="outline">Disabled</Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              toggleMutation.mutate({ id: item.id, showId, enabled: true })
                            }
                          >
                            Re-enable
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Sundry Item</DialogTitle>
            <DialogDescription>
              Create a new add-on item that exhibitors can purchase at checkout.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="sundry-name">Item Name</Label>
              <Input
                id="sundry-name"
                placeholder="e.g. Printed Catalogue"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sundry-desc">Description (optional)</Label>
              <Input
                id="sundry-desc"
                placeholder="Shown to exhibitors at checkout"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sundry-price">Price (GBP)</Label>
                <Input
                  id="sundry-price"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="5.00"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sundry-max">Max per Order</Label>
                <Input
                  id="sundry-max"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  placeholder="Leave empty for unlimited"
                  value={formMaxPerOrder}
                  onChange={(e) => setFormMaxPerOrder(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button
              onClick={handleAdd}
              disabled={!formName || !formPrice || createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Add Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Sundry Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-sundry-name">Item Name</Label>
              <Input
                id="edit-sundry-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-sundry-desc">Description</Label>
              <Input
                id="edit-sundry-desc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-sundry-price">Price (GBP)</Label>
                <Input
                  id="edit-sundry-price"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-sundry-max">Max per Order</Label>
                <Input
                  id="edit-sundry-max"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  placeholder="Empty = unlimited"
                  value={formMaxPerOrder}
                  onChange={(e) => setFormMaxPerOrder(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button
              onClick={handleUpdate}
              disabled={!formName || !formPrice || updateMutation.isPending}
            >
              {updateMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingAction} onOpenChange={(open) => { if (!open) setPendingAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>{pendingAction?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { pendingAction?.action(); setPendingAction(null); }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

// ── Readiness Card ──────────────────────────────────────────

function ReadinessCard({ showId }: { showId: string }) {
  const { data: items } = trpc.secretary.getChecklist.useQuery({ showId });
  const { data: autoDetect } = trpc.secretary.getChecklistAutoDetect.useQuery({ showId });

  if (!items || items.length === 0) return null;

  const enriched = items.map((item) => {
    const isAuto = item.autoDetectKey && autoDetect?.[item.autoDetectKey] === true;
    return {
      ...item,
      effectiveStatus: isAuto ? 'complete' : item.status,
    };
  });

  const total = enriched.length;
  const done = enriched.filter(
    (i) => i.effectiveStatus === 'complete' || i.effectiveStatus === 'not_applicable'
  ).length;
  const overdueItems = enriched.filter((i) => {
    if (i.effectiveStatus === 'complete' || i.effectiveStatus === 'not_applicable') return false;
    if (!i.dueDate) return false;
    return new Date(i.dueDate) < new Date();
  });
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardDescription className="text-sm font-medium">Show Readiness</CardDescription>
        <ListChecks className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold">{pct}%</span>
          <span className="text-xs text-muted-foreground">
            {done}/{total} items
          </span>
        </div>
        <Progress value={pct} className="h-2" />
        {overdueItems.length > 0 && (
          <p className="text-xs text-destructive flex items-center gap-1 mt-1">
            <AlertTriangle className="size-3" />
            {overdueItems.length} overdue item{overdueItems.length !== 1 ? 's' : ''}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
