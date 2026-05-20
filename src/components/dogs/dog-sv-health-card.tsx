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

// Amanda 2026-05-19: extended hip / elbow grading to recognise BVA + ANKC
// alongside the SV grade vocab. "Other" surfaces a free-text field so any
// uncommon scheme (e.g. FCI national) can still be entered.
const HIP_OPTIONS = [
  { value: 'not_required', label: 'Not yet required' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast_normal', label: 'Fast Normal' },
  { value: 'noch_zugelassen', label: 'Noch Zugelassen' },
  { value: 'bva', label: 'BVA' },
  { value: 'ankc', label: 'ANKC' },
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
  { value: 'not_required', label: 'Not yet required' },
  { value: 'yes', label: 'Yes — clear' },
  { value: 'no', label: 'No — not clear' },
  { value: 'not_tested', label: 'Not tested' },
] as const;

const KOERUNG_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'current_year', label: 'Current Year Koerung' },
  { value: 'lebenzeit', label: 'Koerung Lebenzeit' },
] as const;

// Working titles per Amanda 2026-05-19 — SchH replaced with the modern
// IGP nomenclature; HGH (Herdengebrauchshund / herding) included.
const WORKING_TITLE_OPTIONS = [
  { value: '', label: '— Not specified —' },
  { value: 'ZAP', label: 'ZAP' },
  { value: 'IGP1', label: 'IGP1' },
  { value: 'IGP2', label: 'IGP2' },
  { value: 'IGP3', label: 'IGP3' },
  { value: 'HGH', label: 'HGH' },
  { value: '__other__', label: 'Other (free text)' },
] as const;

const WORKING_TITLE_PRESETS = new Set(['ZAP', 'IGP1', 'IGP2', 'IGP3', 'HGH']);

interface DogSvHealthCardProps {
  dogId: string;
  isOwner: boolean;
  /** Dog's sex — Haemophilia clear field only renders for males per SV
   *  health protocol (Amanda 2026-05-19). */
  sex?: 'dog' | 'bitch' | null;
}

