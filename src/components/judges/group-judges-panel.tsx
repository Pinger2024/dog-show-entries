'use client';

import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, Gavel, Loader2, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface GroupJudgesPanelProps {
  showId: string;
}

interface AssignDialogState {
  breedGroupId: string | null;
  judgeRoleId: string;
  groupName: string | null;
  roleName: string;
}

export function GroupJudgesPanel({ showId }: GroupJudgesPanelProps) {
  const [dialogState, setDialogState] = useState<AssignDialogState | null>(null);
  const [judgePopoverOpen, setJudgePopoverOpen] = useState(false);
  const [judgeSearch, setJudgeSearch] = useState('');
  const [selectedJudgeId, setSelectedJudgeId] = useState('');
  const utils = trpc.useUtils();

  const { data: showData } = trpc.shows.getById.useQuery({ id: showId });
  const { data: assignments } = trpc.secretary.getShowJudges.useQuery({ showId });
  const { data: judgeRoles } = trpc.secretary.getJudgeRoles.useQuery({ showId });
  const { data: searchResults, isLoading: searching } = trpc.secretary.searchJudges.useQuery(
    { query: judgeSearch, limit: 10 },
    { enabled: judgeSearch.trim().length >= 2 }
  );
  const { data: allJudges } = trpc.secretary.getJudges.useQuery();

  const assignMutation = trpc.secretary.assignGroupJudge.useMutation({
    onSuccess: () => {
      toast.success('Judge assigned');
      setDialogState(null);
      setSelectedJudgeId('');
      setJudgeSearch('');
      utils.secretary.getShowJudges.invalidate({ showId });
    },
    onError: (err) => toast.error(err.message ?? 'Failed to assign judge'),
  });

  const removeMutation = trpc.secretary.removeJudgeAssignment.useMutation({
    onSuccess: () => {
      toast.success('Assignment removed');
      utils.secretary.getShowJudges.invalidate({ showId });
    },
    onError: () => toast.error('Failed to remove assignment'),
  });

  // Derive distinct breed groups from show classes
  const breedGroups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; sortOrder: number }>();
    for (const sc of showData?.showClasses ?? []) {
      const g = sc.breed?.group;
      if (g && !map.has(g.id)) {
        map.set(g.id, { id: g.id, name: g.name, sortOrder: g.sortOrder });
      }
    }
    return [...map.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [showData]);

  // Index group-level assignments by (breedGroupId|null, judgeRoleId) for quick lookup
  const assignmentIndex = useMemo(() => {
    const idx = new Map<string, { id: string; judgeName: string; judgeId: string }>();
    for (const a of assignments ?? []) {
      if (!a.judgeRole) continue;
      const key = `${a.breedGroupId ?? 'show'}::${a.judgeRoleId}`;
      idx.set(key, { id: a.id, judgeName: a.judge.name, judgeId: a.judgeId });
    }
    return idx;
  }, [assignments]);

  const showLevelRoles = useMemo(
    () => (judgeRoles ?? []).filter((r) => !r.isGroupLevel),
    [judgeRoles]
  );
  const groupLevelRoles = useMemo(
    () => (judgeRoles ?? []).filter((r) => r.isGroupLevel),
    [judgeRoles]
  );

  if (!judgeRoles || (!breedGroups.length && !showLevelRoles.length)) return null;

  function openDialog(state: AssignDialogState) {
    setDialogState(state);
    setSelectedJudgeId('');
    setJudgeSearch('');
  }

  function handleAssign() {
    if (!dialogState || !selectedJudgeId) return;
    assignMutation.mutate({
      showId,
      judgeId: selectedJudgeId,
      breedGroupId: dialogState.breedGroupId,
      judgeRoleId: dialogState.judgeRoleId,
    });
  }

  function getAssignment(breedGroupId: string | null, judgeRoleId: string) {
    return assignmentIndex.get(`${breedGroupId ?? 'show'}::${judgeRoleId}`);
  }

  const judgeOptions = useMemo(() => {
    if (judgeSearch.trim().length >= 2) return searchResults ?? [];
    return (allJudges ?? []).slice(0, 20);
  }, [judgeSearch, searchResults, allJudges]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Group &amp; Show Judges</CardTitle>
          <CardDescription>
            Assign judges for Best in Show, Best in Group, and sub-judge roles. These appear
            on the &ldquo;BIS &amp; Group Judges&rdquo; panel page of the schedule.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Show-level judges (BIS, BPIS, BVIS) */}
          {showLevelRoles.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Show Level
              </p>
              <div className="space-y-2">
                {showLevelRoles.map((role) => {
                  const assignment = getAssignment(null, role.id);
                  return (
                    <RoleRow
                      key={role.id}
                      roleName={role.name}
                      roleShortLabel={role.shortLabel}
                      assignment={assignment}
                      onAssign={() =>
                        openDialog({
                          breedGroupId: null,
                          judgeRoleId: role.id,
                          groupName: null,
                          roleName: role.name,
                        })
                      }
                      onRemove={assignment ? () => removeMutation.mutate({ assignmentId: assignment.id }) : undefined}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Per-group judges */}
          {breedGroups.map((group) => (
            <div key={group.id} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.name} Group
              </p>
              <div className="space-y-2">
                {groupLevelRoles.map((role) => {
                  const assignment = getAssignment(group.id, role.id);
                  return (
                    <RoleRow
                      key={role.id}
                      roleName={role.name}
                      roleShortLabel={role.shortLabel}
                      assignment={assignment}
                      onAssign={() =>
                        openDialog({
                          breedGroupId: group.id,
                          judgeRoleId: role.id,
                          groupName: group.name,
                          roleName: role.name,
                        })
                      }
                      onRemove={assignment ? () => removeMutation.mutate({ assignmentId: assignment.id }) : undefined}
                    />
                  );
                })}
              </div>
            </div>
          ))}

          {breedGroups.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Add breeds to your show first — groups will appear here once classes are set up.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Assign judge dialog */}
      <Dialog open={!!dialogState} onOpenChange={(open) => { if (!open) setDialogState(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Judge</DialogTitle>
            <DialogDescription>
              {dialogState?.groupName
                ? `${dialogState.roleName} — ${dialogState.groupName} Group`
                : dialogState?.roleName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label>Judge</Label>
            <Popover open={judgePopoverOpen} onOpenChange={setJudgePopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                >
                  {selectedJudgeId
                    ? (allJudges?.find((j) => j.id === selectedJudgeId)?.name ??
                      searchResults?.find((j) => j.id === selectedJudgeId)?.name ??
                      'Judge selected')
                    : 'Search for a judge…'}
                  <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full max-w-[calc(100vw-2rem)] p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Type a name…"
                    value={judgeSearch}
                    onValueChange={setJudgeSearch}
                  />
                  <CommandList>
                    {searching && (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    {!searching && judgeOptions.length === 0 && (
                      <CommandEmpty>No judges found.</CommandEmpty>
                    )}
                    <CommandGroup>
                      {judgeOptions.map((judge) => (
                        <CommandItem
                          key={judge.id}
                          value={judge.name}
                          onSelect={() => {
                            setSelectedJudgeId(judge.id);
                            setJudgePopoverOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 size-4',
                              selectedJudgeId === judge.id ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          <div>
                            <span className="font-medium">{judge.name}</span>
                            {judge.kennelClubAffix && (
                              <span className="ml-1 text-muted-foreground text-xs">
                                ({judge.kennelClubAffix})
                              </span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogState(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleAssign}
              disabled={!selectedJudgeId || assignMutation.isPending}
            >
              {assignMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Role Row ──────────────────────────────────────────────────

interface RoleRowProps {
  roleName: string;
  roleShortLabel: string | null;
  assignment: { id: string; judgeName: string; judgeId: string } | undefined;
  onAssign: () => void;
  onRemove?: () => void;
}

function RoleRow({ roleName, roleShortLabel, assignment, onAssign, onRemove }: RoleRowProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background p-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{roleName}</span>
          {roleShortLabel && (
            <Badge variant="outline" className="shrink-0 text-xs">
              {roleShortLabel}
            </Badge>
          )}
        </div>
        {assignment ? (
          <p className="mt-0.5 text-sm text-foreground/80">{assignment.judgeName}</p>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground">Not assigned</p>
        )}
      </div>

      {assignment ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="sm" className="min-h-[2.75rem]" onClick={onAssign}>
            Change
          </Button>
          {onRemove && (
            <Button
              variant="ghost"
              size="icon"
              className="size-11 text-muted-foreground/60 hover:text-destructive"
              onClick={onRemove}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      ) : (
        <Button variant="outline" size="sm" className="shrink-0 min-h-[2.75rem]" onClick={onAssign}>
          <Plus className="mr-1 size-3.5" />
          Assign
        </Button>
      )}
    </div>
  );
}
