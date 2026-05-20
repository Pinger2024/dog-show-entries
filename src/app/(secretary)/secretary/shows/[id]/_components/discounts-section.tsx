'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type MultiDogValue = {
  threshold: string;
  packagePence: string;
};

type DiscountGroup = {
  id: string;
  label: string;
  firstEntryFeePence: number;
  multiDogPackagePence: number | null;
};

type Props = {
  showId: string;
  multiDog: MultiDogValue;
  onMultiDogChange: (value: MultiDogValue) => void;
};

// Inline section that manages a show's advanced fee discounts.
// Multi-dog package fields are propagated up to the parent dialog so
// they save with the rest of the show settings. Discount groups have
// their own mutations and refresh independently.
export function DiscountsSection({ showId, multiDog, onMultiDogChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<DiscountGroup | null>(null);

  const { data: groups, isLoading } = trpc.secretary.listDiscountGroups.useQuery({ showId });

  const utils = trpc.useUtils();
  const deleteMutation = trpc.secretary.deleteDiscountGroup.useMutation({
    onSuccess: async () => {
      await utils.secretary.listDiscountGroups.invalidate({ showId });
      toast.success('Discount group removed');
    },
    onError: (err) => toast.error(err.message || 'Failed to remove'),
  });

  const multiDogEnabled = !!multiDog.threshold;

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-emerald-100/40 dark:hover:bg-emerald-950/30"
      >
        <div>
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
            Advanced discounts
          </p>
          <p className="text-xs text-emerald-800/70 dark:text-emerald-200/70">
            Optional — members rates, multi-dog packages
          </p>
        </div>
        {expanded ? (
          <ChevronDown className="size-4 text-emerald-700 dark:text-emerald-300" />
        ) : (
          <ChevronRight className="size-4 text-emerald-700 dark:text-emerald-300" />
        )}
      </button>

      {expanded && (
        <div className="space-y-5 border-t bg-background p-4">
          {/* Discount groups */}
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold">Discount groups</p>
                <p className="text-xs text-muted-foreground">
                  Offer a cheaper first-entry rate to a named group, e.g. Members or Pensioners. Exhibitors confirm at checkout.
                </p>
              </div>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : (groups && groups.length > 0) ? (
              <div className="space-y-2">
                {groups.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{g.label}</p>
                      <p className="text-xs text-muted-foreground">
                        First-entry £{(g.firstEntryFeePence / 100).toFixed(2)}
                        {g.multiDogPackagePence != null && (
                          <span> · Multi-dog package £{(g.multiDogPackagePence / 100).toFixed(2)}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => {
                          setEditingGroup(g);
                          setGroupDialogOpen(true);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm(`Remove ${g.label}? Existing orders that claimed this rate are unaffected.`)) {
                            deleteMutation.mutate({ id: g.id });
                          }
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No discount groups yet.</p>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingGroup(null);
                setGroupDialogOpen(true);
              }}
              className="min-h-[2.75rem] w-full"
            >
              <Plus className="size-4" />
              Add a discount group
            </Button>
          </div>

          {/* Multi-dog package */}
          <div className="space-y-3 border-t pt-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold">Multi-dog package</p>
              <p className="text-xs text-muted-foreground">
                Flat package price when an exhibitor enters this many distinct dogs in paying classes. Junior Handler and NFC entries don&apos;t count toward the threshold.
              </p>
            </div>

            {multiDogEnabled ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="md-threshold">Applies from</Label>
                    <div className="relative">
                      <Input
                        id="md-threshold"
                        type="number"
                        min={2}
                        step={1}
                        value={multiDog.threshold}
                        onChange={(e) => onMultiDogChange({ ...multiDog, threshold: e.target.value })}
                        className="min-h-[2.75rem] pr-12"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        dogs
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="md-package">Package price</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
                      <Input
                        id="md-package"
                        type="number"
                        min={0}
                        step={0.01}
                        value={multiDog.packagePence}
                        onChange={(e) => onMultiDogChange({ ...multiDog, packagePence: e.target.value })}
                        className="min-h-[2.75rem] pl-7"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>
                {/* Per-discount-group multi-dog package summary —
                    surfaces the per-group package price (e.g. BRG Members
                    3-dog £45 vs everyone-else £56) where the secretary
                    actually sets the standard package, so it's not
                    hidden behind "edit the group" (Amanda 2026-05-19). */}
                {groups && groups.length > 0 && (
                  <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                    <p className="text-xs font-semibold">Group-specific package prices</p>
                    <ul className="space-y-1 text-xs">
                      {groups.map((g) => (
                        <li key={g.id} className="flex items-center justify-between gap-2">
                          <span className="truncate">{g.label}</span>
                          <span className="shrink-0 font-medium">
                            {g.multiDogPackagePence != null
                              ? `£${(g.multiDogPackagePence / 100).toFixed(2)}`
                              : (
                                <button
                                  type="button"
                                  className="text-primary hover:underline"
                                  onClick={() => {
                                    setEditingGroup(g);
                                    setGroupDialogOpen(true);
                                  }}
                                >
                                  Set group price
                                </button>
                              )}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-muted-foreground">
                      A group&apos;s own package price replaces the standard one above when a member claims the rate at checkout.
                    </p>
                  </div>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onMultiDogChange({ threshold: '', packagePence: '' })}
                  className="text-xs text-muted-foreground"
                >
                  Remove multi-dog package
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onMultiDogChange({ threshold: '3', packagePence: '' })}
                className="min-h-[2.75rem] w-full"
              >
                <Plus className="size-4" />
                Enable multi-dog package
              </Button>
            )}
          </div>
        </div>
      )}

      <DiscountGroupDialog
        showId={showId}
        open={groupDialogOpen}
        onOpenChange={setGroupDialogOpen}
        existing={editingGroup}
        multiDogEnabled={multiDogEnabled}
        onSaved={async () => {
          await utils.secretary.listDiscountGroups.invalidate({ showId });
          setGroupDialogOpen(false);
        }}
      />
    </div>
  );
}

function DiscountGroupDialog({
  showId,
  open,
  onOpenChange,
  existing,
  multiDogEnabled,
  onSaved,
}: {
  showId: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  existing: DiscountGroup | null;
  multiDogEnabled: boolean;
  onSaved: () => Promise<void>;
}) {
  const [label, setLabel] = useState(existing?.label ?? 'Members');
  const [feeStr, setFeeStr] = useState(
    existing ? (existing.firstEntryFeePence / 100).toFixed(2) : ''
  );
  const [packageStr, setPackageStr] = useState(
    existing?.multiDogPackagePence != null
      ? (existing.multiDogPackagePence / 100).toFixed(2)
      : ''
  );

  // Re-seed when the dialog opens for a different group
  function handleOpenChange(next: boolean) {
    if (next) {
      setLabel(existing?.label ?? 'Members');
      setFeeStr(existing ? (existing.firstEntryFeePence / 100).toFixed(2) : '');
      setPackageStr(
        existing?.multiDogPackagePence != null
          ? (existing.multiDogPackagePence / 100).toFixed(2)
          : ''
      );
    }
    onOpenChange(next);
  }

  const createMutation = trpc.secretary.createDiscountGroup.useMutation({
    onSuccess: async () => {
      toast.success('Discount group added');
      await onSaved();
    },
    onError: (err) => toast.error(err.message || 'Failed to save'),
  });
  const updateMutation = trpc.secretary.updateDiscountGroup.useMutation({
    onSuccess: async () => {
      toast.success('Discount group updated');
      await onSaved();
    },
    onError: (err) => toast.error(err.message || 'Failed to save'),
  });

  const pending = createMutation.isPending || updateMutation.isPending;

  function handleSave() {
    const trimmed = label.trim();
    const fee = parseFloat(feeStr);
    const pack = packageStr.trim() ? Math.round(parseFloat(packageStr) * 100) : null;
    if (!trimmed) return toast.error('Label is required');
    if (!Number.isFinite(fee) || fee < 0) return toast.error('First-entry fee must be 0 or more');

    if (existing) {
      updateMutation.mutate({
        id: existing.id,
        label: trimmed,
        firstEntryFeePence: Math.round(fee * 100),
        multiDogPackagePence: pack,
      });
    } else {
      createMutation.mutate({
        showId,
        label: trimmed,
        firstEntryFeePence: Math.round(fee * 100),
        multiDogPackagePence: pack,
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit discount group' : 'Add discount group'}</DialogTitle>
          <DialogDescription>
            Exhibitors will see this label at checkout and confirm they qualify.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="dg-label">Group name</Label>
            <Input
              id="dg-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={100}
              className="min-h-[2.75rem]"
            />
            <p className="text-xs text-muted-foreground">e.g. Members, Pensioners, BAGSD Members</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dg-fee">First-entry fee for this group</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
              <Input
                id="dg-fee"
                type="number"
                min={0}
                step={0.01}
                value={feeStr}
                onChange={(e) => setFeeStr(e.target.value)}
                placeholder="0.00"
                className="min-h-[2.75rem] pl-7"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              What this group pays for the first class of each dog. Subsequent-class fees stay the same for everyone.
            </p>
          </div>
          {multiDogEnabled && (
            <div className="space-y-1.5">
              <Label htmlFor="dg-package">Multi-dog package price for this group (optional)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
                <Input
                  id="dg-package"
                  type="number"
                  min={0}
                  step={0.01}
                  value={packageStr}
                  onChange={(e) => setPackageStr(e.target.value)}
                  placeholder="Leave blank to use standard package"
                  className="min-h-[2.75rem] pl-7"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                If set, this group pays this price when the multi-dog threshold is met instead of the standard package price.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