export function DogSvHealthCard({ dogId, isOwner, sex }: DogSvHealthCardProps) {
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
  const [hipScoreOther, setHipScoreOther] = useState('');
  const [elbowGrade, setElbowGrade] = useState<string>('not_required');
  const [elbowScore, setElbowScore] = useState('');
  const [elbowScoreOther, setElbowScoreOther] = useState('');
  const [haemophiliaClear, setHaemophiliaClear] = useState<string>('not_required');
  const [dmTest, setDmTest] = useState<string>('not_required');
  const [koerung, setKoerung] = useState<string>('none');
  const [workingTitle, setWorkingTitle] = useState('');
  // Tracks which dropdown option is currently selected. Stored as either
  // a preset code or the sentinel '__other__'. The actual title text lives
  // in `workingTitle` (preset code OR custom free-text).
  const [workingTitleChoice, setWorkingTitleChoice] = useState('');
  const [breedSurveyClass, setBreedSurveyClass] = useState('');
  const [breedSurveyYear, setBreedSurveyYear] = useState('');
  const [breedSurveyor, setBreedSurveyor] = useState('');
  const [saved, setSaved] = useState(false);

  const isMale = sex === 'dog';

  useEffect(() => {
    if (profile) {
      setHipGrade(profile.hipGrade ?? 'not_required');
      setHipScore(profile.hipScore ?? '');
      setHipScoreOther((profile as { hipScoreOther?: string | null }).hipScoreOther ?? '');
      setElbowGrade(profile.elbowGrade ?? 'not_required');
      setElbowScore(profile.elbowScore ?? '');
      setElbowScoreOther((profile as { elbowScoreOther?: string | null }).elbowScoreOther ?? '');
      setHaemophiliaClear(profile.haemophiliaClear ?? 'not_required');
      setDmTest(profile.dmTest ?? 'not_required');
      setKoerung(profile.koerung ?? 'none');
      const wt = profile.workingTitle ?? '';
      setWorkingTitle(wt);
      setWorkingTitleChoice(wt && !WORKING_TITLE_PRESETS.has(wt) ? '__other__' : wt);
      setBreedSurveyClass(profile.breedSurveyClass ?? '');
      const bsy = (profile as { breedSurveyYear?: number | null }).breedSurveyYear;
      setBreedSurveyYear(bsy != null ? String(bsy) : '');
      setBreedSurveyor((profile as { breedSurveyor?: string | null }).breedSurveyor ?? '');
    }
  }, [profile]);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    upsert.mutate({
      dogId,
      hipGrade: hipGrade as typeof HIP_OPTIONS[number]['value'],
      hipScore: hipScore || null,
      hipScoreOther: hipGrade === 'other' ? (hipScoreOther || null) : null,
      elbowGrade: elbowGrade as typeof HIP_OPTIONS[number]['value'],
      elbowScore: elbowScore || null,
      elbowScoreOther: elbowGrade === 'other' ? (elbowScoreOther || null) : null,
      // Haemophilia is meaningless for bitches — persist as not_required.
      haemophiliaClear: (isMale ? haemophiliaClear : 'not_required') as typeof HAEM_OPTIONS[number]['value'],
      dmTest: dmTest as typeof DM_OPTIONS[number]['value'],
      koerung: koerung as typeof KOERUNG_OPTIONS[number]['value'],
      workingTitle: workingTitle || null,
      breedSurveyClass: breedSurveyClass || null,
      breedSurveyYear: breedSurveyYear ? Number(breedSurveyYear) : null,
      breedSurveyor: breedSurveyor || null,
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
          {/* Hips — body dropdown + numeric score for BVA/ANKC + free text for Other */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Hip Grade / Body</Label>
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
            {(hipGrade === 'bva' || hipGrade === 'ankc') && (
              <div className="space-y-1.5">
                <Label>Hip Score <span className="text-muted-foreground font-normal">(opt.)</span></Label>
                <Input
                  value={hipScore}
                  onChange={(e) => setHipScore(e.target.value)}
                  placeholder={hipGrade === 'bva' ? 'e.g. 4:4 (total 8)' : 'e.g. 0:0'}
                  disabled={readOnly}
                />
              </div>
            )}
            {hipGrade === 'other' && (
              <div className="space-y-1.5">
                <Label>Other body / score</Label>
                <Input
                  value={hipScoreOther}
                  onChange={(e) => setHipScoreOther(e.target.value)}
                  placeholder="e.g. FCI A1 / KKL"
                  disabled={readOnly}
                />
              </div>
            )}
          </div>

          {/* Elbows */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Elbow Grade / Body</Label>
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
            {(elbowGrade === 'bva' || elbowGrade === 'ankc') && (
              <div className="space-y-1.5">
                <Label>Elbow Score <span className="text-muted-foreground font-normal">(opt.)</span></Label>
                <Input
                  value={elbowScore}
                  onChange={(e) => setElbowScore(e.target.value)}
                  placeholder={elbowGrade === 'bva' ? 'e.g. 0 or 1' : 'e.g. 0:0'}
                  disabled={readOnly}
                />
              </div>
            )}
            {elbowGrade === 'other' && (
              <div className="space-y-1.5">
                <Label>Other body / score</Label>
                <Input
                  value={elbowScoreOther}
                  onChange={(e) => setElbowScoreOther(e.target.value)}
                  placeholder="e.g. FCI 0 / OFA Normal"
                  disabled={readOnly}
                />
              </div>
            )}
          </div>

          {/* DNA — Haemophilia is male-only per SV health protocol */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {isMale && (
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
            )}
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

          {/* Koerung + Breed Survey details */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Koerung</Label>
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

          {/* Breed Survey Year + Surveyor — Amanda 2026-05-19: mandatory
              for Adult-class entries under SV rules. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Breed Survey Year <span className="text-muted-foreground font-normal">(opt.)</span></Label>
              <Input
                type="number"
                min={1900}
                max={2100}
                value={breedSurveyYear}
                onChange={(e) => setBreedSurveyYear(e.target.value)}
                placeholder="e.g. 2024"
                disabled={readOnly}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Surveyor <span className="text-muted-foreground font-normal">(opt.)</span></Label>
              <Input
                value={breedSurveyor}
                onChange={(e) => setBreedSurveyor(e.target.value)}
                placeholder="Name of SV surveyor"
                disabled={readOnly}
              />
              <p className="text-[11px] text-muted-foreground">Mandatory for Adult-class entries.</p>
            </div>
          </div>

          {/* Working Title — preset dropdown + Other free text. */}
          <div className="space-y-1.5">
            <Label>Working Title <span className="text-muted-foreground font-normal">(opt.)</span></Label>
            <Select
              value={workingTitleChoice || 'none'}
              onValueChange={(v) => {
                if (v === 'none') {
                  setWorkingTitleChoice('');
                  setWorkingTitle('');
                } else if (v === '__other__') {
                  setWorkingTitleChoice('__other__');
                  if (WORKING_TITLE_PRESETS.has(workingTitle)) setWorkingTitle('');
                } else {
                  setWorkingTitleChoice(v);
                  setWorkingTitle(v);
                }
              }}
              disabled={readOnly}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a working title" />
              </SelectTrigger>
              <SelectContent>
                {WORKING_TITLE_OPTIONS.map((o) => (
                  <SelectItem key={o.value || 'none'} value={o.value || 'none'}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {workingTitleChoice === '__other__' && (
              <Input
                value={workingTitle}
                onChange={(e) => setWorkingTitle(e.target.value)}
                placeholder="Type the working title"
                disabled={readOnly}
                className="mt-2"
              />
            )}
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
