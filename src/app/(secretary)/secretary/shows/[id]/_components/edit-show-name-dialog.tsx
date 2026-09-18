'use client';

import { useState } from 'react';
import { Pencil, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function EditShowNameDialog({
  showId,
  currentName,
}: {
  showId: string;
  currentName: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const utils = trpc.useUtils();

  const updateMutation = trpc.shows.update.useMutation({
    onSuccess: async () => {
      await utils.shows.getById.invalidate({ id: showId });
      toast.success('Show name updated');
      setOpen(false);
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to update show name');
    },
  });

  function handleOpenChange(next: boolean) {
    if (next) setName(currentName);
    setOpen(next);
  }

  const trimmed = name.trim();
  const isDirty = !!trimmed && trimmed !== currentName;

  function handleSave() {
    if (!isDirty) {
      setOpen(false);
      return;
    }
    updateMutation.mutate({ id: showId, name: trimmed });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
        aria-label="Edit show name"
      >
        <Pencil className="size-3.5" />
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Show Name</DialogTitle>
            <DialogDescription>
              Change the name of this show. It will update everywhere — your
              dashboard, the public show page, and the schedule PDF.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="edit-show-name">Show Name</Label>
            <Input
              id="edit-show-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSave();
                }
              }}
              autoFocus
              maxLength={255}
              className="min-h-[2.75rem]"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending || !isDirty}
            >
              {updateMutation.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
