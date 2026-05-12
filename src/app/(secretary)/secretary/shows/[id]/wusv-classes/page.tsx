'use client';

import { useState } from 'react';
import { Loader2, Plus, Save, Shield, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useShowId } from '../_lib/show-context';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

type SvCoatType = 'stock' | 'long_stock';
type Sex = 'dog' | 'bitch';

interface PendingClass {
  classDefinitionId: string;
  sex: Sex;
  svCoatType: SvCoatType;
  entryFee: number;
}

const COAT_LABELS: Record<SvCoatType, string> = {
  stock: 'Stock Coat',
  long_stock: 'Long Stock Coat',
};

const SEX_LABELS: Record<Sex, string> = {
  dog: 'Dog',
  bitch: 'Bitch',
};

export default function WusvClassesPage() {
  const showId = useShowId();
  const utils = trpc.useUtils();

  const { data: classDefs, isLoading: defsLoading } = trpc.secretary.listWusvClassDefs.useQuery();
  const { data: existingClasses, isLoading: classesLoading } = trpc.shows.getById.useQuery({ id: showId });

  const setupMutation = trpc.secretary.setupWusvClasses.useMutation({
    onSuccess: (result) => {
      utils.shows.getById.invalidate({ id: showId });
      toast.success(`${result.created} SV classes saved`);
    },
    onError: (err) => toast.error('Failed to save classes', { description: err.message }),
  });

  const [pendingClasses, setPendingClasses] = useState<PendingClass[]>([]);
  const [initialised, setInitialised] = useState(false);

  // Seed pending from existing WUSV show classes once loaded
  const show = existingClasses;
  const isWusv = show?.showRuleset === 'wusv';

  if (!initialised && show && classDefs && !defsLoading && !classesLoading) {
    setInitialised(true);
    const existing = show.showClasses
      .filter((sc) => sc.classDefinition?.type === 'sv_age' && sc.svCoatType)
      .map((sc) => ({
        classDefinitionId: sc.classDefinitionId,
        sex: (sc.sex ?? 'dog') as Sex,
        svCoatType: sc.svCoatType as SvCoatType,
        entryFee: sc.entryFee,
      }));
    if (existing.length > 0) {
      setPendingClasses(existing);
    }
  }

  if (defsLoading || classesLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isWusv) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Shield className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="text-sm font-medium">This show is not set up as a WUSV show.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            SV class management is only available for shows with the WUSV/SV ruleset.
          </p>
        </CardContent>
      </Card>
    );
  }

  function addRow() {
    if (!classDefs || classDefs.length === 0) return;
    setPendingClasses((prev) => [
      ...prev,
      {
        classDefinitionId: classDefs[0]!.id,
        sex: 'dog',
        svCoatType: 'stock',
        entryFee: 0,
      },
    ]);
  }

  function removeRow(index: number) {
    setPendingClasses((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRow(index: number, patch: Partial<PendingClass>) {
    setPendingClasses((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  }

  function handleSave() {
    setupMutation.mutate({ showId, classes: pendingClasses });
  }

  const classByDef = new Map(classDefs?.map((cd) => [cd.id, cd]) ?? []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="size-5 text-primary" />
            SV Age Classes
          </CardTitle>
          <CardDescription>
            Add a row for each age class × sex × coat type combination. Classes run Dog Stock → Dog Long Stock → Bitch Stock → Bitch Long Stock within each age group.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pendingClasses.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No classes added yet. Click &ldquo;Add Row&rdquo; to start.
            </p>
          )}

          {pendingClasses.map((row, i) => {
            return (
              <div
                key={i}
                className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_auto_auto_auto_auto]"
              >
                {/* Age class */}
                <Select
                  value={row.classDefinitionId}
                  onValueChange={(v) => updateRow(i, { classDefinitionId: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {classDefs?.map((cd) => (
                      <SelectItem key={cd.id} value={cd.id}>
                        {cd.name.replace(/^SV /, '')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Sex */}
                <Select
                  value={row.sex}
                  onValueChange={(v) => updateRow(i, { sex: v as Sex })}
                >
                  <SelectTrigger className="w-full sm:w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dog">Dog</SelectItem>
                    <SelectItem value="bitch">Bitch</SelectItem>
                  </SelectContent>
                </Select>

                {/* Coat type */}
                <Select
                  value={row.svCoatType}
                  onValueChange={(v) => updateRow(i, { svCoatType: v as SvCoatType })}
                >
                  <SelectTrigger className="w-full sm:w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stock">Stock Coat</SelectItem>
                    <SelectItem value="long_stock">Long Stock Coat</SelectItem>
                  </SelectContent>
                </Select>

                {/* Entry fee */}
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">£</span>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    className="w-20"
                    value={row.entryFee / 100}
                    onChange={(e) =>
                      updateRow(i, { entryFee: Math.round(Number(e.target.value) * 100) })
                    }
                  />
                </div>

                {/* Remove */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-destructive hover:text-destructive"
                  onClick={() => removeRow(i)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="size-4" />
              Add Row
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary preview */}
      {pendingClasses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>{pendingClasses.length} classes will be created</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {pendingClasses.map((row, i) => {
                const def = classByDef.get(row.classDefinitionId);
                return (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {def?.name.replace(/^SV /, '') ?? '?'} · {SEX_LABELS[row.sex]} · {COAT_LABELS[row.svCoatType]}
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          size="lg"
          className="w-full sm:w-auto"
          disabled={setupMutation.isPending}
          onClick={handleSave}
        >
          {setupMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save SV Classes
        </Button>
      </div>
    </div>
  );
}
