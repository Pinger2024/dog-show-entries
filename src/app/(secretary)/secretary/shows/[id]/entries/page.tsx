'use client';

import { use, useState, useMemo } from 'react';
import {
  ArrowRight,
  Download,
  Edit3,
  Loader2,
  Plus,
  Search,
  Ticket,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { formatDogName } from '@/lib/utils';
import { formatCurrency } from '@/lib/date-utils';
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
import { EntryItem, entryStatusConfig, formatDate } from '../_lib/show-utils';

export default function EntriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: showId } = use(params);

  const { data: entriesData, isLoading: entriesLoading } = trpc.entries.getForShow.useQuery({ showId, limit: 100 });
  const entries = entriesData?.items ?? [];
  const total = entriesData?.total ?? 0;

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
    <>
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

          {entriesLoading ? (
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
            <>
              {/* Mobile card view */}
              <div className="space-y-3 sm:hidden">
                {filtered.map((entry) => {
                  const es = entryStatusConfig[entry.status] ?? {
                    label: entry.status,
                    variant: 'outline' as const,
                  };
                  return (
                    <div
                      key={entry.id}
                      className="rounded-lg border p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">
                            {entry.dog?.registeredName ?? '\u2014'}
                            {entry.isNfc && (
                              <Badge variant="outline" className="ml-1.5 text-[10px] align-middle">
                                NFC
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {entry.dog?.breed?.name ?? ''} &middot; {entry.exhibitor?.name ?? '\u2014'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant={es.variant}>{es.label}</Badge>
                          {entry.dog && (
                            <button
                              onClick={() => setEditingEntry(entry)}
                              className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                              title="Edit dog details"
                            >
                              <Edit3 className="size-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
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
                        <span className="text-sm font-semibold shrink-0 ml-2">
                          {formatCurrency(entry.totalFee)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop table view */}
              <div className="hidden sm:block overflow-x-auto -mx-4 px-4 lg:-mx-6 lg:px-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Exhibitor</TableHead>
                    <TableHead>Dog</TableHead>
                    <TableHead className="hidden md:table-cell">Breed</TableHead>
                    <TableHead>Classes</TableHead>
                    <TableHead>Fee</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Date</TableHead>
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
                              {entry.exhibitor?.name ?? '\u2014'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {entry.exhibitor?.email ?? ''}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {entry.dog?.registeredName ?? '\u2014'}
                          {entry.isNfc && (
                            <Badge variant="outline" className="ml-1.5 text-[10px]">
                              NFC
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{entry.dog?.breed?.name ?? '\u2014'}</TableCell>
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
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {formatDate(entry.createdAt)}
                        </TableCell>
                        <TableCell>
                          {entry.dog && (
                            <button
                              onClick={() => setEditingEntry(entry)}
                              className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
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
            </>
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
    </>
  );
}

// -- Edit Dog Dialog ----------------------------------------------------------

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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <Card className="w-full max-w-lg rounded-t-2xl sm:rounded-xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Edit Dog Details</CardTitle>
            <button
              onClick={onClose}
              className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
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

// -- Add Entry Dialog (Secretary-Initiated) -----------------------------------

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
            {step === 'classes' && `Select Classes \u2014 ${selectedDogName}`}
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
                    inputMode="email"
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
                inputMode="email"
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
