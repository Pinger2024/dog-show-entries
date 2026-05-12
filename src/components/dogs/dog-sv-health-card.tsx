'use client';

import { useState, useEffect } from 'react';
import { Check, Loader2, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Label } from '@/components/ui/label';

const HIP_OPTIONS = [
  { value: 'not_required', label: 'Not required' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast_normal', label: 'Fast Normal' },
  { value: 'noch_zugelassen', label: 'Noch Zugelassen' },
  { value: 'other', label: 'Other' },
] as const;

const DM_OPTIONS = [
  { value: 'not_required', label: 'Not required' },
  { value: 'clear', label: 'Clear' },
  { value: 'carrier', label: 'Carrier' },
  { value: 'affected', label: 'Affected' },
  { value: 'not_tested', label: 'Not tested' },
] as const;

const HAEM_OPTIONS = [
  { value: 'not_required', label: 'Not required' },
  { value: 'yes', label: 'Yes — clear' },
  { value: 'no', label: 'No — not clear' },
  { value: 'not_tested', label: 'Not tested' },
] as const;

const KOERUNG_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'current_year', label: 'Breed Survey (current year)' },
  { value: 'lebenzeit', label: 'Breed Survey for Life (Lebenzeit)' },
] as const;

interface DogSvHealthCardProps {
  dogId: string;
  isOwner: boolean;
}

export function DogSvHealthCard({ dogId, isOwner }: DogSvHealthCardProps) {
  const utils = trpc.useUtils();
  const { data: profile, isLoading } = trpc.dogs.getSvProfile.useQuery({ dogId });
  const upsert = trpc.dogs.upsertSvProfile.useMutation({
    onSuccess: () => {
      utils.dogs.getSvProfile.invalidate({ dogId });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err) => toast.error('Failed to save', { description: err.message }),
  });

  const [hipGrade, setHipGrade] = useState<string>('not_required');
  const [hipScore, setHipScore] = useState('');
  const [elbowGrade, setElbowGrade] = useState<string>('not_required');
  const [elbowScore, setElbowScore] = useState('');
  const [haemophiliaClear, setHaemophiliaClear] = useState<string>('not_required');
  const [dmTest, setDmTest] = useState<string>('not_required');
  const [koerung, setKoerung] = useState<string>('none');
  const [workingTitle, setWorkingTitle] = useState('');
  const [breedSurveyClass, setBreedSurveyClass] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setHipGrade(profile.hipGrade ?? 'not_required');
      setHipScore(profile.hipScore ?? '');
      setElbowGrade(profile.elbowGrade ?? 'not_required');
      setElbowScore(profile.elbowScore ?? '');
      setHaemophiliaClear(profile.haemophiliaClear ?? 'not_required');
      setDmTest(profile.dmTest ?? 'not_required');
      setKoerung(profile.koerung ?? 'none');
      setWorkingTitle(profile.workingTitle ?? '');
      setBreedSurveyClass(profile.breedSurveyClass ?? '');
    }
  }, [profile]);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    upsert.mutate({
      dogId,
      hipGrade: hipGrade as typeof HIP_OPTIONS[number]['value'],
      hipScore: hipScore || null,
      elbowGrade: elbowGrade as typeof HIP_OPTIONS[number]['value'],
      elbowScore: elbowScore || null,
      haemophiliaClear: haemophiliaClear as typeof HAEM_OPTIONS[number]['value'],
      dmTest: dmTest as typeof DM_OPTIONS[number]['value'],
      koerung: koerung as typeof KOERUNG_OPTIONS[number]['value'],
      workingTitle: workingTitle || null,
      breedSurveyClass: breedSurveyClass || null,
    });
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="size-4 text-primary" />
            SV Health &amp; Working Titles
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const readOnly = !isOwner;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="size-4 text-primary" />
          SV Health &amp; Working Titles
        </CardTitle>
        <CardDescription>
          Health screening results and working titles required for WUSV/SV regional shows.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          {/* Hips */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Hip Grade</Label>
              <Select value={hipGrade} onValueChange={setHipGrade} disabled={readOnly}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HIP_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Hip Score <span className="text-muted-foreground font-normal">(opt.)</span></Label>
              <Input
                value={hipScore}
                onChange={(e) => setHipScore(e.target.value)}
                placeholder="e.g. 4:4"
                disabled={readOnly}
              />
            </div>
          </div>

          {/* Elbows */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Elbow Grade</Label>
              <Select value={elbowGrade} onValueChange={setElbowGrade} disabled={readOnly}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HIP_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Elbow Score <span className="text-muted-foreground font-normal">(opt.)</span></Label>
              <Input
                value={elbowScore}
                onChange={(e) => setElbowScore(e.target.value)}
                placeholder="e.g. 0:0"
                disabled={readOnly}
              />
            </div>
          </div>

          {/* DNA */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Haemophilia Clear</Label>
              <Select value={haemophiliaClear} onValueChange={setHaemophiliaClear} disabled={readOnly}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HAEM_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>DM Test</Label>
              <Select value={dmTest} onValueChange={setDmTest} disabled={readOnly}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DM_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Koerung & Working Title */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Breed Survey (Körklass)</Label>
              <Select value={koerung} onValueChange={setKoerung} disabled={readOnly}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KOERUNG_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Breed Survey Class <span className="text-muted-foreground font-normal">(opt.)</span></Label>
              <Input
                value={breedSurveyClass}
                onChange={(e) => setBreedSurveyClass(e.target.value)}
                placeholder="e.g. KK1"
                disabled={readOnly}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Working Title <span className="text-muted-foreground font-normal">(opt.)</span></Label>
            <Input
              value={workingTitle}
              onChange={(e) => setWorkingTitle(e.target.value)}
              placeholder="e.g. IGP3, ZAP, HGH"
              disabled={readOnly}
            />
            <p className="text-xs text-muted-foreground">Required for the Working class.</p>
          </div>

          {!readOnly && (
            <Button type="submit" size="sm" disabled={upsert.isPending} className="min-h-[2.75rem]">
              {upsert.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : saved ? (
                <>
                  <Check className="size-4" />
                  Saved
                </>
              ) : (
                'Save Health Data'
              )}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
