'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleDot,
  CircleMinus,
  Clock,
  FileText,
  Gavel,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { penceToPoundsString } from '@/lib/date-utils';
import { PHASE_CONFIG } from '@/lib/default-checklist';
import { deriveCurrentChecklistPhase } from '../_lib/phase-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
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
import { ListChecks } from 'lucide-react';
import { useShowId } from '../_lib/show-context';
import { ACTION_REGISTRY } from '../_components/checklist-action-registry';

type ChecklistPhase =
  | 'pre_planning'
  | 'planning'
  | 'pre_show'
  | 'final_prep'
  | 'show_day'
  | 'post_show';

type ChecklistStatus = 'not_started' | 'in_progress' | 'complete' | 'not_applicable';

const STATUS_ICONS: Record<ChecklistStatus, typeof Circle> = {
  not_started: Circle,
  in_progress: CircleDot,
  complete: CircleCheck,
  not_applicable: CircleMinus,
};

const STATUS_COLORS: Record<ChecklistStatus, string> = {
  not_started: 'text-muted-foreground',
  in_progress: 'text-blue-500',
  complete: 'text-green-500',
  not_applicable: 'text-muted-foreground/50',
};

export default function ShowChecklistPage() {
  const showId = useShowId();

  const utils = trpc.useUtils();
  const { data: showData } = trpc.shows.getById.useQuery({ id: showId });
  const currentChecklistPhase = deriveCurrentChecklistPhase(showData?.status ?? 'draft');
  const { data: items, isLoading: checklistLoading } = trpc.secretary.getChecklist.useQuery({
    showId,
  });
  const { data: autoDetect } = trpc.secretary.getChecklistAutoDetect.useQuery({
    showId,
  });
  const { data: judgeSummary } = trpc.secretary.getChecklistJudgeSummary.useQuery({
    showId,
  });

  const seedMutation = trpc.secretary.seedChecklist.useMutation({
    onSuccess: () => {
      utils.secretary.getChecklist.invalidate({ showId });
      toast.success('Checklist created with RKC requirements');
    },
  });
  const updateItemMut = trpc.secretary.updateChecklistItem.useMutation({
    onSuccess: () => {
      utils.secretary.getChecklist.invalidate({ showId });
    },
  });
  const addItemMut = trpc.secretary.addChecklistItem.useMutation({
    onSuccess: () => {
      utils.secretary.getChecklist.invalidate({ showId });
      setShowAddItem(false);
      setNewItem({ title: '', phase: 'pre_show', description: '' });
      toast.success('Item added');
    },
  });
  const deleteItemMut = trpc.secretary.deleteChecklistItem.useMutation({
    onSuccess: () => {
      utils.secretary.getChecklist.invalidate({ showId });
    },
  });
  const reseedMutation = trpc.secretary.reseedChecklistJudges.useMutation({
    onSuccess: (result) => {
      utils.secretary.getChecklist.invalidate({ showId });
      toast.success(`Synced: ${result.inserted} items added, ${result.marked} marked`);
    },
    onError: (err) => toast.error(err.message),
  });

  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(
    new Set([currentChecklistPhase])
  );
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({
    title: '',
    phase: 'pre_show' as ChecklistPhase,
    description: '',
  });
  // Collapsed per-judge groups: track which base titles are collapsed
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [pendingAction, setPendingAction] = useState<{ message: string; action: () => void } | null>(null);

  // Auto-generate checklist on first visit
  const isEmpty = !items || items.length === 0;
  const [autoSeeded, setAutoSeeded] = useState(false);
  useEffect(() => {
    if (isEmpty && !seedMutation.isPending && !autoSeeded) {
      setAutoSeeded(true);
      seedMutation.mutate({ showId });
    }
  }, [isEmpty, autoSeeded, seedMutation, showId]);

  // Build contract lookup by judgeId from judgeSummary (avoids separate query)
  const contractsByJudge = useMemo(() => {
    const map = new Map<string, NonNullable<typeof judgeSummary>['judges'][number]>();
    for (const j of judgeSummary?.judges ?? []) {
      if (j.stage) map.set(j.judgeId, j);
    }
    return map;
  }, [judgeSummary]);

  // Check if judge assignments are out of sync with checklist
  const needsReseed = useMemo(() => {
    if (!items || !judgeSummary) return false;
    const checklistJudgeIds = new Set(
      items.filter((i) => i.entityType === 'judge' && i.entityId).map((i) => i.entityId)
    );
    const assignedJudgeIds = new Set(judgeSummary.judges.map((j) => j.judgeId));
    // Check if any assigned judge is missing from checklist
    for (const id of assignedJudgeIds) {
      if (!checklistJudgeIds.has(id)) return true;
    }
    return false;
  }, [items, judgeSummary]);

  if (checklistLoading) {
    return (
      <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading checklist...
      </div>
    );
  }

  if (isEmpty) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <Loader2 className="size-8 animate-spin text-primary/40" />
          <div>
            <h3 className="text-lg font-semibold">Setting up your checklist</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              Creating your RKC-compliant show checklist with deadlines based on your show date...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const enrichedItems = items.map((item) => {
    const isAutoDetected =
      item.autoDetectKey && autoDetect?.[item.autoDetectKey] === true;
    return {
      ...item,
      effectiveStatus: isAutoDetected
        ? ('complete' as ChecklistStatus)
        : (item.status as ChecklistStatus),
      isAutoDetected: !!isAutoDetected,
    };
  });

  const phases = Object.entries(PHASE_CONFIG)
    .sort(([, a], [, b]) => a.sortOrder - b.sortOrder)
    .map(([key, config]) => {
      const phaseItems = enrichedItems
        .filter((it) => it.phase === key)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      return { key, ...config, items: phaseItems };
    })
    .filter((p) => p.items.length > 0);

  const total = enrichedItems.length;
  const completedCount = enrichedItems.filter(
    (i) => i.effectiveStatus === 'complete' || i.effectiveStatus === 'not_applicable'
  ).length;
  const overdueCount = enrichedItems.filter((i) => {
    if (i.effectiveStatus === 'complete' || i.effectiveStatus === 'not_applicable')
      return false;
    if (!i.dueDate) return false;
    return new Date(i.dueDate) < new Date();
  }).length;
  const dueSoonCount = enrichedItems.filter((i) => {
    if (i.effectiveStatus === 'complete' || i.effectiveStatus === 'not_applicable')
      return false;
    if (!i.dueDate) return false;
    const due = new Date(i.dueDate);
    const now = new Date();
    const twoWeeks = new Date();
    twoWeeks.setDate(twoWeeks.getDate() + 14);
    return due >= now && due <= twoWeeks;
  }).length;
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  function togglePhase(phase: string) {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });
  }

  function cycleStatus(item: (typeof enrichedItems)[number]) {
    if (item.isAutoDetected) return;
    const order: ChecklistStatus[] = ['not_started', 'in_progress', 'complete'];
    const idx = order.indexOf(item.status as ChecklistStatus);
    const next = order[(idx + 1) % order.length]!;
    updateItemMut.mutate({ itemId: item.id, status: next });
  }

  function formatItemDue(dateStr: string | null) {
    if (!dateStr) return null;
    const due = new Date(dateStr);
    return due.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  function getDueStatus(dateStr: string | null, status: ChecklistStatus) {
    if (!dateStr || status === 'complete' || status === 'not_applicable') return null;
    const due = new Date(dateStr);
    const now = new Date();
    const diff = Math.ceil(
      (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diff < 0) return 'overdue';
    if (diff <= 14) return 'soon';
    return null;
  }

  /** Get contract status line for a per-judge item */
  function getContractStatusLine(entityId: string | null) {
    if (!entityId) return null;
    const contract = contractsByJudge.get(entityId);
    if (!contract) return null;

    const stage = contract.stage;
    if (stage === 'offer_sent' && contract.offerSentAt) {
      const days = Math.floor((Date.now() - new Date(contract.offerSentAt).getTime()) / (1000 * 60 * 60 * 24));
      return { text: `Offer sent ${days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`} — awaiting response`, color: 'text-amber-600' };
    }
    if (stage === 'offer_accepted' && contract.acceptedAt) {
      const totalExpenses = (contract.hotelCost ?? 0) + (contract.travelCost ?? 0) + (contract.otherExpenses ?? 0);
      const expenseStr = totalExpenses > 0 ? ` — expenses £${penceToPoundsString(totalExpenses)}` : '';
      return { text: `Accepted on ${new Date(contract.acceptedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}${expenseStr}`, color: 'text-green-600' };
    }
    if (stage === 'confirmed') {
      return { text: `Confirmed${contract.confirmedAt ? ` on ${new Date(contract.confirmedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}`, color: 'text-green-600' };
    }
    if (stage === 'declined') {
      return { text: `Declined${contract.declinedAt ? ` on ${new Date(contract.declinedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}`, color: 'text-destructive' };
    }
    return null;
  }

  /** Group per-judge items by base title for collapsing */
  function groupPhaseItems(phaseItems: typeof enrichedItems) {
    // Find per-judge items that share the same actionKey
    const groups: {
      type: 'single' | 'group';
      items: typeof enrichedItems;
      baseTitle: string;
      actionKey: string | null;
    }[] = [];

    const actionKeyGroups = new Map<string, typeof enrichedItems>();
    const singles: typeof enrichedItems = [];

    for (const item of phaseItems) {
      if (item.entityType === 'judge' && item.actionKey) {
        const existing = actionKeyGroups.get(item.actionKey) ?? [];
        existing.push(item);
        actionKeyGroups.set(item.actionKey, existing);
      } else {
        singles.push(item);
      }
    }

    // Interleave singles and groups in sort order
    let singleIdx = 0;
    let groupKeys = [...actionKeyGroups.entries()].sort(
      (a, b) => (a[1][0]?.sortOrder ?? 0) - (b[1][0]?.sortOrder ?? 0)
    );
    let groupIdx = 0;

    while (singleIdx < singles.length || groupIdx < groupKeys.length) {
      const singleOrder = singleIdx < singles.length ? singles[singleIdx]!.sortOrder : Infinity;
      const groupOrder = groupIdx < groupKeys.length ? (groupKeys[groupIdx]![1][0]?.sortOrder ?? Infinity) : Infinity;

      if (singleOrder <= groupOrder && singleIdx < singles.length) {
        groups.push({ type: 'single', items: [singles[singleIdx]!], baseTitle: singles[singleIdx]!.title, actionKey: null });
        singleIdx++;
      } else if (groupIdx < groupKeys.length) {
        const [actionKey, groupItems] = groupKeys[groupIdx]!;
        if (groupItems.length > 5) {
          // Collapse into a group
          const baseTitle = groupItems[0]!.title.replace(/\s—\s.+$/, '');
          groups.push({ type: 'group', items: groupItems, baseTitle, actionKey });
        } else {
          // Too few to group — render individually
          for (const item of groupItems) {
            groups.push({ type: 'single', items: [item], baseTitle: item.title, actionKey: null });
          }
        }
        groupIdx++;
      }
    }

    return groups;
  }

  function renderItem(item: (typeof enrichedItems)[number]) {
    const StatusIcon = STATUS_ICONS[item.effectiveStatus] ?? Circle;
    const statusColor = STATUS_COLORS[item.effectiveStatus] ?? 'text-muted-foreground';
    const dueStatus = getDueStatus(item.dueDate, item.effectiveStatus);
    const isItemExpanded = expandedItem === item.id;
    const contractLine = item.entityType === 'judge' ? getContractStatusLine(item.entityId) : null;

    // Check if this item has an action panel
    const actionEntry = item.actionKey ? ACTION_REGISTRY[item.actionKey] : null;

    return (
      <div key={item.id} className="rounded-lg border">
        <div
          className={cn(
            'flex items-start gap-2 px-2 py-3 sm:gap-3 sm:px-4 sm:py-3',
            item.effectiveStatus === 'complete' && 'opacity-60',
            item.effectiveStatus === 'not_applicable' && 'opacity-40'
          )}
        >
          <button
            className={cn(
              'mt-0.5 shrink-0 rounded-full p-1 sm:p-0.5 transition-colors min-h-[36px] min-w-[36px] sm:min-h-[28px] sm:min-w-[28px] flex items-center justify-center',
              item.isAutoDetected ? 'cursor-default' : 'hover:bg-muted'
            )}
            onClick={(e) => {
              e.stopPropagation();
              cycleStatus(item);
            }}
            disabled={item.isAutoDetected}
            title={
              item.isAutoDetected
                ? 'Auto-detected from show data'
                : `Click to change status (${item.effectiveStatus.replace('_', ' ')})`
            }
          >
            <StatusIcon className={cn('size-5', statusColor)} />
          </button>

          <button
            className="flex-1 min-w-0 text-left"
            onClick={() => setExpandedItem(isItemExpanded ? null : item.id)}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  'text-sm font-medium',
                  item.effectiveStatus === 'complete' && 'line-through'
                )}
              >
                {item.title}
              </span>
              {item.isAutoDetected && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">
                  <Sparkles className="size-2.5 mr-0.5" />
                  Auto
                </Badge>
              )}
              {item.assignedToName && (
                <Badge variant="outline" className="text-xs px-1.5 py-0 h-4">
                  {item.assignedToName}
                </Badge>
              )}
              {actionEntry && (
                <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 border-blue-200 text-blue-600">
                  Action
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {/* Contract status line for per-judge items */}
              {contractLine && (
                <span className={cn('text-xs', contractLine.color)}>
                  {contractLine.text}
                </span>
              )}
              {!contractLine && item.dueDate && (
                <span
                  className={cn(
                    'text-xs',
                    dueStatus === 'overdue'
                      ? 'text-destructive font-medium'
                      : dueStatus === 'soon'
                        ? 'text-amber-600'
                        : 'text-muted-foreground'
                  )}
                >
                  {dueStatus === 'overdue' && 'Overdue — '}
                  {dueStatus === 'soon' && 'Due soon — '}
                  {formatItemDue(item.dueDate)}
                </span>
              )}
              {item.notes && (
                <MessageSquare className="size-3 text-muted-foreground" />
              )}
            </div>
          </button>

          <Button
            variant="ghost"
            size="icon"
            className="size-9 sm:size-7 shrink-0 text-muted-foreground"
            onClick={() => setExpandedItem(isItemExpanded ? null : item.id)}
          >
            {isItemExpanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </Button>
        </div>

        {/* Expanded detail panel */}
        {isItemExpanded && (
          <div className="border-t px-3 py-4 sm:px-4 space-y-4 sm:space-y-3 bg-muted/30">
            {/* Action panel (from registry) */}
            {actionEntry && (
              <div className={cn(
                'rounded-md border bg-background p-3',
                actionEntry.mode === 'replace' ? '' : 'mb-3'
              )}>
                <actionEntry.component
                  showId={showId}
                  itemId={item.id}
                  actionKey={item.actionKey ?? undefined}
                  entityId={item.entityId}
                  entityName={item.entityName}
                  onComplete={() => utils.secretary.getChecklist.invalidate({ showId })}
                />
              </div>
            )}

            {/* Default detail panel (hidden if action mode is 'replace') */}
            {(!actionEntry || actionEntry.mode === 'augment') && (
              <>
                {item.description && (
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                )}

                {item.isAutoDetected && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <Sparkles className="size-3" />
                    Remi detected this automatically from your show data
                  </p>
                )}

                {item.entityType === 'judge' && item.entityName && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Gavel className="size-3" />
                    Judge: {item.entityName}
                  </p>
                )}

                {item.documentExpiryDate && (
                  <p className={cn(
                    'text-xs flex items-center gap-1',
                    new Date(item.documentExpiryDate) < new Date()
                      ? 'text-destructive font-medium'
                      : new Date(item.documentExpiryDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                        ? 'text-amber-600'
                        : 'text-muted-foreground'
                  )}>
                    <FileText className="size-3" />
                    Document expires: {new Date(item.documentExpiryDate).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                    {new Date(item.documentExpiryDate) < new Date() && ' (EXPIRED)'}
                  </p>
                )}

                {/* Document upload section */}
                {item.requiresDocument && (
                  <div className="rounded-md border bg-background p-3 space-y-2">
                    <Label className="text-xs font-medium flex items-center gap-1">
                      <FileText className="size-3" />
                      Supporting Document
                    </Label>
                    {item.fileUpload ? (
                      <div className="flex items-center gap-2">
                        <a
                          href={item.fileUpload.publicUrl ?? '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1 truncate"
                        >
                          <FileText className="size-3 shrink-0" />
                          {item.fileUpload.fileName}
                        </a>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-10 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            updateItemMut.mutate({
                              itemId: item.id,
                              fileUploadId: null,
                            })
                          }
                          title="Remove document"
                        >
                          <X className="size-3" />
                        </Button>
                      </div>
                    ) : (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-muted transition-colors">
                          <Upload className="size-3" />
                          Upload document
                        </div>
                        <input
                          type="file"
                          className="sr-only"
                          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const formData = new FormData();
                            formData.append('file', file);
                            try {
                              const res = await fetch('/api/upload/checklist-document', {
                                method: 'POST',
                                body: formData,
                              });
                              if (!res.ok) {
                                const err = await res.json();
                                throw new Error(err.error ?? 'Upload failed');
                              }
                              const { id: fileId } = await res.json();
                              updateItemMut.mutate({ itemId: item.id, fileUploadId: fileId });
                              toast.success('Document uploaded');
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Failed to upload document');
                            }
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )}
                    {item.hasExpiry && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Expiry date</Label>
                        <Input
                          type="date"
                          className="h-8 text-xs w-auto"
                          defaultValue={item.documentExpiryDate ?? ''}
                          key={`expiry-${item.id}`}
                          onBlur={(e) =>
                            updateItemMut.mutate({
                              itemId: item.id,
                              documentExpiryDate: e.target.value || null,
                            })
                          }
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {!item.isAutoDetected && (
                    <div className="space-y-1">
                      <Label className="text-xs">Status</Label>
                      <Select
                        value={item.status as string}
                        onValueChange={(val) =>
                          updateItemMut.mutate({
                            itemId: item.id,
                            status: val as ChecklistStatus,
                          })
                        }
                      >
                        <SelectTrigger className="h-10 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="not_started">Not Started</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="complete">Complete</SelectItem>
                          <SelectItem value="not_applicable">Not Applicable</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label className="text-xs">Assigned to</Label>
                    <Input
                      className="h-10 text-sm"
                      placeholder="e.g. Amanda, Treasurer"
                      defaultValue={item.assignedToName ?? ''}
                      key={`assignee-${item.id}`}
                      onBlur={(e) =>
                        updateItemMut.mutate({
                          itemId: item.id,
                          assignedToName: e.target.value || null,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Notes</Label>
                  <Textarea
                    className="min-h-[60px] text-xs"
                    placeholder="Add notes..."
                    defaultValue={item.notes ?? ''}
                    key={`notes-${item.id}`}
                    onBlur={(e) =>
                      updateItemMut.mutate({
                        itemId: item.id,
                        notes: e.target.value || null,
                      })
                    }
                  />
                </div>

                {!item.autoDetectKey && (
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-destructive hover:text-destructive"
                      onClick={() => setPendingAction({
                        message: 'Remove this item from the checklist?',
                        action: () => {
                          deleteItemMut.mutate({ itemId: item.id });
                          setExpandedItem(null);
                        },
                      })}
                    >
                      <Trash2 className="size-3 mr-1" />
                      Remove
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{pct}%</span>
                <span className="text-sm text-muted-foreground">
                  ready ({completedCount} of {total} items)
                </span>
              </div>
              <Progress value={pct} className="h-3" />
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              {overdueCount > 0 && (
                <span className="flex items-center gap-1 text-destructive font-medium">
                  <AlertTriangle className="size-3.5" />
                  {overdueCount} overdue
                </span>
              )}
              {dueSoonCount > 0 && (
                <span className="flex items-center gap-1 text-amber-600">
                  <Clock className="size-3.5" />
                  {dueSoonCount} due soon
                </span>
              )}
              <span className="flex items-center gap-1 text-green-600">
                <CircleCheck className="size-3.5" />
                {completedCount} done
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Judge Contract Summary Card */}
      {judgeSummary && judgeSummary.summary.total > 0 && (
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-3">
              <Gavel className="size-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Judge Contracts</span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs mb-3">
              <span className="text-muted-foreground">
                {judgeSummary.summary.confirmed} of {judgeSummary.summary.total} judges confirmed
              </span>
              {judgeSummary.summary.declined > 0 && (
                <span className="text-destructive">{judgeSummary.summary.declined} declined</span>
              )}
              {judgeSummary.summary.offerSent > 0 && (
                <span className="text-amber-600">{judgeSummary.summary.offerSent} awaiting response</span>
              )}
              {judgeSummary.summary.accepted > 0 && (
                <span className="text-blue-600">{judgeSummary.summary.accepted} accepted (need confirmation)</span>
              )}
            </div>
            {/* Segmented progress bar */}
            <div className="flex h-2 rounded-full overflow-hidden bg-muted">
              {judgeSummary.summary.confirmed > 0 && (
                <div
                  className="bg-green-500 transition-all"
                  style={{ width: `${(judgeSummary.summary.confirmed / judgeSummary.summary.total) * 100}%` }}
                />
              )}
              {judgeSummary.summary.accepted > 0 && (
                <div
                  className="bg-blue-500 transition-all"
                  style={{ width: `${(judgeSummary.summary.accepted / judgeSummary.summary.total) * 100}%` }}
                />
              )}
              {judgeSummary.summary.offerSent > 0 && (
                <div
                  className="bg-amber-400 transition-all"
                  style={{ width: `${(judgeSummary.summary.offerSent / judgeSummary.summary.total) * 100}%` }}
                />
              )}
              {judgeSummary.summary.declined > 0 && (
                <div
                  className="bg-red-400 transition-all"
                  style={{ width: `${(judgeSummary.summary.declined / judgeSummary.summary.total) * 100}%` }}
                />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Auto-reseed banner */}
      {needsReseed && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <RefreshCw className="size-4 text-blue-600 shrink-0" />
          <div className="flex-1 text-sm text-blue-800">
            New judges have been added. Sync the checklist to create per-judge items.
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => reseedMutation.mutate({ showId })}
            disabled={reseedMutation.isPending}
          >
            {reseedMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Sync Checklist
          </Button>
        </div>
      )}

      {/* Phase sections */}
      {phases.map((phase) => {
        const expanded = expandedPhases.has(phase.key);
        const phaseComplete = phase.items.filter(
          (i) => i.effectiveStatus === 'complete' || i.effectiveStatus === 'not_applicable'
        ).length;
        const phaseTotal = phase.items.length;
        const phasePercent =
          phaseTotal > 0 ? Math.round((phaseComplete / phaseTotal) * 100) : 0;

        const groupedItems = groupPhaseItems(phase.items);

        const isCurrent = phase.key === currentChecklistPhase;
        const isPast = phase.sortOrder < (PHASE_CONFIG[currentChecklistPhase as keyof typeof PHASE_CONFIG]?.sortOrder ?? 0);

        return (
          <Card key={phase.key} className={isCurrent ? 'border-primary/30 ring-1 ring-primary/10' : isPast && phasePercent === 100 ? 'opacity-60' : ''}>
            <button
              className="flex w-full items-center gap-2 px-3 py-3 sm:gap-3 sm:px-6 sm:py-4 text-left hover:bg-muted/50 active:bg-muted/70 transition-colors"
              onClick={() => togglePhase(phase.key)}
            >
              {expanded ? (
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm sm:text-base truncate">
                    {phase.label}
                  </h3>
                  {isCurrent && (
                    <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                      Now
                    </span>
                  )}
                  {isPast && phasePercent === 100 && (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      Done
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground shrink-0">
                    {phaseComplete}/{phaseTotal}
                  </span>
                </div>
                <Progress value={phasePercent} className="mt-1.5 h-1.5" />
              </div>
              {phasePercent === 100 && (
                <CircleCheck className="size-5 shrink-0 text-green-500" />
              )}
            </button>

            {expanded && (
              <CardContent className="pt-0 pb-2 px-2 sm:px-6 space-y-1">
                {groupedItems.map((group) => {
                  if (group.type === 'single') {
                    return renderItem(group.items[0]!);
                  }

                  // Render a collapsible group
                  const groupKey = `${phase.key}-${group.actionKey}`;
                  const isCollapsed = collapsedGroups.has(groupKey);
                  const doneCount = group.items.filter(
                    (i) => i.effectiveStatus === 'complete' || i.effectiveStatus === 'not_applicable'
                  ).length;
                  const incomplete = group.items.filter(
                    (i) => i.effectiveStatus !== 'complete' && i.effectiveStatus !== 'not_applicable'
                  );

                  return (
                    <div key={groupKey} className="rounded-lg border">
                      <button
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                        onClick={() => {
                          setCollapsedGroups((prev) => {
                            const next = new Set(prev);
                            if (next.has(groupKey)) next.delete(groupKey);
                            else next.add(groupKey);
                            return next;
                          });
                        }}
                      >
                        {isCollapsed ? (
                          <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
                        )}
                        <Gavel className="size-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium flex-1">
                          {group.baseTitle}
                        </span>
                        <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 shrink-0">
                          {doneCount}/{group.items.length} done
                        </Badge>
                      </button>
                      {!isCollapsed && (
                        <div className="border-t px-2 pb-2 pt-1 space-y-1">
                          {/* Show incomplete first, then completed */}
                          {incomplete.map((item) => renderItem(item))}
                          {doneCount > 0 && incomplete.length > 0 && (
                            <p className="text-xs text-muted-foreground px-3 py-1">
                              + {doneCount} completed
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Add custom item */}
      <Card>
        <CardContent className="pt-4 pb-4">
          {showAddItem ? (
            <div className="space-y-3">
              <Input
                placeholder="Item title"
                value={newItem.title}
                onChange={(e) => setNewItem((p) => ({ ...p, title: e.target.value }))}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  value={newItem.phase}
                  onValueChange={(val) =>
                    setNewItem((p) => ({ ...p, phase: val as ChecklistPhase }))
                  }
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Phase" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PHASE_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Description (optional)"
                  value={newItem.description}
                  onChange={(e) => setNewItem((p) => ({ ...p, description: e.target.value }))}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" className="min-h-[2.75rem]" onClick={() => setShowAddItem(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="min-h-[2.75rem]"
                  onClick={() =>
                    addItemMut.mutate({
                      showId,
                      title: newItem.title,
                      phase: newItem.phase,
                      description: newItem.description || undefined,
                    })
                  }
                  disabled={!newItem.title || addItemMut.isPending}
                >
                  {addItemMut.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Plus className="size-3" />
                  )}
                  Add
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setShowAddItem(true)}>
              <Plus className="size-4" />
              Add Custom Item
            </Button>
          )}
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
            <AlertDialogAction onClick={() => { pendingAction?.action(); setPendingAction(null); }}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
