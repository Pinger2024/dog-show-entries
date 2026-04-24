'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import {
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  GripVertical,
  Hash,
  Loader2,
  Plus,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { formatCurrency, penceToPoundsString, poundsToPence } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import { CLASS_TEMPLATES, getRelevantTemplates } from '@/lib/class-templates';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

// ── Class Manager ─────────────────────────────────────────────

interface ClassManagerProps {
  showId: string;
  showType: string;
  showScope?: string;
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

export function ClassManager({ showId, showType, showScope, classes }: ClassManagerProps) {
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

  const resortMutation = trpc.secretary.resortShowClasses.useMutation({
    onSuccess: (data) => {
      utils.shows.getById.invalidate({ id: showId });
      const parts: string[] = [];
      if (data.deleted > 0) parts.push(`${data.deleted} duplicate${data.deleted === 1 ? '' : 's'} removed`);
      parts.push(`${data.resorted} classes re-sorted & numbered`);
      toast.success(parts.join(', '));
    },
    onError: (err) => toast.error(err.message ?? 'Failed to fix class order'),
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
      // Group by sex only (no sub-grouping by type) so classes display
      // in their correct sortOrder — this avoids Veteran (type: 'age')
      // appearing before achievement classes.
      const sexOrder = ['dog', 'bitch', null] as const;

      for (const sex of sexOrder) {
        const sexClasses = effectiveClasses.filter((sc) =>
          sex === null ? !sc.sex : sc.sex === sex
        );
        if (sexClasses.length === 0) continue;

        // For sexless classes, label them "Junior Handling" if that's what they all are
        const allJuniorHandling = sex === null && sexClasses.every(
          (sc) => sc.classDefinition?.type === 'junior_handler'
        );
        const sexLabel = sex === 'dog'
          ? 'Dog Classes'
          : sex === 'bitch'
            ? 'Bitch Classes'
            : allJuniorHandling
              ? 'Junior Handling'
              : 'Any Sex Classes';
        const sorted = [...sexClasses].sort((a, b) => a.sortOrder - b.sortOrder);
        groups.push({
          key: `${sex}`,
          label: sexLabel,
          classes: sorted,
        });
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

  // Championship shows: compute which breeds are missing required Open + Limit classes.
  // For single-breed shows, classes may not carry an explicit breed FK — the breed is
  // implicit via the show's scope. Resolve a fallback breed name so those classes still
  // count toward their (single) breed's requirement.
  const championshipWarnings = useMemo(() => {
    if (showType !== 'championship') return [];

    const fallbackBreedName = showScope === 'single_breed'
      ? classes.find((c) => c.breed?.name)?.breed?.name ?? null
      : null;

    const breedMap = new Map<string, { name: string; hasOpenDog: boolean; hasOpenBitch: boolean; hasLimitDog: boolean; hasLimitBitch: boolean }>();
    for (const sc of classes) {
      const breedName = sc.breed?.name ?? fallbackBreedName;
      if (!breedName) continue;
      if (!breedMap.has(breedName)) {
        breedMap.set(breedName, { name: breedName, hasOpenDog: false, hasOpenBitch: false, hasLimitDog: false, hasLimitBitch: false });
      }
      const entry = breedMap.get(breedName)!;
      const className = sc.classDefinition?.name?.toLowerCase() ?? '';
      if (className === 'open' && sc.sex === 'dog') entry.hasOpenDog = true;
      if (className === 'open' && sc.sex === 'bitch') entry.hasOpenBitch = true;
      if (className === 'limit' && sc.sex === 'dog') entry.hasLimitDog = true;
      if (className === 'limit' && sc.sex === 'bitch') entry.hasLimitBitch = true;
    }
    const warnings: { breed: string; missing: string[] }[] = [];
    for (const [, entry] of breedMap) {
      const missing: string[] = [];
      if (!entry.hasOpenDog) missing.push('Open Dog');
      if (!entry.hasOpenBitch) missing.push('Open Bitch');
      if (!entry.hasLimitDog) missing.push('Limit Dog');
      if (!entry.hasLimitBitch) missing.push('Limit Bitch');
      if (missing.length > 0) warnings.push({ breed: entry.name, missing });
    }
    return warnings;
  }, [showType, showScope, classes]);

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
      {/* Championship class requirement warning */}
      {championshipWarnings.length > 0 && (
        <div className="mx-4 mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Championship shows require Open and Limit classes for each sex per RKC regulations
              </p>
              <ul className="space-y-0.5">
                {championshipWarnings.map((w) => (
                  <li key={w.breed} className="text-xs text-amber-700 dark:text-amber-300">
                    <span className="font-medium">{w.breed}</span>: missing {w.missing.join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
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
                          <Badge variant="outline" className="text-xs font-normal tabular-nums">
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

                            <Badge variant="secondary" className="shrink-0 gap-1 text-xs font-medium tabular-nums">
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
                                                <Badge variant="outline" className="text-xs">
                                                  {sc.sex === 'dog' ? 'Dog' : 'Bitch'}
                                                </Badge>
                                              ) : (
                                                <span className="text-xs text-muted-foreground">Any sex</span>
                                              )}
                                              {!isMultiBreed && sc.breed && (
                                                <span className="truncate text-xs text-muted-foreground">{sc.breed.name}</span>
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

export function BulkClassCreator({ showId }: { showId: string }) {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedBreedIds, setSelectedBreedIds] = useState<string[]>([]);
  const [selectedClassDefIds, setSelectedClassDefIds] = useState<string[]>([]);
  const [splitBySex, setSplitBySex] = useState(false);
  const [feeInput, setFeeInput] = useState('');

  const { data: showData } = trpc.shows.getById.useQuery({ id: showId });
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

  // Auto-select matching class defs when template or classDefs changes
  // This fixes the race condition where clicking a template before
  // classDefs loads would leave all checkboxes unchecked
  // Auto-select class defs + breeds when template changes
  useEffect(() => {
    if (template && classDefs) {
      const ids = classDefs
        .filter((cd) => template.classNames.includes(cd.name))
        .map((cd) => cd.id);
      setSelectedClassDefIds(ids);
    }
    // For non-handling templates, pre-select all breeds
    if (template && !template.isHandling && breeds) {
      setSelectedBreedIds(breeds.map((b) => b.id));
    }
  }, [template, classDefs, breeds]);

  function handleSelectTemplate(templateId: string) {
    const t = CLASS_TEMPLATES.find((t) => t.id === templateId);
    setSelectedTemplate(templateId);
    setSplitBySex(t?.splitBySex ?? false);
    setFeeInput(penceToPoundsString(t?.defaultFeePence ?? 500));
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
          {getRelevantTemplates(showData?.showType ?? undefined).map((t) => (
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
                <p className="mb-2 text-xs text-muted-foreground">
                  Select the breeds for your show, or use &quot;Select All&quot; for an all-breed show.
                </p>
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
                <Label className="text-sm font-medium">Per-Class Fee (&pound;)</Label>
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
                  Pre-filled from template &middot; {feeInput ? formatCurrency(poundsToPence(parseFloat(feeInput)) || 0) : '£0.00'}
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

export function AddIndividualClass({ showId }: { showId: string }) {
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
            <Label className="text-sm font-medium">Per-Class Fee (&pound;)</Label>
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
