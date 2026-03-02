'use client';

import { use, useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Edit3,
  FileText,
  Hash,
  Loader2,
  ListChecks,
  AlertTriangle,
  MapPin,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { formatCurrency, penceToPoundsString, poundsToPence } from '@/lib/date-utils';
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
import { formatDate } from './_lib/show-utils';

export default function OverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: showId } = use(params);

  const { data: show } = trpc.shows.getById.useQuery({ id: showId });

  if (!show) return null;

  return (
    <div className="space-y-6">
      {/* Show Readiness */}
      <ReadinessCard showId={showId} />

      {/* Show details */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Show Details</CardTitle>
          <EditShowDetailsDialog show={show} showId={showId} />
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-start gap-3">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <dt className="text-sm text-muted-foreground">Dates</dt>
                <dd className="font-medium">
                  {formatDate(show.startDate)}
                  {show.startDate !== show.endDate &&
                    ` — ${formatDate(show.endDate)}`}
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <dt className="text-sm text-muted-foreground">Venue</dt>
                <dd className="font-medium">
                  {show.venue?.name ?? 'No venue set'}
                  {show.venue?.postcode && (
                    <span className="text-muted-foreground">
                      {' '}
                      — {show.venue.postcode}
                    </span>
                  )}
                </dd>
              </div>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Show Type</dt>
              <dd className="font-medium capitalize">
                {show.showType.replace('_', ' ')}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Show Scope</dt>
              <dd className="font-medium capitalize">
                {show.showScope.replace('_', ' ')}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">
                Entry Close Date
              </dt>
              <dd className="font-medium">
                {formatDate(show.entryCloseDate)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">
                Postal Close Date
              </dt>
              <dd className="font-medium">
                {formatDate(show.postalCloseDate)}
              </dd>
            </div>
            {show.description && (
              <div className="sm:col-span-2">
                <dt className="text-sm text-muted-foreground">
                  Description
                </dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm">
                  {show.description}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Schedule upload */}
      <ScheduleUpload showId={showId} currentUrl={show.scheduleUrl} />

      {/* Class management */}
      <ClassManager showId={showId} classes={show.showClasses ?? []} />

      {/* Bulk class creation */}
      <BulkClassCreator showId={showId} />

      {/* Add individual class */}
      <AddIndividualClass showId={showId} />

      {/* Sundry items management */}
      <SundryItemManager showId={showId} />

      {/* Delete show (draft only) */}
      {show.status === 'draft' && (
        <DeleteShowSection showId={showId} showName={show.name} />
      )}
    </div>
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
    startDate: string;
    endDate: string;
    entryCloseDate: Date | string | null;
    postalCloseDate: Date | string | null;
    kcLicenceNo: string | null;
    description: string | null;
  };
  showId: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(show.name);
  const [showType, setShowType] = useState(show.showType);
  const [showScope, setShowScope] = useState(show.showScope);
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
    updateMutation.mutate({
      id: showId,
      name,
      showType: showType as 'companion' | 'primary' | 'limited' | 'open' | 'premier_open' | 'championship',
      showScope: showScope as 'single_breed' | 'group' | 'general',
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
    });
  }

  // Sync state when show data changes (e.g. after save)
  useEffect(() => {
    if (!open) {
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
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, show.name, show.showType, show.startDate]);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
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
                <Label htmlFor="edit-start">Start Date</Label>
                <Input
                  id="edit-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
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
                  onChange={(e) => setEntryCloseDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-postal-close">Postal Close Date</Label>
                <Input
                  id="edit-postal-close"
                  type="datetime-local"
                  value={postalCloseDate}
                  onChange={(e) => setPostalCloseDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-kc">KC Licence Number</Label>
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

// ── Schedule Upload ──────────────────────────────────────────

function ScheduleUpload({
  showId,
  currentUrl,
}: {
  showId: string;
  currentUrl: string | null | undefined;
}) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const updateUrl = trpc.secretary.updateScheduleUrl.useMutation({
    onSuccess: () => {
      toast.success('Schedule uploaded');
      utils.shows.getById.invalidate({ id: showId });
    },
    onError: () => toast.error('Failed to save schedule URL'),
  });

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const text = await res.text();
          let message = 'Upload failed';
          try {
            const err = JSON.parse(text);
            message = err.error ?? message;
          } catch {
            message = text || message;
          }
          throw new Error(message);
        }

        const { publicUrl } = await res.json();
        await updateUrl.mutateAsync({ showId, scheduleUrl: publicUrl });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [showId, updateUrl]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-5" />
          Show Schedule
        </CardTitle>
        <CardDescription>
          Upload a schedule (PDF or image) for exhibitors to download
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {currentUrl && (
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
            <FileText className="size-4 text-primary" />
            <a
              href={currentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 truncate text-sm text-primary hover:underline"
            >
              Current schedule
            </a>
            <Badge variant="secondary" className="text-[10px]">
              Uploaded
            </Badge>
          </div>
        )}
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
            }}
          />
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            {uploading
              ? 'Uploading...'
              : currentUrl
                ? 'Replace Schedule'
                : 'Upload Schedule PDF'}
          </Button>
          <p className="text-xs text-muted-foreground">PDF, max 10MB</p>
        </div>
      </CardContent>
    </Card>
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
    breed?: { name: string } | null;
  }[];
}

function ClassManager({ showId, classes }: ClassManagerProps) {
  const [editingFees, setEditingFees] = useState<Record<string, string>>({});
  const [editingNumbers, setEditingNumbers] = useState<Record<string, string>>({});
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

  const autoAssignMutation = trpc.secretary.autoAssignClassNumbers.useMutation({
    onSuccess: (data) => {
      utils.shows.getById.invalidate({ id: showId });
      toast.success(`${data.assigned} class numbers assigned`);
    },
    onError: () => toast.error('Failed to auto-assign class numbers'),
  });

  const reorderMutation = trpc.secretary.reorderClasses.useMutation({
    onSuccess: () => {
      utils.shows.getById.invalidate({ id: showId });
    },
    onError: () => toast.error('Failed to reorder classes'),
  });

  function swapClass(classId: string, direction: 'up' | 'down') {
    const sorted = [...classes].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((c) => c.id === classId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    [sorted[idx], sorted[swapIdx]] = [sorted[swapIdx], sorted[idx]];
    reorderMutation.mutate({ showId, classIds: sorted.map((c) => c.id) });
  }

  function startEditNumber(classId: string, current: number | null | undefined) {
    setEditingNumbers((prev) => ({
      ...prev,
      [classId]: current?.toString() ?? '',
    }));
  }

  function saveNumber(classId: string) {
    const val = editingNumbers[classId];
    if (val === undefined) return;
    const num = val === '' ? null : parseInt(val);
    if (num !== null && (isNaN(num) || num < 1)) {
      toast.error('Enter a valid class number (1 or higher)');
      return;
    }
    updateMutation.mutate({ showClassId: classId, classNumber: num });
    setEditingNumbers((prev) => {
      const next = { ...prev };
      delete next[classId];
      return next;
    });
  }

  function cancelEditNumber(classId: string) {
    setEditingNumbers((prev) => {
      const next = { ...prev };
      delete next[classId];
      return next;
    });
  }

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

  // Group by type for nicer display
  const grouped: Record<string, typeof classes> = {};
  for (const sc of classes) {
    const type = sc.classDefinition?.type ?? 'other';
    grouped[type] ??= [];
    grouped[type]!.push(sc);
  }

  const typeLabels: Record<string, string> = {
    age: 'Age Classes',
    achievement: 'Achievement Classes',
    special: 'Special Classes',
    junior_handler: 'Junior Handler Classes',
    other: 'Other',
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Classes ({classes.length})</CardTitle>
            <CardDescription>Click a fee or class number to edit. Remove classes that don&apos;t apply to this show.</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
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
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(grouped).map(([type, typeClasses]) => (
          <div key={type}>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {typeLabels[type] ?? type}
            </h4>
            {/* Mobile card view */}
            <div className="space-y-2 sm:hidden">
              {typeClasses.map((sc) => (
                <div key={sc.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground">
                        #{sc.classNumber ?? '—'}
                      </span>
                      <span className="text-sm font-medium truncate">
                        {sc.classDefinition?.name ?? 'Unknown'}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      {sc.sex ? (
                        <Badge variant="outline" className="text-[10px]">
                          {sc.sex === 'dog' ? 'Dog' : 'Bitch'}
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Any sex</span>
                      )}
                      {sc.breed && (
                        <span className="text-[10px] text-muted-foreground truncate">{sc.breed.name}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <div className="flex flex-col">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={() => swapClass(sc.id, 'up')}
                        disabled={reorderMutation.isPending}
                      >
                        <ArrowUp className="size-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={() => swapClass(sc.id, 'down')}
                        disabled={reorderMutation.isPending}
                      >
                        <ArrowDown className="size-3" />
                      </Button>
                    </div>
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
                      className="size-9 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm('Remove this class from the show?')) {
                          deleteMutation.mutate({ showClassId: sc.id });
                        }
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">Order</TableHead>
                    <TableHead className="w-[70px]">#</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead className="w-[100px]">Sex</TableHead>
                    <TableHead className="w-[120px]">Fee</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {typeClasses.map((sc) => {
                    const isEditing = editingFees[sc.id] !== undefined;
                    const isEditingNum = editingNumbers[sc.id] !== undefined;
                    return (
                      <TableRow key={sc.id}>
                        <TableCell className="p-1">
                          <div className="flex items-center gap-0.5">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-6"
                              onClick={() => swapClass(sc.id, 'up')}
                              disabled={reorderMutation.isPending}
                            >
                              <ArrowUp className="size-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-6"
                              onClick={() => swapClass(sc.id, 'down')}
                              disabled={reorderMutation.isPending}
                            >
                              <ArrowDown className="size-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          {isEditingNum ? (
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                min={1}
                                value={editingNumbers[sc.id]}
                                onChange={(e) =>
                                  setEditingNumbers((prev) => ({
                                    ...prev,
                                    [sc.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveNumber(sc.id);
                                  if (e.key === 'Escape') cancelEditNumber(sc.id);
                                }}
                                className="h-7 w-14 text-xs"
                                autoFocus
                              />
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditNumber(sc.id, sc.classNumber)}
                              className="rounded px-1.5 py-0.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted"
                              title="Click to edit class number"
                            >
                              {sc.classNumber ?? '—'}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {sc.classDefinition?.name ?? 'Unknown'}
                          {sc.breed && (
                            <span className="ml-1 text-muted-foreground">
                              ({sc.breed.name})
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {sc.sex ? (
                            <Badge variant="outline" className="text-xs">
                              {sc.sex === 'dog' ? 'Dog' : 'Bitch'}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Any</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                min={0}
                                value={editingFees[sc.id]}
                                onChange={(e) =>
                                  setEditingFees((prev) => ({
                                    ...prev,
                                    [sc.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveFee(sc.id);
                                  if (e.key === 'Escape') cancelEditFee(sc.id);
                                }}
                                className="h-7 w-20 text-xs"
                                autoFocus
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                onClick={() => saveFee(sc.id)}
                                disabled={updateMutation.isPending}
                              >
                                {updateMutation.isPending ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <span className="text-xs">OK</span>
                                )}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                onClick={() => cancelEditFee(sc.id)}
                              >
                                <X className="size-3" />
                              </Button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditFee(sc.id, sc.entryFee)}
                              className="rounded px-1.5 py-0.5 text-sm font-semibold transition-colors hover:bg-muted"
                              title="Click to edit fee"
                            >
                              {formatCurrency(sc.entryFee)}
                            </button>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm('Remove this class from the show?')) {
                                deleteMutation.mutate({ showClassId: sc.id });
                              }
                            }}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
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

  const totalClasses =
    selectedBreedIds.length *
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
    if (!template || selectedBreedIds.length === 0 || selectedClassDefIds.length === 0) return;
    const fee = poundsToPence(parseFloat(feeInput || '0')) || template.defaultFeePence;
    bulkMutation.mutate({
      showId,
      breedIds: selectedBreedIds,
      classDefinitionIds: selectedClassDefIds,
      entryFee: fee,
      splitBySex,
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
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1 rounded-lg border p-2">
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
                      <div className="grid grid-cols-2 gap-1 pl-2">
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
              <div className="flex items-end gap-2 pb-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={splitBySex}
                    onCheckedChange={(v) => setSplitBySex(v === true)}
                  />
                  Split by sex (Dog / Bitch)
                </label>
              </div>
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
                selectedBreedIds.length === 0 ||
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
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Sundry Items</CardTitle>
              <CardDescription>
                Add-on items exhibitors can purchase at checkout — catalogues, memberships, donations, etc.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddCommon}
                disabled={bulkCreateMutation.isPending}
              >
                {bulkCreateMutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
                Add Common Items
              </Button>
              <Button
                size="sm"
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
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => openEditDialog(item)}>
                        <Edit3 className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive"
                        onClick={() => deleteMutation.mutate({ id: item.id, showId })}
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
                      <TableHead className="w-20" />
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
                            <Button variant="ghost" size="icon" className="size-8" onClick={() => openEditDialog(item)}>
                              <Edit3 className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-destructive"
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
            <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-2 gap-4">
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
    </>
  );
}

// ── Delete Show ─────────────────────────────────────────────

function DeleteShowSection({ showId, showName }: { showId: string; showName: string }) {
  const deleteMutation = trpc.secretary.deleteShow.useMutation({
    onSuccess: () => {
      toast.success('Show deleted');
      window.location.href = '/secretary';
    },
    onError: (err) => toast.error(err.message),
  });

  function handleDelete() {
    if (
      confirm(
        `Are you sure you want to delete "${showName}"?\n\nThis will permanently delete the show and all its classes. This cannot be undone.`
      )
    ) {
      deleteMutation.mutate({ showId });
    }
  }

  return (
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
          onClick={handleDelete}
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
      <CardHeader className="flex-row items-center justify-between pb-2">
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
