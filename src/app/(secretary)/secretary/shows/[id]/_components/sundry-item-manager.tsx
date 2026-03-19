'use client';

import { useState } from 'react';
import { Edit3, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
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
  { name: 'Printed Catalogue', description: 'Receive a printed show catalogue on the day', priceInPence: 500, maxPerOrder: 1 },
  { name: 'Online Catalogue', description: 'Access to the digital show catalogue', priceInPence: 300, maxPerOrder: 1 },
  { name: 'Donation', description: 'Support the club with a voluntary donation', priceInPence: 200 },
  { name: 'Club Membership — Sole', description: 'Annual single membership', priceInPence: 800, maxPerOrder: 1 },
  { name: 'Club Membership — Joint', description: 'Annual joint membership', priceInPence: 1200, maxPerOrder: 1 },
  { name: 'Club Membership — Family', description: 'Annual family membership', priceInPence: 1500, maxPerOrder: 1 },
];

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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Sundry Items</CardTitle>
              <CardDescription>
                Add-on items exhibitors can purchase at checkout — catalogues, memberships, donations, etc.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
              <Button
                variant="outline"
                size="sm"
                className="min-h-[2.75rem]"
                onClick={handleAddCommon}
                disabled={bulkCreateMutation.isPending}
              >
                {bulkCreateMutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
                Add Common Items
              </Button>
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
                      <Button variant="outline" size="sm" className="min-h-[2.75rem] px-2.5" onClick={() => openEditDialog(item)}>
                        <Edit3 className="size-3.5" />
                        Edit
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
                      <TableHead className="w-24" />
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
                            <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => openEditDialog(item)}>
                              <Edit3 className="size-3.5" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 text-destructive hover:bg-destructive/10"
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
