'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { penceToPoundsString, poundsToPence } from '@/lib/date-utils';
import type { ActionPanelProps } from '../checklist-action-registry';

export function JudgeHotelAction({ showId, itemId, entityId, entityName }: ActionPanelProps) {
  const { data: contracts } = trpc.secretary.getJudgeContracts.useQuery({ showId });
  const utils = trpc.useUtils();

  const contract = contracts
    ?.filter((c) => c.judgeId === entityId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  const [hotel, setHotel] = useState('');
  const [travel, setTravel] = useState('');
  const [other, setOther] = useState('');
  const [notes, setNotes] = useState('');

  // Sync form state when contract data loads (avoids stale initial state)
  const synced = useRef(false);
  useEffect(() => {
    if (contract && !synced.current) {
      synced.current = true;
      setHotel(contract.hotelCost ? penceToPoundsString(contract.hotelCost) : '');
      setTravel(contract.travelCost ? penceToPoundsString(contract.travelCost) : '');
      setOther(contract.otherExpenses ? penceToPoundsString(contract.otherExpenses) : '');
      setNotes(contract.expenseNotes ?? '');
    }
  }, [contract]);

  const expenseMutation = trpc.secretary.updateJudgeExpenses.useMutation({
    onSuccess: () => {
      toast.success('Expenses saved');
      utils.secretary.getJudgeContracts.invalidate({ showId });
    },
    onError: (err) => toast.error(err.message),
  });

  const updateItemMut = trpc.secretary.updateChecklistItem.useMutation({
    onSuccess: () => utils.secretary.getChecklist.invalidate({ showId }),
  });

  if (!contract) {
    return (
      <div className="py-2 text-sm text-muted-foreground">
        No contract found for {entityName ?? 'this judge'}. Send an offer first.
      </div>
    );
  }

  function handleSave() {
    expenseMutation.mutate({
      contractId: contract!.id,
      hotelCost: hotel ? poundsToPence(hotel) : null,
      travelCost: travel ? poundsToPence(travel) : null,
      otherExpenses: other ? poundsToPence(other) : null,
      expenseNotes: notes || null,
    });

    // Mark item as complete if any expense is entered
    if (hotel || travel || other) {
      updateItemMut.mutate({ itemId, status: 'complete' });
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Record accommodation and travel expenses for {entityName ?? 'this judge'}.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Hotel (£)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            className="h-8 text-xs"
            placeholder="0.00"
            value={hotel}
            onChange={(e) => setHotel(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Travel (£)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            className="h-8 text-xs"
            placeholder="0.00"
            value={travel}
            onChange={(e) => setTravel(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Other (£)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            className="h-8 text-xs"
            placeholder="0.00"
            value={other}
            onChange={(e) => setOther(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Notes</Label>
        <Textarea
          className="min-h-[50px] text-xs"
          placeholder="Hotel name, booking reference, etc."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <Button
        size="sm"
        onClick={handleSave}
        disabled={expenseMutation.isPending}
      >
        {expenseMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
        Save Expenses
      </Button>
    </div>
  );
}
