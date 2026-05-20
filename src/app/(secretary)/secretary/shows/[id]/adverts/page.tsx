'use client';

import { useState, useRef } from 'react';
import {
  Image as ImageIcon,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  Upload,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { uploadImage } from '@/lib/upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { useShowId } from '../_lib/show-context';

type AdvertDocument = 'schedule' | 'catalogue' | 'both';
type AdvertPosition = 'inside_front' | 'inside_back' | 'last_page';

const DOCUMENT_LABEL: Record<AdvertDocument, string> = {
  schedule: 'Schedule',
  catalogue: 'Catalogue',
  both: 'Schedule & Catalogue',
};

const POSITION_LABEL: Record<AdvertPosition, string> = {
  inside_front: 'Inside front cover',
  inside_back: 'Inside back cover',
  last_page: 'Last page',
};

type Advert = {
  id: string;
  advertiserName: string;
  document: AdvertDocument;
  position: AdvertPosition;
  imageUrl: string | null;
  imageStorageKey: string | null;
  sortOrder: number;
};

export default function AdvertsPage() {
  const showId = useShowId();
  const utils = trpc.useUtils();
  const { data: adverts, isLoading } = trpc.secretary.getCatalogueAdverts.useQuery({ showId });
  const upsertMutation = trpc.secretary.upsertCatalogueAdvert.useMutation();
  const deleteMutation = trpc.secretary.deleteCatalogueAdvert.useMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Advert | null>(null);

  const refresh = () => utils.secretary.getCatalogueAdverts.invalidate({ showId });

  const onSave = async (input: {
    id?: string;
    advertiserName: string;
    document: AdvertDocument;
    position: AdvertPosition;
    imageUrl: string | null;
    imageStorageKey: string | null;
    sortOrder: number;
  }) => {
    try {
      await upsertMutation.mutateAsync({
        ...input,
        showId,
        adType: 'full_page',
      });
      await refresh();
      setDialogOpen(false);
      setEditing(null);
      toast.success(input.id ? 'Advert updated' : 'Advert added');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save advert');
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm('Delete this advert?')) return;
    try {
      await deleteMutation.mutateAsync({ id, showId });
      await refresh();
      toast.success('Advert deleted');
    } catch {
      toast.error('Failed to delete advert');
    }
  };

  const onMove = async (advert: Advert, direction: 'up' | 'down') => {
    if (!adverts) return;
    const peers = adverts.filter(
      (a) => a.document === advert.document && a.position === advert.position,
    );
    const idx = peers.findIndex((a) => a.id === advert.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= peers.length) return;
    const swap = peers[swapIdx];
    await Promise.all([
      upsertMutation.mutateAsync({
        id: advert.id,
        showId,
        advertiserName: advert.advertiserName,
        document: advert.document,
        position: advert.position,
        imageUrl: advert.imageUrl,
        imageStorageKey: advert.imageStorageKey,
        sortOrder: swap.sortOrder,
        adType: 'full_page',
      }),
      upsertMutation.mutateAsync({
        id: swap.id,
        showId,
        advertiserName: swap.advertiserName,
        document: swap.document,
        position: swap.position,
        imageUrl: swap.imageUrl,
        imageStorageKey: swap.imageStorageKey,
        sortOrder: advert.sortOrder,
        adType: 'full_page',
      }),
    ]);
    await refresh();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const list = (adverts ?? []) as Advert[];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Adverts</h2>
          <p className="text-sm text-muted-foreground">
            Upload full-page A5 adverts. They slot into your Schedule or Catalogue at the position you pick.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
          className="shrink-0"
        >
          <Plus className="size-4" />
          Add advert
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="No adverts yet"
          description="Sponsors paying for back-cover or inside-cover space? Upload their artwork here and Remi will slot it in automatically when it generates the Schedule or Catalogue PDF."
          action={
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" />
              Add your first advert
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((advert) => {
            const peers = list.filter(
              (a) => a.document === advert.document && a.position === advert.position,
            );
            const idx = peers.findIndex((a) => a.id === advert.id);
            const canMoveUp = idx > 0;
            const canMoveDown = idx < peers.length - 1;

            return (
              <Card key={advert.id} className="overflow-hidden">
                <div className="aspect-[148/210] bg-muted relative">
                  {advert.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={advert.imageUrl}
                      alt={advert.advertiserName}
                      className="absolute inset-0 size-full object-contain"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      <ImageIcon className="size-12" />
                    </div>
                  )}
                </div>
                <CardContent className="space-y-2 p-3">
                  <p className="truncate font-semibold text-sm">{advert.advertiserName}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-xs">
                      {DOCUMENT_LABEL[advert.document]}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {POSITION_LABEL[advert.position]}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-1 pt-1">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-8 p-0"
                        disabled={!canMoveUp}
                        onClick={() => onMove(advert, 'up')}
                        title="Move up in the order"
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-8 p-0"
                        disabled={!canMoveDown}
                        onClick={() => onMove(advert, 'down')}
                        title="Move down in the order"
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-8 p-0"
                        onClick={() => {
                          setEditing(advert);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => onDelete(advert.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AdvertDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        existing={editing}
        existingAdverts={list}
        onSave={onSave}
        saving={upsertMutation.isPending}
      />
    </div>
  );
}

function AdvertDialog({
  open,
  onOpenChange,
  existing,
  existingAdverts,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: Advert | null;
  existingAdverts: Advert[];
  onSave: (input: {
    id?: string;
    advertiserName: string;
    document: AdvertDocument;
    position: AdvertPosition;
    imageUrl: string | null;
    imageStorageKey: string | null;
    sortOrder: number;
  }) => void | Promise<void>;
  saving: boolean;
}) {
  const [advertiserName, setAdvertiserName] = useState('');
  const [document, setDocument] = useState<AdvertDocument>('catalogue');
  const [position, setPosition] = useState<AdvertPosition>('last_page');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset form whenever dialog opens with new state.
  const openedRef = useRef(false);
  if (open && !openedRef.current) {
    openedRef.current = true;
    setAdvertiserName(existing?.advertiserName ?? '');
    setDocument(existing?.document ?? 'catalogue');
    setPosition(existing?.position ?? 'last_page');
    setImageUrl(existing?.imageUrl ?? null);
  } else if (!open && openedRef.current) {
    openedRef.current = false;
  }

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadImage(file);
      setImageUrl(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async () => {
    if (!advertiserName.trim()) {
      toast.error('Please enter an advertiser name');
      return;
    }
    if (!imageUrl) {
      toast.error('Please upload artwork');
      return;
    }

    // Place new adverts at the end of their placement bucket. Existing ones
    // keep their order.
    const sortOrder = existing
      ? existing.sortOrder
      : (existingAdverts
          .filter((a) => a.document === document && a.position === position)
          .reduce((max, a) => Math.max(max, a.sortOrder), -1) + 1);

    await onSave({
      id: existing?.id,
      advertiserName: advertiserName.trim(),
      document,
      position,
      imageUrl,
      imageStorageKey: existing?.imageStorageKey ?? null,
      sortOrder,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit advert' : 'Add advert'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Artwork upload */}
          <div className="space-y-2">
            <Label>Artwork (full-page A5)</Label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="relative w-full overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30 hover:bg-muted/50 transition-colors aspect-[148/210]"
            >
              {imageUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt="Advert preview"
                    className="absolute inset-0 size-full object-contain"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/40 transition-colors">
                    <span className="rounded-md bg-background/90 px-3 py-1.5 text-xs font-medium opacity-0 hover:opacity-100 transition-opacity">
                      Replace artwork
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground p-6">
                  {uploading ? (
                    <Loader2 className="size-8 animate-spin" />
                  ) : (
                    <>
                      <Upload className="size-8" />
                      <p className="text-sm font-medium">Click to upload</p>
                      <p className="text-xs">JPG, PNG or WebP, under 5MB</p>
                    </>
                  )}
                </div>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = '';
              }}
            />
          </div>

          {/* Advertiser name */}
          <div className="space-y-2">
            <Label htmlFor="advertiserName">Advertiser / label</Label>
            <Input
              id="advertiserName"
              value={advertiserName}
              onChange={(e) => setAdvertiserName(e.target.value)}
              placeholder="e.g. Royal Canin — PRO Club"
            />
            <p className="text-xs text-muted-foreground">
              Internal label so you can remember who this advert is for. Not printed.
            </p>
          </div>

          {/* Document selector */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="document">Where</Label>
              <Select value={document} onValueChange={(v) => setDocument(v as AdvertDocument)}>
                <SelectTrigger id="document">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="catalogue">Catalogue</SelectItem>
                  <SelectItem value="schedule">Schedule</SelectItem>
                  <SelectItem value="both">Both — Schedule &amp; Catalogue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="position">Position</Label>
              <Select value={position} onValueChange={(v) => setPosition(v as AdvertPosition)}>
                <SelectTrigger id="position">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inside_front">Inside front cover</SelectItem>
                  <SelectItem value="inside_back">Inside back cover</SelectItem>
                  <SelectItem value="last_page">Last page</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={saving || uploading}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {existing ? 'Save changes' : 'Add advert'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
