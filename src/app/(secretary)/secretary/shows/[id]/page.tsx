'use client';

import { use, useState, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CircleDot,
  Clock,
  Download,
  Edit3,
  FileText,
  Gavel,
  Hash,
  Loader2,
  MapPin,
  Plus,
  PoundSterling,
  RotateCcw,
  Search,
  Ticket,
  Trash2,
  Upload,
  Users,
  X,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { formatDogName } from '@/lib/utils';
import { formatCurrency } from '@/lib/date-utils';
import { CLASS_TEMPLATES } from '@/lib/class-templates';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

const statusConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  draft: { label: 'Draft', variant: 'secondary' },
  published: { label: 'Published', variant: 'outline' },
  entries_open: { label: 'Entries Open', variant: 'default' },
  entries_closed: { label: 'Entries Closed', variant: 'secondary' },
  in_progress: { label: 'In Progress', variant: 'default' },
  completed: { label: 'Completed', variant: 'secondary' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};

const entryStatusConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  pending: { label: 'Pending', variant: 'outline' },
  confirmed: { label: 'Confirmed', variant: 'default' },
  withdrawn: { label: 'Withdrawn', variant: 'secondary' },
  transferred: { label: 'Transferred', variant: 'secondary' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};

function formatDate(dateStr: string | Date | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function daysUntil(dateStr: string) {
  const target = new Date(dateStr);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function ManageShowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const { data: show, isLoading: showLoading } = trpc.shows.getById.useQuery({
    id,
  });
  const { data: stats } = trpc.secretary.getShowStats.useQuery({ showId: id });
  const { data: entriesData, isLoading: entriesLoading } =
    trpc.entries.getForShow.useQuery({ showId: id, limit: 100 });

  const updateMutation = trpc.shows.update.useMutation();
  const utils = trpc.useUtils();

  if (showLoading) {
    return (
      <div className="space-y-6 pb-16 md:pb-0">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!show) {
    return (
      <div className="space-y-6 pb-16 md:pb-0">
        <p className="text-muted-foreground">Show not found.</p>
        <Button variant="outline" asChild>
          <Link href="/secretary">
            <ArrowLeft className="size-4" />
            Back to Dashboard
          </Link>
        </Button>
      </div>
    );
  }

  const showStatus = statusConfig[show.status] ?? {
    label: show.status,
    variant: 'outline' as const,
  };

  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  const riskyTransitions: Record<string, string> = {
    cancelled: 'This will mark the show as cancelled. Exhibitors will no longer be able to view or manage their entries.',
    entries_open: 'This will open entries to the public. Make sure all classes and pricing are set up correctly before proceeding.',
    completed: 'This will mark the show as completed. This should only be done after the event has finished.',
  };

  async function applyStatusChange(newStatus: string) {
    try {
      await updateMutation.mutateAsync({
        id,
        status: newStatus as 'draft' | 'published' | 'entries_open' | 'entries_closed' | 'in_progress' | 'completed' | 'cancelled',
      });
      await utils.shows.getById.invalidate({ id });
      toast.success(`Show status updated to ${statusConfig[newStatus]?.label ?? newStatus}`);
    } catch {
      toast.error('Failed to update show status');
    }
    setPendingStatus(null);
  }

  function handleStatusChange(newStatus: string) {
    if (newStatus === show.status) return;
    if (riskyTransitions[newStatus]) {
      setPendingStatus(newStatus);
    } else {
      applyStatusChange(newStatus);
    }
  }

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="-ml-2">
              <Link href="/secretary">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <h1 className="truncate text-lg font-bold tracking-tight sm:text-2xl">{show.name}</h1>
            <Badge variant={showStatus.variant} className="shrink-0">{showStatus.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {show.organisation?.name}
            {show.venue && ` — ${show.venue.name}`}
          </p>
        </div>
        <Select onValueChange={handleStatusChange} value={show.status}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Change status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="entries_open">Entries Open</SelectItem>
            <SelectItem value="entries_closed">Entries Closed</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Status change confirmation dialog */}
      <Dialog open={!!pendingStatus} onOpenChange={(open) => !open && setPendingStatus(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Change status to {statusConfig[pendingStatus ?? '']?.label ?? pendingStatus}?
            </DialogTitle>
            <DialogDescription>
              {riskyTransitions[pendingStatus ?? '']}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPendingStatus(null)}>
              Cancel
            </Button>
            <Button
              variant={pendingStatus === 'cancelled' ? 'destructive' : 'default'}
              onClick={() => pendingStatus && applyStatusChange(pendingStatus)}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
          <TabsTrigger value="entries" className="text-xs sm:text-sm">Entries</TabsTrigger>
          <TabsTrigger value="financial" className="text-xs sm:text-sm">Financial</TabsTrigger>
          <TabsTrigger value="catalogue" className="text-xs sm:text-sm">Catalogue</TabsTrigger>
          <TabsTrigger value="reports" className="text-xs sm:text-sm">Reports</TabsTrigger>
          <TabsTrigger value="judges" className="text-xs sm:text-sm">Judges</TabsTrigger>
          <TabsTrigger value="rings" className="text-xs sm:text-sm">Rings</TabsTrigger>
          <TabsTrigger value="stewards" className="text-xs sm:text-sm">Stewards</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between pb-2">
                <CardDescription className="text-sm font-medium">
                  Entries
                </CardDescription>
                <Ticket className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {stats?.totalEntries ?? 0}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between pb-2">
                <CardDescription className="text-sm font-medium">
                  Confirmed
                </CardDescription>
                <Users className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {stats?.confirmedEntries ?? 0}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between pb-2">
                <CardDescription className="text-sm font-medium">
                  Revenue
                </CardDescription>
                <PoundSterling className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {formatCurrency(stats?.totalRevenue ?? 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between pb-2">
                <CardDescription className="text-sm font-medium">
                  Days Until Show
                </CardDescription>
                <Clock className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {daysUntil(show.startDate) > 0
                    ? daysUntil(show.startDate)
                    : 'Past'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Show details */}
          <Card>
            <CardHeader>
              <CardTitle>Show Details</CardTitle>
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
          <ScheduleUpload showId={id} currentUrl={show.scheduleUrl} />

          {/* Class management */}
          <ClassManager showId={id} classes={show.showClasses ?? []} />

          {/* Bulk class creation */}
          <BulkClassCreator showId={id} />

          {/* Add individual class */}
          <AddIndividualClass showId={id} />

          {/* Delete show (draft only) */}
          {show.status === 'draft' && (
            <DeleteShowSection showId={id} showName={show.name} />
          )}
        </TabsContent>

        {/* Entries Tab */}
        <TabsContent value="entries">
          <EntriesTab
            entries={entriesData?.items ?? []}
            total={entriesData?.total ?? 0}
            isLoading={entriesLoading}
            showId={id}
          />
        </TabsContent>

        {/* Financial Tab */}
        <TabsContent value="financial" className="space-y-6">
          <FinancialTab
            showId={id}
            stats={stats}
            entries={entriesData?.items ?? []}
          />
        </TabsContent>

        {/* Catalogue Tab */}
        <TabsContent value="catalogue" className="space-y-6">
          <CatalogueTab showId={id} />
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports" className="space-y-6">
          <ReportsTab showId={id} />
        </TabsContent>

        {/* Judges Tab */}
        <TabsContent value="judges" className="space-y-6">
          <JudgesTab showId={id} />
        </TabsContent>

        {/* Rings Tab */}
        <TabsContent value="rings" className="space-y-6">
          <RingsTab showId={id} />
        </TabsContent>

        {/* Stewards Tab */}
        <TabsContent value="stewards" className="space-y-6">
          <StewardsTab showId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

import type { RouterOutputs } from '@/server/trpc/router';
type EntryItem = RouterOutputs['entries']['getForShow']['items'][number];

function EntriesTab({
  entries,
  total,
  isLoading,
  showId,
}: {
  entries: EntryItem[];
  total: number;
  isLoading: boolean;
  showId: string;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingEntry, setEditingEntry] = useState<EntryItem | null>(null);
  const [showAddEntry, setShowAddEntry] = useState(false);

  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      const matchesSearch =
        !search ||
        entry.dog?.registeredName.toLowerCase().includes(search.toLowerCase()) ||
        entry.exhibitor?.name.toLowerCase().includes(search.toLowerCase()) ||
        entry.dog?.breed?.name.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === 'all' || entry.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [entries, search, statusFilter]);

  function exportCsv() {
    const headers = [
      'Exhibitor',
      'Email',
      'Dog',
      'Breed',
      'Classes',
      'Fee',
      'Status',
      'NFC',
      'Date',
    ];
    const rows = filtered.map((e) => [
      e.exhibitor?.name ?? '',
      e.exhibitor?.email ?? '',
      e.dog?.registeredName ?? '',
      e.dog?.breed?.name ?? '',
      e.entryClasses
        .map((ec) => ec.showClass?.classDefinition?.name ?? '')
        .filter(Boolean)
        .join('; '),
      (e.totalFee / 100).toFixed(2),
      e.status,
      e.isNfc ? 'Yes' : 'No',
      formatDate(e.createdAt),
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      )
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `entries-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Entries exported to CSV');
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div>
            <CardTitle className="text-base sm:text-lg">Entries ({total})</CardTitle>
            <CardDescription>
              All entries for this show
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="min-h-[2.75rem] sm:min-h-0" onClick={() => setShowAddEntry(true)}>
              <Plus className="size-4" />
              Add Entry
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="min-h-[2.75rem] sm:min-h-0"
              onClick={exportCsv}
              disabled={filtered.length === 0}
            >
              <Download className="size-4" />
              Export CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search exhibitor, dog, or breed..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="withdrawn">Withdrawn</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">Loading entries...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Ticket className="size-6 text-primary" />
            </div>
            <h3 className="font-semibold">No entries found</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {search || statusFilter !== 'all'
                ? 'Try adjusting your search or filter.'
                : 'No one has entered this show yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-3 px-3 sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Exhibitor</TableHead>
                <TableHead>Dog</TableHead>
                <TableHead className="hidden sm:table-cell">Breed</TableHead>
                <TableHead>Classes</TableHead>
                <TableHead>Fee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((entry) => {
                const es = entryStatusConfig[entry.status] ?? {
                  label: entry.status,
                  variant: 'outline' as const,
                };
                return (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {entry.exhibitor?.name ?? '—'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {entry.exhibitor?.email ?? ''}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {entry.dog?.registeredName ?? '—'}
                      {entry.isNfc && (
                        <Badge variant="outline" className="ml-1.5 text-[10px]">
                          NFC
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{entry.dog?.breed?.name ?? '—'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {entry.entryClasses.map((ec, i) => (
                          <Badge
                            key={i}
                            variant="secondary"
                            className="text-[10px]"
                          >
                            {ec.showClass?.classDefinition?.name ?? '?'}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{formatCurrency(entry.totalFee)}</TableCell>
                    <TableCell>
                      <Badge variant={es.variant}>{es.label}</Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {formatDate(entry.createdAt)}
                    </TableCell>
                    <TableCell>
                      {entry.dog && (
                        <button
                          onClick={() => setEditingEntry(entry)}
                          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Edit dog details"
                        >
                          <Edit3 className="size-4" />
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        )}
      </CardContent>

      {editingEntry && (
        <EditDogDialog
          entry={editingEntry}
          showId={showId}
          onClose={() => setEditingEntry(null)}
        />
      )}

      {showAddEntry && (
        <AddEntryDialog
          showId={showId}
          onClose={() => setShowAddEntry(false)}
        />
      )}
    </Card>
  );
}

// ── Add Entry Dialog (Secretary-Initiated) ───────────────────

function AddEntryDialog({
  showId,
  onClose,
}: {
  showId: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'search' | 'register' | 'classes'>('search');
  const [dogSearch, setDogSearch] = useState('');
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);
  const [selectedDogName, setSelectedDogName] = useState('');
  const [exhibitorEmail, setExhibitorEmail] = useState('');
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<string>('postal');
  const [isNfc, setIsNfc] = useState(false);

  // Register dog form
  const [regName, setRegName] = useState('');
  const [regKc, setRegKc] = useState('');
  const [regBreed, setRegBreed] = useState('');
  const [regSex, setRegSex] = useState<string>('');
  const [regDob, setRegDob] = useState('');
  const [regSire, setRegSire] = useState('');
  const [regDam, setRegDam] = useState('');
  const [regOwnerName, setRegOwnerName] = useState('');
  const [regOwnerAddress, setRegOwnerAddress] = useState('');

  const utils = trpc.useUtils();

  // Search dogs
  const { data: dogResults, isLoading: searchLoading } =
    trpc.secretary.searchDogs.useQuery(
      { query: dogSearch, limit: 10 },
      { enabled: dogSearch.length >= 2 }
    );

  // Get show classes for the class selection
  const { data: classesData } = trpc.shows.getClasses.useQuery(
    { showId },
    { enabled: step === 'classes' }
  );

  // Get breeds for registration
  const { data: allBreeds } = trpc.breeds.list.useQuery(undefined, {
    enabled: step === 'register',
  });

  const registerDogMutation = trpc.secretary.registerDogForExhibitor.useMutation({
    onSuccess: (dog) => {
      toast.success(`Dog "${dog.registeredName}" registered`);
      setSelectedDogId(dog.id);
      setSelectedDogName(dog.registeredName);
      setStep('classes');
      utils.secretary.searchDogs.invalidate();
    },
    onError: (err) => toast.error(err.message ?? 'Failed to register dog'),
  });

  const createEntryMutation = trpc.secretary.createManualEntry.useMutation({
    onSuccess: () => {
      toast.success('Entry created successfully');
      utils.entries.getForShow.invalidate({ showId });
      utils.secretary.getShowStats.invalidate({ showId });
      onClose();
    },
    onError: (err) => toast.error(err.message ?? 'Failed to create entry'),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 'search' && 'Search for a Dog'}
            {step === 'register' && 'Register New Dog'}
            {step === 'classes' && `Select Classes — ${selectedDogName}`}
          </DialogTitle>
          <DialogDescription>
            {step === 'search' &&
              'Search by registered name to find a dog in the database, or register a new one.'}
            {step === 'register' &&
              'Register a new dog on behalf of the exhibitor.'}
            {step === 'classes' &&
              'Select the classes to enter and provide exhibitor details.'}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Search for existing dog */}
        {step === 'search' && (
          <div className="space-y-4 py-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by registered name..."
                value={dogSearch}
                onChange={(e) => setDogSearch(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>

            {searchLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {dogSearch.length >= 2 && dogResults && dogResults.length === 0 && (
              <div className="rounded-lg border border-dashed py-8 text-center">
                <p className="text-sm text-muted-foreground">No dogs found matching &ldquo;{dogSearch}&rdquo;</p>
              </div>
            )}

            {dogResults && dogResults.length > 0 && (
              <div className="max-h-60 space-y-1 overflow-y-auto">
                {dogResults.map((dog) => (
                  <button
                    key={dog.id}
                    onClick={() => {
                      setSelectedDogId(dog.id);
                      setSelectedDogName(dog.registeredName);
                      // Pre-fill exhibitor email from primary owner
                      const primaryOwner = dog.owners?.[0];
                      if (primaryOwner?.ownerEmail) {
                        setExhibitorEmail(primaryOwner.ownerEmail);
                      }
                      setStep('classes');
                    }}
                    className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <div>
                      <p className="font-medium">{dog.registeredName}</p>
                      <p className="text-xs text-muted-foreground">
                        {dog.breed?.name} · {dog.sex === 'dog' ? 'Dog' : 'Bitch'}
                        {dog.kcRegNumber ? ` · KC: ${dog.kcRegNumber}` : ''}
                      </p>
                      {dog.owners?.[0] && (
                        <p className="text-xs text-muted-foreground">
                          Owner: {dog.owners[0].ownerName}
                        </p>
                      )}
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}

            <div className="border-t pt-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setRegName(dogSearch);
                  setStep('register');
                }}
              >
                <Plus className="size-4" />
                Register New Dog
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Register new dog */}
        {step === 'register' && (
          <div className="space-y-4 py-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium">Registered Name *</label>
                <Input value={regName} onChange={(e) => setRegName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">KC Reg Number</label>
                <Input value={regKc} onChange={(e) => setRegKc(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Breed *</label>
                <Select value={regBreed} onValueChange={setRegBreed}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select breed" />
                  </SelectTrigger>
                  <SelectContent>
                    {(allBreeds ?? []).map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Sex *</label>
                <Select value={regSex} onValueChange={setRegSex}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select sex" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dog">Dog</SelectItem>
                    <SelectItem value="bitch">Bitch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Date of Birth *</label>
                <Input type="date" value={regDob} onChange={(e) => setRegDob(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Sire</label>
                <Input value={regSire} onChange={(e) => setRegSire(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Dam</label>
                <Input value={regDam} onChange={(e) => setRegDam(e.target.value)} />
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="mb-3 text-sm font-medium">Owner Details</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Owner Name *</label>
                  <Input value={regOwnerName} onChange={(e) => setRegOwnerName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Owner Email *</label>
                  <Input
                    type="email"
                    value={exhibitorEmail}
                    onChange={(e) => setExhibitorEmail(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-medium">Owner Address *</label>
                  <Input value={regOwnerAddress} onChange={(e) => setRegOwnerAddress(e.target.value)} />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('search')}>
                Back
              </Button>
              <Button
                disabled={
                  !regName || !regBreed || !regSex || !regDob ||
                  !regOwnerName || !exhibitorEmail || !regOwnerAddress ||
                  registerDogMutation.isPending
                }
                onClick={() =>
                  registerDogMutation.mutate({
                    registeredName: regName,
                    kcRegNumber: regKc || undefined,
                    breedId: regBreed,
                    sex: regSex as 'dog' | 'bitch',
                    dateOfBirth: regDob,
                    sireName: regSire || undefined,
                    damName: regDam || undefined,
                    exhibitorEmail,
                    ownerName: regOwnerName,
                    ownerAddress: regOwnerAddress,
                  })
                }
              >
                {registerDogMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Register & Continue
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Select classes and submit */}
        {step === 'classes' && (
          <div className="space-y-4 py-2">
            {/* Exhibitor email */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Exhibitor Email</label>
              <Input
                type="email"
                placeholder="exhibitor@example.com"
                value={exhibitorEmail}
                onChange={(e) => setExhibitorEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                If this matches a Remi account, the entry appears in their dashboard.
              </p>
            </div>

            {/* Payment method */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Payment Method</label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="postal">Postal (cheque)</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="online">Online (already paid)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* NFC toggle */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="nfc-check"
                checked={isNfc}
                onCheckedChange={(v) => setIsNfc(!!v)}
              />
              <Label htmlFor="nfc-check" className="text-sm">Not for Competition (NFC)</Label>
            </div>

            {/* Class selection */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Classes</label>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-3">
                {classesData && classesData.length > 0 ? (
                  classesData.map((sc) => (
                    <label
                      key={sc.id}
                      className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedClassIds.includes(sc.id)}
                        onCheckedChange={(checked) => {
                          setSelectedClassIds((prev) =>
                            checked
                              ? [...prev, sc.id]
                              : prev.filter((id) => id !== sc.id)
                          );
                        }}
                      />
                      <span className="flex-1 text-sm">
                        {sc.classDefinition?.name ?? 'Unknown Class'}
                        {sc.sex ? ` (${sc.sex === 'dog' ? 'Dog' : 'Bitch'})` : ''}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatCurrency(sc.entryFee)}
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No classes defined for this show yet.
                  </p>
                )}
              </div>
              {selectedClassIds.length > 0 && (
                <p className="text-sm font-medium">
                  Total: {formatCurrency(
                    (classesData ?? [])
                      .filter((sc) => selectedClassIds.includes(sc.id))
                      .reduce((sum, sc) => sum + sc.entryFee, 0)
                  )}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('search')}>
                Back
              </Button>
              <Button
                disabled={
                  !selectedDogId || !exhibitorEmail || selectedClassIds.length === 0 ||
                  createEntryMutation.isPending
                }
                onClick={() =>
                  createEntryMutation.mutate({
                    showId,
                    dogId: selectedDogId!,
                    classIds: selectedClassIds,
                    exhibitorEmail,
                    isNfc,
                    paymentMethod: paymentMethod as 'postal' | 'cash' | 'bank_transfer' | 'online',
                  })
                }
              >
                {createEntryMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Create Entry
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FinancialTab({
  showId,
  stats,
  entries,
}: {
  showId: string;
  stats:
    | {
        totalEntries: number;
        totalRevenue: number;
        confirmedEntries: number;
        pendingEntries: number;
      }
    | undefined;
  entries: EntryItem[];
}) {
  const [refundEntry, setRefundEntry] = useState<EntryItem | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const utils = trpc.useUtils();

  const refundMutation = trpc.secretary.issueRefund.useMutation({
    onSuccess: (data) => {
      toast.success(
        data.fullyRefunded
          ? `Full refund of ${formatCurrency(data.amount)} issued — entry cancelled`
          : `Partial refund of ${formatCurrency(data.amount)} issued`
      );
      setRefundEntry(null);
      setRefundAmount('');
      setRefundReason('');
      utils.entries.getForShow.invalidate({ showId });
      utils.secretary.getShowStats.invalidate({ showId });
    },
    onError: (err) => toast.error(err.message ?? 'Failed to issue refund'),
  });

  const confirmedRevenue = entries
    .filter((e) => e.status === 'confirmed')
    .reduce((sum, e) => sum + e.totalFee, 0);

  const pendingRevenue = entries
    .filter((e) => e.status === 'pending')
    .reduce((sum, e) => sum + e.totalFee, 0);

  const nfcEntries = entries.filter((e) => e.isNfc);
  const standardEntries = entries.filter((e) => !e.isNfc);

  const confirmedEntries = entries.filter((e) => e.status === 'confirmed');

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-sm font-medium">
              Total Fees
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(stats?.totalRevenue ?? 0)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              from {stats?.totalEntries ?? 0} entries
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-sm font-medium">
              Confirmed Payments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(confirmedRevenue)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {stats?.confirmedEntries ?? 0} confirmed entries
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-sm font-medium">
              Pending Payments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {formatCurrency(pendingRevenue)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {stats?.pendingEntries ?? 0} pending entries
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Breakdown by Entry Type</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Entries</TableHead>
                <TableHead>Total Fees</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Standard Entries</TableCell>
                <TableCell>{standardEntries.length}</TableCell>
                <TableCell>
                  {formatCurrency(
                    standardEntries.reduce((s, e) => s + e.totalFee, 0)
                  )}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">NFC Entries</TableCell>
                <TableCell>{nfcEntries.length}</TableCell>
                <TableCell>
                  {formatCurrency(
                    nfcEntries.reduce((s, e) => s + e.totalFee, 0)
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Payment status breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Status Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Entries</TableHead>
                <TableHead>Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(['confirmed', 'pending', 'withdrawn', 'cancelled'] as const).map(
                (status) => {
                  const statusEntries = entries.filter(
                    (e) => e.status === status
                  );
                  const statusTotal = statusEntries.reduce(
                    (s, e) => s + e.totalFee,
                    0
                  );
                  const config = entryStatusConfig[status];
                  return (
                    <TableRow key={status}>
                      <TableCell>
                        <Badge variant={config?.variant ?? 'outline'}>
                          {config?.label ?? status}
                        </Badge>
                      </TableCell>
                      <TableCell>{statusEntries.length}</TableCell>
                      <TableCell>{formatCurrency(statusTotal)}</TableCell>
                    </TableRow>
                  );
                }
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Refund Management */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <RotateCcw className="size-5" />
                Issue Refund
              </CardTitle>
              <CardDescription>
                Refund a confirmed entry via Stripe. Full refunds auto-cancel the entry.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {confirmedEntries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No confirmed entries available for refund.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cat #</TableHead>
                  <TableHead>Dog</TableHead>
                  <TableHead>Fee</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {confirmedEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">
                      {entry.catalogueNumber ?? '—'}
                    </TableCell>
                    <TableCell>{entry.dog ? formatDogName(entry.dog) : 'Unknown'}</TableCell>
                    <TableCell>{formatCurrency(entry.totalFee)}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRefundEntry(entry);
                          setRefundAmount((entry.totalFee / 100).toFixed(2));
                        }}
                      >
                        <RotateCcw className="size-3.5" />
                        Refund
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Refund dialog */}
      <Dialog open={!!refundEntry} onOpenChange={(open) => !open && setRefundEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue Refund</DialogTitle>
            <DialogDescription>
              Refunding {refundEntry?.dog ? formatDogName(refundEntry.dog) : ''} — entry fee {formatCurrency(refundEntry?.totalFee ?? 0)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Amount (GBP)</label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={(refundEntry?.totalFee ?? 0) / 100}
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                placeholder="e.g. 5.00"
              />
              <p className="text-xs text-muted-foreground">
                Max refundable: {formatCurrency(refundEntry?.totalFee ?? 0)}
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason (optional)</label>
              <Input
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="e.g. Exhibitor withdrew"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundEntry(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={refundMutation.isPending || !refundAmount}
              onClick={() => {
                if (!refundEntry) return;
                const amountPence = Math.round(parseFloat(refundAmount) * 100);
                refundMutation.mutate({
                  entryId: refundEntry.id,
                  amount: amountPence,
                  reason: refundReason || undefined,
                });
              }}
            >
              {refundMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Confirm Refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Catalogue Tab ────────────────────────────────────────────

function CatalogueTab({ showId }: { showId: string }) {
  const utils = trpc.useUtils();
  const { data: catalogueData, isLoading } =
    trpc.secretary.getCatalogueData.useQuery({ showId });
  const { data: absentees } =
    trpc.secretary.getAbsenteeList.useQuery({ showId });

  const assignMutation = trpc.secretary.assignCatalogueNumbers.useMutation({
    onSuccess: (data) => {
      toast.success(`Assigned catalogue numbers to ${data.assigned} entries`);
      utils.secretary.getCatalogueData.invalidate({ showId });
    },
    onError: () => toast.error('Failed to assign catalogue numbers'),
  });

  const entries = catalogueData?.entries ?? [];
  const show = catalogueData?.show;

  // Group entries by breed group → breed → sex for display
  const grouped = useMemo(() => {
    const groups: Record<string, Record<string, { dogs: typeof entries; bitches: typeof entries }>> = {};
    for (const entry of entries) {
      const groupName = entry.dog?.breed?.group?.name ?? 'Unclassified';
      const breedName = entry.dog?.breed?.name ?? 'Unknown Breed';
      groups[groupName] ??= {};
      groups[groupName][breedName] ??= { dogs: [], bitches: [] };
      if (entry.dog?.sex === 'bitch') {
        groups[groupName][breedName].bitches.push(entry);
      } else {
        groups[groupName][breedName].dogs.push(entry);
      }
    }
    return groups;
  }, [entries]);

  const hasNumbers = entries.some((e) => e.catalogueNumber);

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          onClick={() => assignMutation.mutate({ showId })}
          disabled={assignMutation.isPending || entries.length === 0}
        >
          {assignMutation.isPending && (
            <Loader2 className="size-4 animate-spin" />
          )}
          <Hash className="size-4" />
          Assign Catalogue Numbers
        </Button>
        {hasNumbers && (
          <>
            <Button variant="outline" asChild>
              <a
                href={`/api/catalogue/${showId}/standard`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download className="size-4" />
                Download Catalogue PDF
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a
                href={`/api/catalogue/${showId}/absentees`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download className="size-4" />
                Download Absentees PDF
              </a>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <a
                href={`/api/catalogue/${showId}/standard?output=json`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Export JSON
              </a>
            </Button>
          </>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-sm font-medium">
              Catalogue Entries
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{entries.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-sm font-medium">
              Absentees
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{absentees?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-sm font-medium">
              Numbers Assigned
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {hasNumbers ? 'Yes' : 'Not yet'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Catalogue Preview */}
      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Loading catalogue data...
          </CardContent>
        </Card>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="mx-auto mb-4 size-10 text-muted-foreground" />
            <p className="font-semibold">No confirmed entries yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Entries will appear here once exhibitors have paid.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Catalogue Preview</CardTitle>
            <CardDescription>
              Entries ordered by breed group, breed, then sex
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {Object.entries(grouped)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([groupName, breeds]) => (
                <div key={groupName}>
                  <h3 className="mb-3 rounded bg-primary px-3 py-1.5 text-sm font-bold uppercase tracking-wider text-primary-foreground">
                    {groupName}
                  </h3>
                  {Object.entries(breeds)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([breedName, { dogs, bitches }]) => (
                      <div key={breedName} className="mb-4 pl-2">
                        <h4 className="mb-2 border-b font-semibold">
                          {breedName}
                        </h4>
                        {dogs.length > 0 && (
                          <>
                            <p className="mb-1 text-xs font-medium italic text-muted-foreground">
                              Dogs
                            </p>
                            {dogs.map((entry) => (
                              <CatalogueEntryRow
                                key={entry.id}
                                entry={entry}
                              />
                            ))}
                          </>
                        )}
                        {bitches.length > 0 && (
                          <>
                            <p className="mb-1 mt-2 text-xs font-medium italic text-muted-foreground">
                              Bitches
                            </p>
                            {bitches.map((entry) => (
                              <CatalogueEntryRow
                                key={entry.id}
                                entry={entry}
                              />
                            ))}
                          </>
                        )}
                      </div>
                    ))}
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {/* Absentee List */}
      {(absentees?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Absentee List</CardTitle>
            <CardDescription>
              Withdrawn entries with catalogue numbers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cat. No.</TableHead>
                  <TableHead>Dog</TableHead>
                  <TableHead>Breed</TableHead>
                  <TableHead>Exhibitor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {absentees?.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono font-bold">
                      {entry.catalogueNumber ?? '—'}
                    </TableCell>
                    <TableCell>
                      {entry.dog?.registeredName ?? '—'}
                    </TableCell>
                    <TableCell>{entry.dog?.breed?.name ?? '—'}</TableCell>
                    <TableCell>{entry.exhibitor?.name ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type CatalogueEntryItem = NonNullable<
  RouterOutputs['secretary']['getCatalogueData']
>['entries'][number];

function CatalogueEntryRow({ entry }: { entry: CatalogueEntryItem }) {
  return (
    <div className="mb-2 rounded border bg-card px-3 py-2 text-sm">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-xs font-bold text-muted-foreground">
          {entry.catalogueNumber ?? '—'}
        </span>
        <span className="font-semibold">
          {entry.dog ? formatDogName(entry.dog) : 'Junior Handler'}
        </span>
      </div>
      {entry.dog && (
        <div className="mt-1 grid grid-cols-2 gap-x-4 text-xs text-muted-foreground">
          {entry.dog.dateOfBirth && (
            <span>DOB: {formatDate(entry.dog.dateOfBirth)}</span>
          )}
          {entry.dog.sireName && <span>Sire: {entry.dog.sireName}</span>}
          {entry.dog.damName && <span>Dam: {entry.dog.damName}</span>}
          {entry.dog.breederName && (
            <span>Breeder: {entry.dog.breederName}</span>
          )}
        </div>
      )}
      {entry.dog?.owners && entry.dog.owners.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          Owner{entry.dog.owners.length > 1 ? 's' : ''}:{' '}
          {entry.dog.owners
            .map((o) => ('ownerName' in o ? o.ownerName : ''))
            .filter(Boolean)
            .join(' & ')}
        </p>
      )}
      {entry.entryClasses.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {entry.entryClasses.map((ec, i) => (
            <Badge key={i} variant="secondary" className="text-[10px]">
              {ec.showClass?.classDefinition?.name ?? '?'}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Reports Tab ──────────────────────────────────────────────

function ReportsTab({ showId }: { showId: string }) {
  const [activeReport, setActiveReport] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Report cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card
          className="cursor-pointer transition-colors hover:border-primary"
          onClick={() =>
            setActiveReport(activeReport === 'entries' ? null : 'entries')
          }
        >
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950">
                <FileText className="size-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-base">Entry Report</CardTitle>
                <CardDescription>
                  Full entry list with exhibitor, dog, classes, and fees
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card
          className="cursor-pointer transition-colors hover:border-primary"
          onClick={() =>
            setActiveReport(activeReport === 'payments' ? null : 'payments')
          }
        >
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-950">
                <PoundSterling className="size-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <CardTitle className="text-base">Payment Report</CardTitle>
                <CardDescription>
                  Revenue breakdown by status with payment reconciliation
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card
          className="cursor-pointer transition-colors hover:border-primary"
          onClick={() =>
            setActiveReport(
              activeReport === 'catalogueOrders' ? null : 'catalogueOrders'
            )
          }
        >
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-950">
                <BookOpen className="size-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <CardTitle className="text-base">Catalogue Orders</CardTitle>
                <CardDescription>
                  Entries that requested a printed catalogue
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Active report content */}
      {activeReport === 'entries' && <EntryReportContent showId={showId} />}
      {activeReport === 'payments' && <PaymentReportContent showId={showId} />}
      {activeReport === 'catalogueOrders' && (
        <CatalogueOrdersContent showId={showId} />
      )}

      {/* Audit Log */}
      <AuditLogViewer showId={showId} />
    </div>
  );
}

function EntryReportContent({ showId }: { showId: string }) {
  const { data: entries, isLoading } =
    trpc.secretary.getEntryReport.useQuery({ showId });

  function exportCsv() {
    if (!entries) return;
    const headers = [
      'Entry Date',
      'Status',
      'Exhibitor',
      'Email',
      'Dog',
      'Breed',
      'Group',
      'Sex',
      'Classes',
      'Fee (£)',
      'NFC',
    ];
    const rows = entries.map((e) => [
      formatDate(e.entryDate),
      e.status,
      e.exhibitor?.name ?? '',
      e.exhibitor?.email ?? '',
      e.dog?.registeredName ?? 'Junior Handler',
      e.dog?.breed?.name ?? '',
      e.dog?.breed?.group?.name ?? '',
      e.dog?.sex ?? '',
      e.entryClasses
        .map((ec) => ec.showClass?.classDefinition?.name ?? '')
        .filter(Boolean)
        .join('; '),
      (e.totalFee / 100).toFixed(2),
      e.isNfc ? 'Yes' : 'No',
    ]);

    downloadCsv(headers, rows, `entry-report-${showId}`);
  }

  if (isLoading) return <LoadingCard />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <CardTitle>Entry Report ({entries?.length ?? 0} entries)</CardTitle>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="size-4" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Exhibitor</TableHead>
              <TableHead>Dog</TableHead>
              <TableHead>Breed</TableHead>
              <TableHead>Classes</TableHead>
              <TableHead>Fee</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries?.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="text-muted-foreground">
                  {formatDate(entry.entryDate)}
                </TableCell>
                <TableCell>{entry.exhibitor?.name ?? '—'}</TableCell>
                <TableCell>
                  {entry.dog?.registeredName ?? 'Junior Handler'}
                </TableCell>
                <TableCell>{entry.dog?.breed?.name ?? '—'}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {entry.entryClasses.map((ec, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">
                        {ec.showClass?.classDefinition?.name ?? '?'}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>{formatCurrency(entry.totalFee)}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      entryStatusConfig[entry.status]?.variant ?? 'outline'
                    }
                  >
                    {entryStatusConfig[entry.status]?.label ?? entry.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PaymentReportContent({ showId }: { showId: string }) {
  const { data, isLoading } =
    trpc.secretary.getPaymentReport.useQuery({ showId });

  function exportCsv() {
    if (!data) return;
    const headers = [
      'Exhibitor',
      'Dog',
      'Status',
      'Fee (£)',
      'Payments',
    ];
    const rows = data.entries.map((e) => [
      e.exhibitor?.name ?? '',
      e.dog?.registeredName ?? 'Junior Handler',
      e.status,
      (e.totalFee / 100).toFixed(2),
      e.payments.map((p) => `${p.status}: £${(p.amount / 100).toFixed(2)}`).join('; '),
    ]);

    downloadCsv(headers, rows, `payment-report-${showId}`);
  }

  if (isLoading) return <LoadingCard />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Payment Report</CardTitle>
            <CardDescription>
              {data?.summary.totalEntries} entries, {data?.summary.paidCount}{' '}
              paid, {data?.summary.pendingCount} pending
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="size-4" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-green-50 p-3 dark:bg-green-950/30">
            <p className="text-xs text-muted-foreground">Total Revenue</p>
            <p className="text-lg font-bold text-green-700 dark:text-green-400">
              {formatCurrency(data?.summary.totalRevenue ?? 0)}
            </p>
          </div>
          <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-950/30">
            <p className="text-xs text-muted-foreground">Paid</p>
            <p className="text-lg font-bold text-blue-700 dark:text-blue-400">
              {data?.summary.paidCount ?? 0} entries
            </p>
          </div>
          <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-950/30">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
              {data?.summary.pendingCount ?? 0} entries
            </p>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Exhibitor</TableHead>
              <TableHead>Dog</TableHead>
              <TableHead>Fee</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payments</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{entry.exhibitor?.name ?? '—'}</TableCell>
                <TableCell>
                  {entry.dog?.registeredName ?? 'Junior Handler'}
                </TableCell>
                <TableCell>{formatCurrency(entry.totalFee)}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      entryStatusConfig[entry.status]?.variant ?? 'outline'
                    }
                  >
                    {entryStatusConfig[entry.status]?.label ?? entry.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {entry.payments.map((p, i) => (
                      <Badge
                        key={i}
                        variant={
                          p.status === 'succeeded' ? 'default' : 'outline'
                        }
                        className="text-[10px]"
                      >
                        £{(p.amount / 100).toFixed(2)} ({p.status})
                      </Badge>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CatalogueOrdersContent({ showId }: { showId: string }) {
  const { data: orders, isLoading } =
    trpc.secretary.getCatalogueOrders.useQuery({ showId });

  if (isLoading) return <LoadingCard />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Catalogue Orders ({orders?.length ?? 0})</CardTitle>
        <CardDescription>
          Entries that requested a printed catalogue
        </CardDescription>
      </CardHeader>
      <CardContent>
        {(orders?.length ?? 0) === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No catalogue orders yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Exhibitor</TableHead>
                <TableHead>Dog</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders?.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{entry.exhibitor?.name ?? '—'}</TableCell>
                  <TableCell>
                    {entry.dog?.registeredName ?? 'Junior Handler'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function LoadingCard() {
  return (
    <Card>
      <CardContent className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

function downloadCsv(headers: string[], rows: string[][], filename: string) {
  const csv = [headers, ...rows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    )
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success('Report exported to CSV');
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
        const res = await fetch('/api/upload/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            sizeBytes: file.size,
          }),
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

        const { presignedUrl, publicUrl } = await res.json();

        // Upload directly to R2
        const uploadRes = await fetch(presignedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        });

        if (!uploadRes.ok) throw new Error('File upload to storage failed');

        // Save the public URL to the show
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

// ── Edit Dog Dialog ─────────────────────────────────────────

function EditDogDialog({
  entry,
  showId,
  onClose,
}: {
  entry: EntryItem;
  showId: string;
  onClose: () => void;
}) {
  const [registeredName, setRegisteredName] = useState(
    entry.dog?.registeredName ?? ''
  );
  const [sireName, setSireName] = useState(entry.dog?.sireName ?? '');
  const [damName, setDamName] = useState(entry.dog?.damName ?? '');
  const [breederName, setBreederName] = useState(
    entry.dog?.breederName ?? ''
  );
  const [reason, setReason] = useState('');
  const utils = trpc.useUtils();

  const updateDog = trpc.secretary.updateDog.useMutation({
    onSuccess: () => {
      toast.success('Dog details updated');
      utils.entries.getForShow.invalidate({ showId });
      onClose();
    },
    onError: (err) => toast.error(err.message ?? 'Failed to update dog'),
  });

  function handleSave() {
    if (!reason.trim()) {
      toast.error('Please provide a reason for the change');
      return;
    }

    const changes: Record<string, string> = {};
    if (registeredName !== (entry.dog?.registeredName ?? ''))
      changes.registeredName = registeredName;
    if (sireName !== (entry.dog?.sireName ?? ''))
      changes.sireName = sireName;
    if (damName !== (entry.dog?.damName ?? ''))
      changes.damName = damName;
    if (breederName !== (entry.dog?.breederName ?? ''))
      changes.breederName = breederName;

    if (Object.keys(changes).length === 0) {
      toast.error('No changes to save');
      return;
    }

    updateDog.mutate({
      showId,
      entryId: entry.id,
      changes,
      reason: reason.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Edit Dog Details</CardTitle>
            <button
              onClick={onClose}
              className="rounded-full p-1 hover:bg-muted"
            >
              <X className="size-5" />
            </button>
          </div>
          <CardDescription>
            Editing {entry.dog?.registeredName ?? 'Unknown'} — entered by{' '}
            {entry.exhibitor?.name ?? 'Unknown'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Registered Name</Label>
            <Input
              value={registeredName}
              onChange={(e) => setRegisteredName(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-sm font-medium">Sire</Label>
              <Input
                value={sireName}
                onChange={(e) => setSireName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Dam</Label>
              <Input
                value={damName}
                onChange={(e) => setDamName(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-sm font-medium">Breeder</Label>
            <Input
              value={breederName}
              onChange={(e) => setBreederName(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-sm font-medium">
              Reason for Change <span className="text-destructive">*</span>
            </Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Exhibitor requested correction to sire name"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              This will be recorded in the audit log
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateDog.isPending || !reason.trim()}
            >
              {updateDog.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Bulk Class Creator ───────────────────────────────────────

// ── Class Manager ─────────────────────────────────────────────

interface ClassManagerProps {
  showId: string;
  classes: {
    id: string;
    entryFee: number;
    sex: 'dog' | 'bitch' | null;
    sortOrder: number;
    classDefinition?: { name: string; type: string } | null;
    breed?: { name: string } | null;
  }[];
}

function ClassManager({ showId, classes }: ClassManagerProps) {
  const [editingFees, setEditingFees] = useState<Record<string, string>>({});
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

  function startEditFee(classId: string, currentFee: number) {
    setEditingFees((prev) => ({
      ...prev,
      [classId]: String(currentFee),
    }));
  }

  function saveFee(classId: string) {
    const val = editingFees[classId];
    if (val === undefined) return;
    const pence = parseInt(val, 10);
    if (isNaN(pence) || pence < 0) {
      toast.error('Enter a valid fee in pence');
      return;
    }
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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Classes ({classes.length})</CardTitle>
            <CardDescription>Click a fee to edit it. Remove classes that don&apos;t apply to this show.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(grouped).map(([type, typeClasses]) => (
          <div key={type}>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {typeLabels[type] ?? type}
            </h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead className="w-[100px]">Sex</TableHead>
                  <TableHead className="w-[120px]">Fee</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {typeClasses.map((sc) => {
                  const isEditing = editingFees[sc.id] !== undefined;
                  return (
                    <TableRow key={sc.id}>
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

  // Match template class names to actual class definitions
  const matchedClassDefs = useMemo(() => {
    if (!template || !classDefs) return [];
    return classDefs.filter((cd) => template.classNames.includes(cd.name));
  }, [template, classDefs]);

  // Group breeds by group
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
    setFeeInput(String(t?.defaultFeePence ?? 500));
    // Pre-check all template classes
    if (t && classDefs) {
      const ids = classDefs
        .filter((cd) => t.classNames.includes(cd.name))
        .map((cd) => cd.id);
      setSelectedClassDefIds(ids);
    }
  }

  function handleCreate() {
    if (!template || selectedBreedIds.length === 0 || selectedClassDefIds.length === 0) return;
    const fee = feeInput ? parseInt(feeInput, 10) : template.defaultFeePence;
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
        {/* Template selection */}
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
            {/* Class selection with checkboxes */}
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

            {/* Breed selection */}
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

            {/* Options */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label className="text-sm font-medium">Entry Fee (pence)</Label>
                <Input
                  type="number"
                  min={0}
                  value={feeInput}
                  onChange={(e) => setFeeInput(e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-0.5">
                  {feeInput ? formatCurrency(parseInt(feeInput, 10) || 0) : '£0.00'}
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
  const [feeInput, setFeeInput] = useState('500');
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
    const fee = parseInt(feeInput, 10);
    if (isNaN(fee) || fee <= 0) {
      toast.error('Enter a valid entry fee');
      return;
    }

    let defId = classDefId;

    // If creating a new class definition
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
        {/* Class selection mode */}
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
          {/* Breed selector */}
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

          {/* Sex selector */}
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

          {/* Entry fee */}
          <div>
            <Label className="text-sm font-medium">Entry Fee (pence)</Label>
            <Input
              type="number"
              min={0}
              value={feeInput}
              onChange={(e) => setFeeInput(e.target.value)}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-0.5">
              {feeInput ? formatCurrency(parseInt(feeInput, 10) || 0) : '£0.00'}
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

// ── Audit Log Viewer ─────────────────────────────────────────

function AuditLogViewer({ showId }: { showId: string }) {
  const { data: auditLog, isLoading } =
    trpc.secretary.getAuditLog.useQuery({ showId });

  if (isLoading) return <LoadingCard />;

  const actionLabels: Record<string, string> = {
    created: 'Created',
    classes_changed: 'Classes Changed',
    handler_changed: 'Handler Changed',
    withdrawn: 'Withdrawn',
    reinstated: 'Reinstated',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Log</CardTitle>
        <CardDescription>
          Change history for entries in this show
        </CardDescription>
      </CardHeader>
      <CardContent>
        {(auditLog?.length ?? 0) === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No audit log entries yet.
          </p>
        ) : (
          <div className="space-y-3">
            {auditLog?.map((log) => (
              <div
                key={log.id}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {actionLabels[log.action] ?? log.action}
                    </Badge>
                    <span className="font-medium">
                      {log.entry?.dog?.registeredName ?? 'Unknown dog'}
                    </span>
                    <span className="text-muted-foreground">
                      ({log.entry?.exhibitor?.name ?? 'Unknown'})
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(log.createdAt)}
                  </span>
                </div>
                {log.reason && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Reason: {log.reason}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Judges Tab ───────────────────────────────────────────────

function JudgesTab({ showId }: { showId: string }) {
  const [adding, setAdding] = useState(false);
  const [judgeName, setJudgeName] = useState('');
  const [judgeKc, setJudgeKc] = useState('');
  const [judgeEmail, setJudgeEmail] = useState('');
  const [selectedJudgeId, setSelectedJudgeId] = useState('');
  const [selectedBreedId, setSelectedBreedId] = useState('');
  const [selectedRingId, setSelectedRingId] = useState('');
  const utils = trpc.useUtils();

  const { data: assignments, isLoading } =
    trpc.secretary.getShowJudges.useQuery({ showId });
  const { data: allJudges } = trpc.secretary.getJudges.useQuery();
  const { data: breeds } = trpc.breeds.list.useQuery();
  const { data: showRings } = trpc.secretary.getShowRings.useQuery({ showId });

  const addJudgeMutation = trpc.secretary.addJudge.useMutation({
    onSuccess: (judge) => {
      toast.success(`Judge "${judge.name}" created`);
      setJudgeName('');
      setJudgeKc('');
      setJudgeEmail('');
      setAdding(false);
      setSelectedJudgeId(judge.id);
      utils.secretary.getJudges.invalidate();
    },
    onError: (err) => toast.error(err.message ?? 'Failed to add judge'),
  });

  const assignMutation = trpc.secretary.assignJudge.useMutation({
    onSuccess: () => {
      toast.success('Judge assigned to show');
      setSelectedJudgeId('');
      setSelectedBreedId('');
      setSelectedRingId('');
      utils.secretary.getShowJudges.invalidate({ showId });
    },
    onError: (err) => toast.error(err.message ?? 'Failed to assign judge'),
  });

  const removeMutation = trpc.secretary.removeJudgeAssignment.useMutation({
    onSuccess: () => {
      toast.success('Judge assignment removed');
      utils.secretary.getShowJudges.invalidate({ showId });
    },
    onError: () => toast.error('Failed to remove judge assignment'),
  });

  return (
    <div className="space-y-6">
      {/* Create new judge */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Gavel className="size-5" />
                Judges
              </CardTitle>
              <CardDescription>
                Add judges to the system and assign them to this show.
              </CardDescription>
            </div>
            {!adding && (
              <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                <Plus className="size-4" />
                New Judge
              </Button>
            )}
          </div>
        </CardHeader>
        {adding && (
          <CardContent>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="mb-3 text-sm font-medium">Create New Judge</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  placeholder="Name *"
                  value={judgeName}
                  onChange={(e) => setJudgeName(e.target.value)}
                />
                <Input
                  placeholder="KC Number"
                  value={judgeKc}
                  onChange={(e) => setJudgeKc(e.target.value)}
                />
                <Input
                  type="email"
                  placeholder="Email"
                  value={judgeEmail}
                  onChange={(e) => setJudgeEmail(e.target.value)}
                />
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    addJudgeMutation.mutate({
                      name: judgeName.trim(),
                      kcNumber: judgeKc.trim() || undefined,
                      contactEmail: judgeEmail.trim() || undefined,
                    })
                  }
                  disabled={!judgeName.trim() || addJudgeMutation.isPending}
                >
                  {addJudgeMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                  Create Judge
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Assign judge to show */}
      <Card>
        <CardHeader>
          <CardTitle>Assign Judge to Show</CardTitle>
          <CardDescription>
            Select an existing judge and optionally assign them to a breed and ring.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-4">
            <Select value={selectedJudgeId} onValueChange={setSelectedJudgeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select judge *" />
              </SelectTrigger>
              <SelectContent>
                {(allJudges ?? []).map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.name} {j.kcNumber ? `(${j.kcNumber})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedBreedId} onValueChange={setSelectedBreedId}>
              <SelectTrigger>
                <SelectValue placeholder="Breed (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">All breeds</SelectItem>
                {(breeds ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedRingId} onValueChange={setSelectedRingId}>
              <SelectTrigger>
                <SelectValue placeholder="Ring (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No ring</SelectItem>
                {(showRings ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    Ring {r.number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() =>
                assignMutation.mutate({
                  showId,
                  judgeId: selectedJudgeId,
                  breedId: selectedBreedId && selectedBreedId !== 'none' ? selectedBreedId : null,
                  ringId: selectedRingId && selectedRingId !== 'none' ? selectedRingId : null,
                })
              }
              disabled={!selectedJudgeId || assignMutation.isPending}
            >
              {assignMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Assign
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Current judge assignments */}
      <Card>
        <CardHeader>
          <CardTitle>Current Assignments ({assignments?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : !assignments || assignments.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
              <Gavel className="mb-4 size-10 text-muted-foreground/40" />
              <h3 className="font-semibold">No judges assigned</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Assign judges to this show using the form above.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Judge</TableHead>
                  <TableHead>KC Number</TableHead>
                  <TableHead>Breed</TableHead>
                  <TableHead>Ring</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.judge.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.judge.kcNumber ?? '—'}
                    </TableCell>
                    <TableCell>
                      {a.breed ? (
                        <Badge variant="outline">{a.breed.name}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">All</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {a.ring ? (
                        <Badge variant="outline">Ring {a.ring.number}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm('Remove this judge assignment?')) {
                            removeMutation.mutate({ assignmentId: a.id });
                          }
                        }}
                        disabled={removeMutation.isPending}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Rings Tab ────────────────────────────────────────────────

function RingsTab({ showId }: { showId: string }) {
  const [adding, setAdding] = useState(false);
  const [ringNumber, setRingNumber] = useState('');
  const [ringDay, setRingDay] = useState('');
  const [ringTime, setRingTime] = useState('');
  const utils = trpc.useUtils();

  const { data: showRings, isLoading } =
    trpc.secretary.getShowRings.useQuery({ showId });

  const addMutation = trpc.secretary.addRing.useMutation({
    onSuccess: () => {
      toast.success('Ring added');
      setRingNumber('');
      setRingDay('');
      setRingTime('');
      setAdding(false);
      utils.secretary.getShowRings.invalidate({ showId });
    },
    onError: (err) => toast.error(err.message ?? 'Failed to add ring'),
  });

  const removeMutation = trpc.secretary.removeRing.useMutation({
    onSuccess: () => {
      toast.success('Ring removed');
      utils.secretary.getShowRings.invalidate({ showId });
    },
    onError: () => toast.error('Failed to remove ring'),
  });

  // Suggest the next ring number
  const nextNumber = (showRings?.length ?? 0) + 1;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CircleDot className="size-5" />
              Rings ({showRings?.length ?? 0})
            </CardTitle>
            <CardDescription>
              Define the judging rings for this show. Rings can be assigned to judges and stewards.
            </CardDescription>
          </div>
          {!adding && (
            <Button onClick={() => { setAdding(true); setRingNumber(String(nextNumber)); }}>
              <Plus className="size-4" />
              Add Ring
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Add ring form */}
        {adding && (
          <div className="mb-6 rounded-lg border bg-muted/30 p-4">
            <p className="mb-3 text-sm font-medium">Add Ring</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Ring Number *</label>
                <Input
                  type="number"
                  min="1"
                  placeholder="e.g. 1"
                  value={ringNumber}
                  onChange={(e) => setRingNumber(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Show Day</label>
                <Input
                  type="number"
                  min="1"
                  placeholder="e.g. 1"
                  value={ringDay}
                  onChange={(e) => setRingDay(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Start Time</label>
                <Input
                  type="time"
                  value={ringTime}
                  onChange={(e) => setRingTime(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                onClick={() =>
                  addMutation.mutate({
                    showId,
                    number: parseInt(ringNumber),
                    showDay: ringDay ? parseInt(ringDay) : null,
                    startTime: ringTime || null,
                  })
                }
                disabled={!ringNumber || addMutation.isPending}
              >
                {addMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Add Ring
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Ring list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : !showRings || showRings.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
            <CircleDot className="mb-4 size-10 text-muted-foreground/40" />
            <h3 className="font-semibold">No rings defined</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Add rings so judges and stewards can be assigned to specific areas.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ring</TableHead>
                <TableHead>Day</TableHead>
                <TableHead>Start Time</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {showRings.map((ring) => (
                <TableRow key={ring.id}>
                  <TableCell className="font-medium">Ring {ring.number}</TableCell>
                  <TableCell>
                    {ring.showDay ? `Day ${ring.showDay}` : '—'}
                  </TableCell>
                  <TableCell>{ring.startTime ?? '—'}</TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm('Remove this ring? Any judge/steward assignments to this ring will be unlinked.')) {
                          removeMutation.mutate({ ringId: ring.id });
                        }
                      }}
                      disabled={removeMutation.isPending}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ── Stewards Tab ──────────────────────────────────────────────

function StewardsTab({ showId }: { showId: string }) {
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const utils = trpc.useUtils();

  const { data: stewards, isLoading } =
    trpc.secretary.getShowStewards.useQuery({ showId });

  const assignMutation = trpc.secretary.assignSteward.useMutation({
    onSuccess: () => {
      toast.success('Steward assigned');
      setEmail('');
      setAdding(false);
      utils.secretary.getShowStewards.invalidate({ showId });
    },
    onError: (err) => toast.error(err.message ?? 'Failed to assign steward'),
  });

  const removeMutation = trpc.secretary.removeSteward.useMutation({
    onSuccess: () => {
      toast.success('Steward removed');
      utils.secretary.getShowStewards.invalidate({ showId });
    },
    onError: () => toast.error('Failed to remove steward'),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Eye className="size-5" />
              Stewards ({stewards?.length ?? 0})
            </CardTitle>
            <CardDescription>
              Assign stewards who can record results at ringside using their phone.
            </CardDescription>
          </div>
          {!adding && (
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" />
              Add Steward
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Add steward form */}
        {adding && (
          <div className="mb-6 rounded-lg border bg-muted/30 p-4">
            <p className="mb-2 text-sm font-medium">Add Steward by Email</p>
            <p className="mb-3 text-xs text-muted-foreground">
              The user must have a Remi account. If they&apos;re currently an exhibitor,
              their role will be upgraded to steward.
            </p>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="steward@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && email.trim()) {
                    assignMutation.mutate({ showId, email: email.trim() });
                  }
                }}
                className="flex-1"
              />
              <Button
                onClick={() =>
                  assignMutation.mutate({ showId, email: email.trim() })
                }
                disabled={!email.trim() || assignMutation.isPending}
              >
                {assignMutation.isPending && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                Assign
              </Button>
              <Button variant="outline" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Steward list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : !stewards || stewards.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
            <Eye className="mb-4 size-10 text-muted-foreground/40" />
            <h3 className="font-semibold">No stewards assigned</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Assign stewards so they can record results from ringside during the show.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Ring</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {stewards.map((assignment) => (
                <TableRow key={assignment.id}>
                  <TableCell className="font-medium">
                    {assignment.user.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {assignment.user.email}
                  </TableCell>
                  <TableCell>
                    {assignment.ring ? (
                      <Badge variant="outline">Ring {assignment.ring.number}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">All</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm('Remove this steward from the show?')) {
                          removeMutation.mutate({ assignmentId: assignment.id });
                        }
                      }}
                      disabled={removeMutation.isPending}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
