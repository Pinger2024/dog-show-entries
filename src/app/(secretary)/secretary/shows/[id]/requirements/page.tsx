'use client';

import { use, useState } from 'react';
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
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { PHASE_CONFIG } from '@/lib/default-checklist';
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
import { ListChecks } from 'lucide-react';

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

export default function RequirementsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: showId } = use(params);

  const utils = trpc.useUtils();
  const { data: items, isLoading: checklistLoading } = trpc.secretary.getChecklist.useQuery({
    showId,
  });
  const { data: autoDetect } = trpc.secretary.getChecklistAutoDetect.useQuery({
    showId,
  });
  const seedMutation = trpc.secretary.seedChecklist.useMutation({
    onSuccess: () => {
      utils.secretary.getChecklist.invalidate({ showId });
      toast.success('Checklist created with KC requirements');
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

  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(
    new Set(['pre_planning', 'planning', 'pre_show', 'final_prep', 'show_day', 'post_show'])
  );
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({
    title: '',
    phase: 'pre_show' as ChecklistPhase,
    description: '',
  });

  if (checklistLoading) {
    return (
      <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading requirements...
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <ListChecks className="size-12 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-semibold">Show Requirements Checklist</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              Set up your show requirements checklist based on KC regulations.
              This includes everything from licence applications to post-show
              reporting, with deadlines auto-calculated from your show date.
            </p>
          </div>
          <Button
            onClick={() => seedMutation.mutate({ showId })}
            disabled={seedMutation.isPending}
          >
            {seedMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            Generate KC Checklist
          </Button>
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

      {/* Phase sections */}
      {phases.map((phase) => {
        const expanded = expandedPhases.has(phase.key);
        const phaseComplete = phase.items.filter(
          (i) => i.effectiveStatus === 'complete' || i.effectiveStatus === 'not_applicable'
        ).length;
        const phaseTotal = phase.items.length;
        const phasePercent =
          phaseTotal > 0 ? Math.round((phaseComplete / phaseTotal) * 100) : 0;

        return (
          <Card key={phase.key}>
            <button
              className="flex w-full items-center gap-3 px-4 py-3 sm:px-6 sm:py-4 text-left hover:bg-muted/50 transition-colors"
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
              <CardContent className="pt-0 pb-3 px-3 sm:px-6 space-y-1">
                {phase.items.map((item) => {
                  const StatusIcon =
                    STATUS_ICONS[item.effectiveStatus] ?? Circle;
                  const statusColor =
                    STATUS_COLORS[item.effectiveStatus] ?? 'text-muted-foreground';
                  const dueStatus = getDueStatus(
                    item.dueDate,
                    item.effectiveStatus
                  );
                  const isItemExpanded = expandedItem === item.id;

                  return (
                    <div key={item.id} className="rounded-lg border">
                      <div
                        className={cn(
                          'flex items-start gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3',
                          item.effectiveStatus === 'complete' && 'opacity-60',
                          item.effectiveStatus === 'not_applicable' && 'opacity-40'
                        )}
                      >
                        <button
                          className={cn(
                            'mt-0.5 shrink-0 rounded-full p-0.5 transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center',
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
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                                <Sparkles className="size-2.5 mr-0.5" />
                                Auto
                              </Badge>
                            )}
                            {item.assignedToName && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                                {item.assignedToName}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {item.dueDate && (
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
                          className="size-7 shrink-0 text-muted-foreground"
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
                        <div className="border-t px-3 py-3 sm:px-4 space-y-3 bg-muted/30">
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
                                    className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
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
                                  <SelectTrigger className="h-8 text-xs">
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
                                className="h-8 text-xs"
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
                                onClick={() => {
                                  if (confirm('Remove this item from the checklist?')) {
                                    deleteItemMut.mutate({ itemId: item.id });
                                    setExpandedItem(null);
                                  }
                                }}
                              >
                                <Trash2 className="size-3 mr-1" />
                                Remove
                              </Button>
                            </div>
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
                <Button variant="outline" size="sm" onClick={() => setShowAddItem(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
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
    </div>
  );
}
