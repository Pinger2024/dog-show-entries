'use client';

import { useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import {
  Database,
  Layers,
  Dog,
  ListOrdered,
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  Loader2,
  Search,
  ChevronRight,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
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

// ── Types ─────────────────────────────────────────────────

type ClassType = 'age' | 'achievement' | 'special' | 'junior_handler';

const CLASS_TYPE_LABELS: Record<ClassType, string> = {
  age: 'Age-based',
  achievement: 'Achievement',
  special: 'Special',
  junior_handler: 'Junior Handler',
};

const CLASS_TYPE_COLORS: Record<ClassType, string> = {
  age: 'bg-blue-100 text-blue-800',
  achievement: 'bg-purple-100 text-purple-800',
  special: 'bg-amber-100 text-amber-800',
  junior_handler: 'bg-emerald-100 text-emerald-800',
};

// ── Main Page ─────────────────────────────────────────────

export default function ReferenceDataPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">
          You don&apos;t have permission to view this page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <div>
        <h1 className="font-serif text-lg sm:text-xl lg:text-2xl font-bold tracking-tight">
          Reference Data
        </h1>
        <p className="mt-1 sm:mt-1.5 text-sm sm:text-base text-muted-foreground">
          Manage breed groups, breeds, and class definitions used across all
          shows.
        </p>
      </div>

      <StatsCards />

      <Tabs defaultValue="breed-groups" className="space-y-4">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="breed-groups" className="gap-1.5">
            <Layers className="size-4" />
            <span className="hidden sm:inline">Breed Groups</span>
            <span className="sm:hidden">Groups</span>
          </TabsTrigger>
          <TabsTrigger value="breeds" className="gap-1.5">
            <Dog className="size-4" />
            Breeds
          </TabsTrigger>
          <TabsTrigger value="classes" className="gap-1.5">
            <ListOrdered className="size-4" />
            Classes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="breed-groups">
          <BreedGroupsTab />
        </TabsContent>
        <TabsContent value="breeds">
          <BreedsTab />
        </TabsContent>
        <TabsContent value="classes">
          <ClassDefinitionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Stats Cards ───────────────────────────────────────────

function StatsCards() {
  const { data: stats } = trpc.admin.getStats.useQuery();
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="text-sm font-medium">
            Breed Groups
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{stats?.breedGroups ?? '—'}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="text-sm font-medium">
            Breeds
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{stats?.breeds ?? '—'}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="text-sm font-medium">
            Class Definitions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">
            {stats?.classDefinitions ?? '—'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Breed Groups Tab ──────────────────────────────────────

function BreedGroupsTab() {
  const utils = trpc.useUtils();
  const { data: groups, isLoading } = trpc.admin.listBreedGroups.useQuery();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<{
    id: string;
    name: string;
    sortOrder: number;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState(0);

  const createMutation = trpc.admin.createBreedGroup.useMutation({
    onSuccess: () => {
      toast.success('Breed group created');
      closeDialog();
      utils.admin.listBreedGroups.invalidate();
      utils.admin.getStats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.admin.updateBreedGroup.useMutation({
    onSuccess: () => {
      toast.success('Breed group updated');
      closeDialog();
      utils.admin.listBreedGroups.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.admin.deleteBreedGroup.useMutation({
    onSuccess: () => {
      toast.success('Breed group deleted');
      setDeleteTarget(null);
      utils.admin.listBreedGroups.invalidate();
      utils.admin.getStats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function openCreate() {
    setEditingGroup(null);
    setName('');
    setSortOrder(groups?.length ?? 0);
    setDialogOpen(true);
  }

  function openEdit(group: { id: string; name: string; sortOrder: number }) {
    setEditingGroup(group);
    setName(group.name);
    setSortOrder(group.sortOrder);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingGroup(null);
    setName('');
    setSortOrder(0);
  }

  function handleSave() {
    if (editingGroup) {
      updateMutation.mutate({ id: editingGroup.id, name, sortOrder });
    } else {
      createMutation.mutate({ name, sortOrder });
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base sm:text-lg">
                Breed Groups
              </CardTitle>
              <CardDescription>
                KC breed groups that organise breeds (e.g. Gundog, Hound,
                Pastoral).
              </CardDescription>
            </div>
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" />
              Add Group
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : !groups || groups.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No breed groups yet"
              description="Create your first breed group to start organising breeds."
            />
          ) : (
            <div className="space-y-2">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded bg-primary/10 text-xs font-bold text-primary">
                    {group.sortOrder + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{group.name}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(group)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() =>
                        setDeleteTarget({ id: group.id, name: group.name })
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingGroup ? 'Edit Breed Group' : 'New Breed Group'}
            </DialogTitle>
            <DialogDescription>
              {editingGroup
                ? 'Update the breed group details.'
                : 'Create a new breed group for organising breeds.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="bg-name">Name</Label>
              <Input
                id="bg-name"
                placeholder="e.g. Gundog"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bg-order">Sort Order</Label>
              <Input
                id="bg-order"
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Lower numbers appear first.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!name.trim() || isPending}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {editingGroup ? 'Save Changes' : 'Create Group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this breed group. Any breeds
              currently in this group must be moved first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })
              }
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Breeds Tab ────────────────────────────────────────────

function BreedsTab() {
  const utils = trpc.useUtils();
  const { data: groups } = trpc.admin.listBreedGroups.useQuery();
  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>();
  const [search, setSearch] = useState('');

  const { data: breeds, isLoading } = trpc.admin.listBreeds.useQuery({
    groupId: selectedGroupId,
    search: search || undefined,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBreed, setEditingBreed] = useState<{
    id: string;
    name: string;
    groupId: string;
    kcBreedCode: string | null;
    variety: string | null;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [breedName, setBreedName] = useState('');
  const [breedGroupId, setBreedGroupId] = useState('');
  const [kcBreedCode, setKcBreedCode] = useState('');
  const [variety, setVariety] = useState('');

  const createMutation = trpc.admin.createBreed.useMutation({
    onSuccess: () => {
      toast.success('Breed created');
      closeDialog();
      utils.admin.listBreeds.invalidate();
      utils.admin.getStats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.admin.updateBreed.useMutation({
    onSuccess: () => {
      toast.success('Breed updated');
      closeDialog();
      utils.admin.listBreeds.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.admin.deleteBreed.useMutation({
    onSuccess: () => {
      toast.success('Breed deleted');
      setDeleteTarget(null);
      utils.admin.listBreeds.invalidate();
      utils.admin.getStats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function openCreate() {
    setEditingBreed(null);
    setBreedName('');
    setBreedGroupId(selectedGroupId ?? groups?.[0]?.id ?? '');
    setKcBreedCode('');
    setVariety('');
    setDialogOpen(true);
  }

  function openEdit(breed: NonNullable<typeof editingBreed>) {
    setEditingBreed(breed);
    setBreedName(breed.name);
    setBreedGroupId(breed.groupId);
    setKcBreedCode(breed.kcBreedCode ?? '');
    setVariety(breed.variety ?? '');
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingBreed(null);
  }

  function handleSave() {
    if (editingBreed) {
      updateMutation.mutate({
        id: editingBreed.id,
        name: breedName,
        groupId: breedGroupId,
        kcBreedCode: kcBreedCode || null,
        variety: variety || null,
      });
    } else {
      createMutation.mutate({
        name: breedName,
        groupId: breedGroupId,
        kcBreedCode: kcBreedCode || undefined,
        variety: variety || undefined,
      });
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base sm:text-lg">Breeds</CardTitle>
              <CardDescription>
                All registered breeds, organised by group.
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={openCreate}
              disabled={!groups || groups.length === 0}
            >
              <Plus className="size-4" />
              Add Breed
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search breeds..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={selectedGroupId ?? 'all'}
              onValueChange={(v) =>
                setSelectedGroupId(v === 'all' ? undefined : v)
              }
            >
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="All groups" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All groups</SelectItem>
                {groups?.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : !breeds || breeds.length === 0 ? (
            <EmptyState
              icon={Dog}
              title="No breeds found"
              description={
                search
                  ? 'Try a different search term.'
                  : 'Add your first breed to get started.'
              }
            />
          ) : (
            <div className="space-y-2">
              {breeds.map((breed) => (
                <div
                  key={breed.id}
                  className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{breed.name}</p>
                      {breed.variety && (
                        <Badge variant="outline" className="text-xs">
                          {breed.variety}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                      <span>{breed.group?.name ?? 'No group'}</span>
                      {breed.kcBreedCode && (
                        <span className="font-mono">
                          KC: {breed.kcBreedCode}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        openEdit({
                          id: breed.id,
                          name: breed.name,
                          groupId: breed.groupId,
                          kcBreedCode: breed.kcBreedCode,
                          variety: breed.variety,
                        })
                      }
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() =>
                        setDeleteTarget({ id: breed.id, name: breed.name })
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              <p className="pt-2 text-center text-xs text-muted-foreground">
                {breeds.length} breed{breeds.length !== 1 ? 's' : ''} shown
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingBreed ? 'Edit Breed' : 'New Breed'}
            </DialogTitle>
            <DialogDescription>
              {editingBreed
                ? 'Update the breed details.'
                : 'Register a new breed.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="breed-name">Breed Name</Label>
              <Input
                id="breed-name"
                placeholder="e.g. German Shepherd Dog"
                value={breedName}
                onChange={(e) => setBreedName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="breed-group">Breed Group</Label>
              <Select value={breedGroupId} onValueChange={setBreedGroupId}>
                <SelectTrigger id="breed-group">
                  <SelectValue placeholder="Select a group" />
                </SelectTrigger>
                <SelectContent>
                  {groups?.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="breed-kc">KC Breed Code</Label>
                <Input
                  id="breed-kc"
                  placeholder="e.g. 2105"
                  value={kcBreedCode}
                  onChange={(e) => setKcBreedCode(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="breed-variety">Variety</Label>
                <Input
                  id="breed-variety"
                  placeholder="e.g. Long Coat"
                  value={variety}
                  onChange={(e) => setVariety(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!breedName.trim() || !breedGroupId || isPending}
            >
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {editingBreed ? 'Save Changes' : 'Create Breed'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this breed. This cannot be undone.
              Any dogs registered with this breed may be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })
              }
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Class Definitions Tab ─────────────────────────────────

function ClassDefinitionsTab() {
  const utils = trpc.useUtils();
  const [filterType, setFilterType] = useState<ClassType | 'all'>('all');

  const { data: classes, isLoading } =
    trpc.admin.listClassDefinitions.useQuery(
      filterType === 'all' ? {} : { type: filterType }
    );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<{
    id: string;
    name: string;
    type: ClassType;
    description: string | null;
    minAgeMonths: number | null;
    maxAgeMonths: number | null;
    maxWins: number | null;
    sortOrder: number;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [className, setClassName] = useState('');
  const [classType, setClassType] = useState<ClassType>('age');
  const [classDescription, setClassDescription] = useState('');
  const [minAgeMonths, setMinAgeMonths] = useState('');
  const [maxAgeMonths, setMaxAgeMonths] = useState('');
  const [maxWins, setMaxWins] = useState('');
  const [classSortOrder, setClassSortOrder] = useState(0);

  const createMutation = trpc.admin.createClassDefinition.useMutation({
    onSuccess: () => {
      toast.success('Class definition created');
      closeDialog();
      utils.admin.listClassDefinitions.invalidate();
      utils.admin.getStats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.admin.updateClassDefinition.useMutation({
    onSuccess: () => {
      toast.success('Class definition updated');
      closeDialog();
      utils.admin.listClassDefinitions.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.admin.deleteClassDefinition.useMutation({
    onSuccess: () => {
      toast.success('Class definition deleted');
      setDeleteTarget(null);
      utils.admin.listClassDefinitions.invalidate();
      utils.admin.getStats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function openCreate() {
    setEditingClass(null);
    setClassName('');
    setClassType('age');
    setClassDescription('');
    setMinAgeMonths('');
    setMaxAgeMonths('');
    setMaxWins('');
    setClassSortOrder(classes?.length ?? 0);
    setDialogOpen(true);
  }

  function openEdit(cls: NonNullable<typeof editingClass>) {
    setEditingClass(cls);
    setClassName(cls.name);
    setClassType(cls.type);
    setClassDescription(cls.description ?? '');
    setMinAgeMonths(cls.minAgeMonths?.toString() ?? '');
    setMaxAgeMonths(cls.maxAgeMonths?.toString() ?? '');
    setMaxWins(cls.maxWins?.toString() ?? '');
    setClassSortOrder(cls.sortOrder);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingClass(null);
  }

  function handleSave() {
    const base = {
      name: className,
      type: classType,
      description: classDescription || undefined,
      minAgeMonths: minAgeMonths ? parseInt(minAgeMonths) : undefined,
      maxAgeMonths: maxAgeMonths ? parseInt(maxAgeMonths) : undefined,
      maxWins: maxWins ? parseInt(maxWins) : undefined,
      sortOrder: classSortOrder,
    };

    if (editingClass) {
      updateMutation.mutate({
        id: editingClass.id,
        ...base,
        description: classDescription || null,
        minAgeMonths: minAgeMonths ? parseInt(minAgeMonths) : null,
        maxAgeMonths: maxAgeMonths ? parseInt(maxAgeMonths) : null,
        maxWins: maxWins ? parseInt(maxWins) : null,
      });
    } else {
      createMutation.mutate(base);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  // Group classes by type for display
  const grouped = useMemo(() => {
    if (!classes) return {};
    const result: Record<string, typeof classes> = {};
    for (const cls of classes) {
      result[cls.type] ??= [];
      result[cls.type].push(cls);
    }
    return result;
  }, [classes]);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base sm:text-lg">
                Class Definitions
              </CardTitle>
              <CardDescription>
                Standard show classes with eligibility rules. These are
                templates that get added to individual shows.
              </CardDescription>
            </div>
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" />
              Add Class
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Type filter */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={filterType === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterType('all')}
            >
              All
            </Button>
            {(
              Object.entries(CLASS_TYPE_LABELS) as [ClassType, string][]
            ).map(([key, label]) => (
              <Button
                key={key}
                variant={filterType === key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType(key)}
              >
                {label}
              </Button>
            ))}
          </div>

          {/* List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : !classes || classes.length === 0 ? (
            <EmptyState
              icon={ListOrdered}
              title="No class definitions found"
              description="Add your first class definition to get started."
            />
          ) : filterType === 'all' ? (
            // Grouped view
            <div className="space-y-6">
              {(
                Object.entries(CLASS_TYPE_LABELS) as [ClassType, string][]
              ).map(([type, typeLabel]) => {
                const items = grouped[type];
                if (!items || items.length === 0) return null;
                return (
                  <div key={type}>
                    <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                      {typeLabel}
                    </h3>
                    <div className="space-y-2">
                      {items.map((cls) => (
                        <ClassDefinitionRow
                          key={cls.id}
                          cls={cls}
                          onEdit={() =>
                            openEdit({
                              id: cls.id,
                              name: cls.name,
                              type: cls.type as ClassType,
                              description: cls.description,
                              minAgeMonths: cls.minAgeMonths,
                              maxAgeMonths: cls.maxAgeMonths,
                              maxWins: cls.maxWins,
                              sortOrder: cls.sortOrder,
                            })
                          }
                          onDelete={() =>
                            setDeleteTarget({ id: cls.id, name: cls.name })
                          }
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // Flat view when filtered
            <div className="space-y-2">
              {classes.map((cls) => (
                <ClassDefinitionRow
                  key={cls.id}
                  cls={cls}
                  onEdit={() =>
                    openEdit({
                      id: cls.id,
                      name: cls.name,
                      type: cls.type as ClassType,
                      description: cls.description,
                      minAgeMonths: cls.minAgeMonths,
                      maxAgeMonths: cls.maxAgeMonths,
                      maxWins: cls.maxWins,
                      sortOrder: cls.sortOrder,
                    })
                  }
                  onDelete={() =>
                    setDeleteTarget({ id: cls.id, name: cls.name })
                  }
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingClass ? 'Edit Class Definition' : 'New Class Definition'}
            </DialogTitle>
            <DialogDescription>
              {editingClass
                ? 'Update the class definition details.'
                : 'Define a new show class template.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cls-name">Class Name</Label>
                <Input
                  id="cls-name"
                  placeholder="e.g. Minor Puppy"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cls-type">Type</Label>
                <Select
                  value={classType}
                  onValueChange={(v) => setClassType(v as ClassType)}
                >
                  <SelectTrigger id="cls-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.entries(CLASS_TYPE_LABELS) as [
                        ClassType,
                        string,
                      ][]
                    ).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cls-desc">Description</Label>
              <Textarea
                id="cls-desc"
                placeholder="Eligibility criteria, rules, etc."
                value={classDescription}
                onChange={(e) => setClassDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="cls-min-age">Min Age (months)</Label>
                <Input
                  id="cls-min-age"
                  type="number"
                  min={0}
                  placeholder="—"
                  value={minAgeMonths}
                  onChange={(e) => setMinAgeMonths(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cls-max-age">Max Age (months)</Label>
                <Input
                  id="cls-max-age"
                  type="number"
                  min={0}
                  placeholder="—"
                  value={maxAgeMonths}
                  onChange={(e) => setMaxAgeMonths(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cls-max-wins">Max Wins</Label>
                <Input
                  id="cls-max-wins"
                  type="number"
                  min={0}
                  placeholder="—"
                  value={maxWins}
                  onChange={(e) => setMaxWins(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cls-order">Sort Order</Label>
              <Input
                id="cls-order"
                type="number"
                min={0}
                value={classSortOrder}
                onChange={(e) =>
                  setClassSortOrder(parseInt(e.target.value) || 0)
                }
              />
              <p className="text-xs text-muted-foreground">
                Controls the order classes appear in show schedules.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!className.trim() || isPending}
            >
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {editingClass ? 'Save Changes' : 'Create Class'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this class definition. Shows that
              currently use this class may be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })
              }
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Shared Components ─────────────────────────────────────

function ClassDefinitionRow({
  cls,
  onEdit,
  onDelete,
}: {
  cls: {
    id: string;
    name: string;
    type: string;
    description: string | null;
    minAgeMonths: number | null;
    maxAgeMonths: number | null;
    maxWins: number | null;
    sortOrder: number;
  };
  onEdit: () => void;
  onDelete: () => void;
}) {
  const type = cls.type as ClassType;
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
      <span className="flex size-8 shrink-0 items-center justify-center rounded bg-primary/10 text-xs font-bold text-primary">
        {cls.sortOrder + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{cls.name}</p>
          <Badge className={cn('text-[10px]', CLASS_TYPE_COLORS[type])}>
            {CLASS_TYPE_LABELS[type]}
          </Badge>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
          {cls.minAgeMonths != null && (
            <span>Min: {cls.minAgeMonths}m</span>
          )}
          {cls.maxAgeMonths != null && (
            <span>Max: {cls.maxAgeMonths}m</span>
          )}
          {cls.maxWins != null && <span>Max wins: {cls.maxWins}</span>}
          {cls.description && (
            <span className="truncate max-w-[200px]">{cls.description}</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Database;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
      <Icon className="size-8 text-muted-foreground/50" />
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
