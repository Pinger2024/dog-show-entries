'use client';

import { useState, useCallback } from 'react';
import { AlertCircle, Check, Edit3, EyeOff, Loader2, Plus, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { formatCurrency, penceToPoundsString, poundsToPence } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

const COMMON_SUNDRY_PRESETS = [
  { name: 'Printed Catalogue', description: 'Receive a printed show catalogue on the day', maxPerOrder: 1 },
  { name: 'Online Catalogue', description: 'Access to the digital show catalogue', maxPerOrder: 1 },
  { name: 'Donation', description: 'Support the club with a voluntary donation' },
  { name: 'Club Membership — Sole', description: 'Annual single membership', maxPerOrder: 1 },
  { name: 'Club Membership — Joint', description: 'Annual joint membership', maxPerOrder: 1 },
  { name: 'Club Membership — Family', description: 'Annual family membership', maxPerOrder: 1 },
];

function PresetPicker({
  presets,
  selections,
  existingNames,
  onToggle,
  onPriceChange,
  onAdd,
  onSkip,
  isPending,
}: {
  presets: typeof COMMON_SUNDRY_PRESETS;
  selections: Record<string, { selected: boolean; price: string }>;
  existingNames: Set<string>;
  onToggle: (name: string) => void;
  onPriceChange: (name: string, price: string) => void;
  onAdd: () => void;
  onSkip: () => void;
  isPending: boolean;
}) {
  const available = presets.filter((p) => !existingNames.has(p.name));
  const selectedCount = available.filter((p) => selections[p.name]?.selected).length;

  if (available.length === 0) return null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Select the items you&apos;d like to offer and set a price for each.
      </p>
      <div className="space-y-2">
        {available.map((preset) => {
          const sel = selections[preset.name];
          const isSelected = sel?.selected ?? false;

          return (
            <div
              key={preset.name}
              className={cn(
                'rounded-lg border p-3 transition-colors cursor-pointer',
                isSelected
                  ? 'border-primary/40 bg-primary/5'
                  : 'hover:bg-muted/50',
              )}
              onClick={() => onToggle(preset.name)}
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border transition-colors',
                  isSelected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/30',
                )}>
                  {isSelected && <Check className="size-3" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{preset.name}</p>
                  <p className="text-xs text-muted-foreground">{preset.description}</p>
                  {isSelected && (
                    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                      <div className="relative max-w-[10rem]">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          &pound;
                        </span>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          className="h-10 pl-7"
                          value={sel?.price ?? ''}
                          onChange={(e) => onPriceChange(preset.name, e.target.value)}
                          autoFocus
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          className="min-h-[2.75rem] flex-1 sm:flex-none"
          onClick={onAdd}
          disabled={selectedCount === 0 || isPending}
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            `Add ${selectedCount} Item${selectedCount !== 1 ? 's' : ''}`
          )}
        </Button>
        <Button
          variant="ghost"
          className="min-h-[2.75rem] text-muted-foreground"
          onClick={onSkip}
        >
          <Plus className="size-3.5" />
          Create custom item instead
        </Button>
      </div>
    </div>
  );
}

export function SundryItemManager({ showId }: { showId: string }) {
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

  // Preset picker state — tracks which presets are selected and their prices
  const [presetSelections, setPresetSelections] = useState<Record<string, { selected: boolean; price: string }>>(() => {
    const initial: Record<string, { selected: boolean; price: string }> = {};
    for (const p of COMMON_SUNDRY_PRESETS) {
      initial[p.name] = { selected: false, price: '' };
    }
    return initial;
  });

  const togglePreset = useCallback((name: string) => {
    setPresetSelections((prev) => ({
      ...prev,
      [name]: { ...prev[name]!, selected: !prev[name]!.selected },
    }));
  }, []);

  const setPresetPrice = useCallback((name: string, price: string) => {
    setPresetSelections((prev) => ({
      ...prev,
      [name]: { ...prev[name]!, price },
    }));
  }, []);

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
      toast.success(`${data.created} item${data.created !== 1 ? 's' : ''} added`);
      utils.secretary.getSundryItems.invalidate({ showId });
      // Reset preset selections
      setPresetSelections((prev) => {
        const reset: Record<string, { selected: boolean; price: string }> = {};
        for (const key of Object.keys(prev)) {
          reset[key] = { selected: false, price: '' };
        }
        return reset;
      });
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

  function handleAddSelectedPresets() {
    const selected = COMMON_SUNDRY_PRESETS.filter((p) => presetSelections[p.name]?.selected);
    if (selected.length === 0) {
      toast.error('Select at least one item');
      return;
    }
    // Validate all selected items have a price
    const missing = selected.filter((p) => {
      const price = parseFloat(presetSelections[p.name]?.price ?? '');
      return !price || price <= 0;
    });
    if (missing.length > 0) {
      toast.error(`Set a price for: ${missing.map((m) => m.name).join(', ')}`);
      return;
    }
    bulkCreateMutation.mutate({
      showId,
      items: selected.map((p) => ({
        name: p.name,
        description: p.description,
        priceInPence: poundsToPence(parseFloat(presetSelections[p.name]!.price)),
        maxPerOrder: p.maxPerOrder,
      })),
    });
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
            {(items ?? []).length > 0 && (
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
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (items ?? []).length === 0 ? (
            <PresetPicker
              presets={COMMON_SUNDRY_PRESETS}
              selections={presetSelections}
              existingNames={new Set((items ?? []).map((i) => i.name))}
              onToggle={togglePreset}
              onPriceChange={setPresetPrice}
              onAdd={handleAddSelectedPresets}
              onSkip={() => {
                resetForm();
                setShowAddDialog(true);
              }}
              isPending={bulkCreateMutation.isPending}
            />
          ) : (
            <div className="space-y-4">
              {/* Mobile view */}
              <div className="space-y-2 sm:hidden">
                {enabledItems.map((item) => {
                  const needsPrice = item.priceInPence === 0;
                  return (
                    <div key={item.id} className={cn(
                      'flex items-center justify-between gap-3 rounded-lg border p-3',
                      needsPrice && 'border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/20',
                    )}>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{item.name}</p>
                        {needsPrice ? (
                          <p className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                            <AlertCircle className="size-3" />
                            Set a price
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(item.priceInPence)}
                            {item.maxPerOrder === 1 ? ' · max 1' : item.maxPerOrder ? ` · max ${item.maxPerOrder}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button variant={needsPrice ? 'default' : 'outline'} size="sm" className="min-h-[2.75rem] px-2.5" onClick={() => openEditDialog(item)}>
                          <Edit3 className="size-3.5" />
                          {needsPrice ? 'Set Price' : 'Edit'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-[2.75rem] px-2.5"
                          onClick={() => toggleMutation.mutate({ id: item.id, showId, enabled: false })}
                        >
                          <EyeOff className="size-3.5" />
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
                  );
                })}
                {disabledItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-3 opacity-60">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">Disabled</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-[2.75rem] px-2.5"
                      onClick={() => toggleMutation.mutate({ id: item.id, showId, enabled: true })}
                    >
                      <Undo2 className="size-3.5" />
                      Re-enable
                    </Button>
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
                      <TableHead className="w-32" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enabledItems.map((item) => {
                      const needsPrice = item.priceInPence === 0;
                      return (
                        <TableRow key={item.id} className={needsPrice ? 'bg-amber-50/50 dark:bg-amber-950/20' : undefined}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{item.name}</p>
                              {item.description && (
                                <p className="text-xs text-muted-foreground">{item.description}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {needsPrice ? (
                              <span className="flex items-center gap-1 text-sm font-medium text-amber-600 dark:text-amber-400">
                                <AlertCircle className="size-3.5" />
                                Set price
                              </span>
                            ) : (
                              formatCurrency(item.priceInPence)
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {item.maxPerOrder === 1 ? 'One per order' : item.maxPerOrder ? `Max ${item.maxPerOrder}` : 'Unlimited'}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant={needsPrice ? 'default' : 'outline'} size="sm" className="h-8 px-2" onClick={() => openEditDialog(item)}>
                                <Edit3 className="size-3.5" />
                                {needsPrice ? 'Set Price' : 'Edit'}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2"
                                title="Disable item"
                                onClick={() => toggleMutation.mutate({ id: item.id, showId, enabled: false })}
                              >
                                <EyeOff className="size-3.5" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2 text-destructive hover:bg-destructive/10"
                                onClick={() => setPendingAction({
                                  message: 'Delete this sundry item?',
                                  action: () => deleteMutation.mutate({ id: item.id, showId }),
                                })}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {disabledItems.map((item) => (
                      <TableRow key={item.id} className="opacity-50">
                        <TableCell>
                          <div>
                            <p className="font-medium">{item.name}</p>
                            <p className="text-xs text-muted-foreground">Disabled</p>
                          </div>
                        </TableCell>
                        <TableCell>{formatCurrency(item.priceInPence)}</TableCell>
                        <TableCell />
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1"
                            onClick={() => toggleMutation.mutate({ id: item.id, showId, enabled: true })}
                          >
                            <Undo2 className="size-3.5" />
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
              Pick a common item or create your own.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Quick-select presets that aren't already on the show */}
            {(() => {
              const existingNames = new Set((items ?? []).map((i) => i.name));
              const available = COMMON_SUNDRY_PRESETS.filter((p) => !existingNames.has(p.name));
              if (available.length === 0) return null;
              return (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Quick add</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {available.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                          formName === preset.name
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'hover:bg-muted',
                        )}
                        onClick={() => {
                          setFormName(preset.name);
                          setFormDescription(preset.description);
                          setFormMaxPerOrder(preset.maxPerOrder?.toString() ?? '');
                          // Don't set price — that's what the secretary needs to decide
                        }}
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

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
                  placeholder="0.00"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  autoFocus={!!formName}
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
