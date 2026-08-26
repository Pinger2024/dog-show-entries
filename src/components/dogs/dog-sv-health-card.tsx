'use client';

import { useState, useEffect, useRef } from 'react';
import { Check, Loader2, Shield, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useBeaconAutosave } from '@/lib/use-beacon-autosave';
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
import { Checkbox } from '@/components/ui/checkbox';

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

// Sentinel value '__unset__' represents "haven't filled this in yet" and
// maps to NULL in the database. Distinct from 'none' which means the dog
// definitively has no Koerung. Default to '__unset__' so the dropdown
// starts blank rather than implicitly claiming "no Koerung" (Amanda
// 2026-05-20).
const KOERUNG_OPTIONS = [
  { value: '__unset__', label: '— Not specified —' },
  { value: 'none', label: 'None' },
  { value: 'current_year', label: 'Current Year Koerung' },
  { value: 'lebenzeit', label: 'Koerung Lebenzeit' },
] as const;

// DNA — mandatory for Yearling+ entries per GSDL/WUSV rules (Amanda
// 2026-05-20). Default blank so dogs without yet-recorded DNA aren't
// silently claiming they have it.
const DNA_OPTIONS = [
  { value: '__unset__', label: '— Not specified —' },
  { value: 'recorded', label: 'Recorded' },
  { value: 'proven', label: 'Proven (parentage verified)' },
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

/** BVA/KC hip/elbow/DNA-DM results a completed RKC profile lookup returned,
 *  offered to this card by DogForm (see dog-form.tsx's kcHealthSuggestions).
 *  Applied at most once, and only into fields still at their blank default —
 *  never overwriting anything the exhibitor already entered or loaded. */
export type KcHealthSuggestions = {
  hipScore?: string;
  elbowScore?: string;
  dmTest?: 'clear' | 'carrier' | 'affected';
};

interface DogSvHealthCardProps {
  dogId: string;
  isOwner: boolean;
  /** Dog's sex — Haemophilia clear field only renders for males per SV
   *  health protocol (Amanda 2026-05-19). */
  sex?: 'dog' | 'bitch' | null;
  kcHealthSuggestions?: KcHealthSuggestions;
}

export function DogSvHealthCard({ dogId, isOwner, sex, kcHealthSuggestions }: DogSvHealthCardProps) {
  const utils = trpc.useUtils();
  const { data: profile, isLoading } = trpc.dogs.getSvProfile.useQuery({ dogId });

  const [hipGrade, setHipGrade] = useState<string>('not_required');
  const [hipScore, setHipScore] = useState('');
  const [hipScoreOther, setHipScoreOther] = useState('');
  const [elbowGrade, setElbowGrade] = useState<string>('not_required');
  const [elbowScore, setElbowScore] = useState('');
  const [elbowScoreOther, setElbowScoreOther] = useState('');
  const [haemophiliaClear, setHaemophiliaClear] = useState<string>('not_required');
  const [dmTest, setDmTest] = useState<string>('not_required');
  const [koerung, setKoerung] = useState<string>('__unset__');
  const [dna, setDna] = useState<string>('__unset__');
  const [workingTitle, setWorkingTitle] = useState('');
  // Tracks which dropdown option is currently selected. Stored as either
  // a preset code or the sentinel '__other__'. The actual title text lives
  // in `workingTitle` (preset code OR custom free-text).
  const [workingTitleChoice, setWorkingTitleChoice] = useState('');
  const [breedSurveyClass, setBreedSurveyClass] = useState('');
  const [breedSurveyYear, setBreedSurveyYear] = useState('');
  const [breedSurveyor, setBreedSurveyor] = useState('');
  // Other Qualifications — the GSDL-BRG form's BH / AD / WB row. Ticks, not a
  // working title: a dog holding only these belongs in Adult (Mandy 2026-08-19).
  const [bh, setBh] = useState(false);
  const [ad, setAd] = useState(false);
  const [wb, setWb] = useState(false);
  const [otherQualifications, setOtherQualifications] = useState('');
  // Autosave arms only once the loaded profile has been written into local
  // state — never against blank mount defaults (the 2026-04-22 lesson).
  const [hydrated, setHydrated] = useState(false);

  const isMale = sex === 'dog';

  // Populate from the saved profile EXACTLY ONCE, when the query first
  // resolves. Critically NOT on every `profile` change: the autosave
  // invalidates getSvProfile on each save, which refetches and hands us a new
  // `profile` object — re-running population then would overwrite whatever the
  // exhibitor is mid-edit and could flash saved values back to blanks (Mandy
  // 2026-07-12: hip/elbow grades showed empty on reload). After first load the
  // local state is authoritative; the autosave pushes it to the server.
  const populatedRef = useRef(false);
  useEffect(() => {
    if (populatedRef.current || isLoading) return;
    if (profile) {
      setHipGrade(profile.hipGrade ?? 'not_required');
      setHipScore(profile.hipScore ?? '');
      setHipScoreOther((profile as { hipScoreOther?: string | null }).hipScoreOther ?? '');
      setElbowGrade(profile.elbowGrade ?? 'not_required');
      setElbowScore(profile.elbowScore ?? '');
      setElbowScoreOther((profile as { elbowScoreOther?: string | null }).elbowScoreOther ?? '');
      setHaemophiliaClear(profile.haemophiliaClear ?? 'not_required');
      setDmTest(profile.dmTest ?? 'not_required');
      setKoerung(profile.koerung ?? '__unset__');
      setDna((profile as { dna?: 'recorded' | 'proven' | null }).dna ?? '__unset__');
      const wt = profile.workingTitle ?? '';
      setWorkingTitle(wt);
      setWorkingTitleChoice(wt && !WORKING_TITLE_PRESETS.has(wt) ? '__other__' : wt);
      const quals = profile as {
        bh?: boolean | null;
        ad?: boolean | null;
        wb?: boolean | null;
        otherQualifications?: string | null;
      };
      setBh(quals.bh ?? false);
      setAd(quals.ad ?? false);
      setWb(quals.wb ?? false);
      setOtherQualifications(quals.otherQualifications ?? '');
      setBreedSurveyClass(profile.breedSurveyClass ?? '');
      const bsy = (profile as { breedSurveyYear?: number | null }).breedSurveyYear;
      setBreedSurveyYear(bsy != null ? String(bsy) : '');
      setBreedSurveyor((profile as { breedSurveyor?: string | null }).breedSurveyor ?? '');
    }
    // Mark populated + arm autosave once the query has resolved (profile is the
    // row, or null when the dog has no profile yet — a new dog).
    populatedRef.current = true;
    setHydrated(true);
  }, [profile, isLoading]);

  // Offer RKC's BVA/KC hip/elbow/DNA-DM results into whichever of these
  // fields are STILL blank once the saved profile has loaded — same
  // only-if-empty rule DogForm already uses for sire/dam. Applied at most
  // once per arriving `kcHealthSuggestions` (suggestionsAppliedRef), and
  // only after `hydrated` so it can never race the populate effect above:
  // if suggestions arrive before hydration, this waits for `hydrated` to
  // flip true; if they arrive after, it fires immediately. Deliberately
  // reads hipGrade/hipScore/etc. without listing them as deps — this must
  // check the value AT THE MOMENT suggestions arrive, not re-run every time
  // the exhibitor changes an unrelated field.
  const suggestionsAppliedRef = useRef(false);
  useEffect(() => {
    if (!kcHealthSuggestions || !hydrated || suggestionsAppliedRef.current) return;
    suggestionsAppliedRef.current = true;

    const filled: string[] = [];
    if (kcHealthSuggestions.hipScore && hipGrade === 'not_required' && !hipScore) {
      setHipGrade('bva');
      setHipScore(kcHealthSuggestions.hipScore);
      filled.push('BVA/KC hip score');
    }
    if (kcHealthSuggestions.elbowScore && elbowGrade === 'not_required' && !elbowScore) {
      setElbowGrade('bva');
      setElbowScore(kcHealthSuggestions.elbowScore);
      filled.push('BVA/KC elbow score');
    }
    if (kcHealthSuggestions.dmTest && dmTest === 'not_required') {
      setDmTest(kcHealthSuggestions.dmTest);
      filled.push('DNA-DM result');
    }

    if (filled.length > 0 && isOwner) {
      toast.success('Health results filled in from the Royal Kennel Club', {
        description: `${filled.join(', ')} — please check before saving.`,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kcHealthSuggestions, hydrated]);

  // Saves itself — no button. Mandy 2026-07-11: the separate "Save Health
  // Data" button was the second of two save buttons and exhibitors lost
  // data to it. Same field mapping the old button used, including the
  // '__unset__' sentinel guards (Amanda 2026-05-20).
  const autosaveStatus = useBeaconAutosave({
    url: `/api/dog-autosave/${dogId}`,
    enabled: isOwner,
    hydrated,
    payload: {
      svProfile: {
        hipGrade: hipGrade as typeof HIP_OPTIONS[number]['value'],
        // Score only belongs with a BVA/ANKC grade — null it otherwise so a
        // grade + orphaned score can never diverge (Mandy 2026-07-12).
        hipScore: (hipGrade === 'bva' || hipGrade === 'ankc') ? (hipScore || null) : null,
        hipScoreOther: hipGrade === 'other' ? (hipScoreOther || null) : null,
        elbowGrade: elbowGrade as typeof HIP_OPTIONS[number]['value'],
        elbowScore: (elbowGrade === 'bva' || elbowGrade === 'ankc') ? (elbowScore || null) : null,
        elbowScoreOther: elbowGrade === 'other' ? (elbowScoreOther || null) : null,
        // Haemophilia is meaningless for bitches — persist as not_required.
        haemophiliaClear: (isMale ? haemophiliaClear : 'not_required') as typeof HAEM_OPTIONS[number]['value'],
        dmTest: dmTest as typeof DM_OPTIONS[number]['value'],
        koerung: (['none', 'current_year', 'lebenzeit'] as const).includes(koerung as 'none')
          ? (koerung as 'none' | 'current_year' | 'lebenzeit')
          : null,
        dna: (['recorded', 'proven'] as const).includes(dna as 'recorded')
          ? (dna as 'recorded' | 'proven')
          : null,
        workingTitle: workingTitle || null,
        breedSurveyClass: breedSurveyClass || null,
        breedSurveyYear: breedSurveyYear ? Number(breedSurveyYear) : null,
        breedSurveyor: breedSurveyor || null,
        bh,
        ad,
        wb,
        otherQualifications: otherQualifications || null,
      },
    },
    onSaved: () => utils.dogs.getSvProfile.invalidate({ dogId }),
  });

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
    <Card className="border-se-honey/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="size-4 text-primary" />
          SV Health &amp; Working Titles
        </CardTitle>
        <CardDescription className="space-y-1">
          <span className="block">
            <span className="font-semibold text-foreground">Required for SV Regional shows and the British Sieger.</span>{' '}
            These events are governed by the GSDL-BRG / WUSV, not the Royal Kennel Club, and exhibitors must disclose health screening, DNA recording and (for Working class) Koerung + Working Title.
          </span>
          <span className="block text-xs">
            Hip score, elbow score and DNA are mandatory before a dog can be entered in Yearling, Adult or Working classes.
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Not a <form> — this card is rendered INSIDE the DogForm's
            <form>, and nested forms are invalid HTML (hydration error).
            It saves itself (debounce + unmount beacon) via useDogAutosave;
            the old separate "Save Health Data" button lost exhibitors'
            data when they only pressed one of two buttons (Mandy
            2026-07-11). */}
        {/* Every Select's onValueChange ignores a falsy value: Radix fires a
            spurious onValueChange('') during some re-renders (seen on the edit
            page, where this card sits inside DogForm), which would clobber a
            just-loaded grade back to blank — the bug Mandy hit 2026-07-12
            where saved hip/elbow grades showed empty. No option uses ''. */}
        <div className="space-y-4">
          {/* Hips — body dropdown + numeric score for BVA/ANKC + free text for Other */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Hip Grade / Body</Label>
              <Select value={hipGrade} onValueChange={(v) => v && setHipGrade(v)} disabled={readOnly}>
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
              <Select value={elbowGrade} onValueChange={(v) => v && setElbowGrade(v)} disabled={readOnly}>
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
                <Select value={haemophiliaClear} onValueChange={(v) => v && setHaemophiliaClear(v)} disabled={readOnly}>
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
              <Select value={dmTest} onValueChange={(v) => v && setDmTest(v)} disabled={readOnly}>
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

          {/* DNA — mandatory for Yearling+ entries per GSDL/WUSV rules.
              Default blank so dogs without yet-recorded DNA aren't
              silently flagged as recorded (Amanda 2026-05-20). */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>DNA</Label>
              <Select value={dna} onValueChange={(v) => v && setDna(v)} disabled={readOnly}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DNA_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Required for Yearling, Adult and Working class entries.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Koerung</Label>
              <Select value={koerung} onValueChange={(v) => v && setKoerung(v)} disabled={readOnly}>
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

          {/* Other Qualifications — the GSDL-BRG exhibit data form's
              "BH / AD / WB (Character Assessment) / Other" row, which had no
              home in Remi until now (Mandy 2026-08-19). Ticks rather than free
              text: the form exhibitors already fill in lists these three by
              name, and a blank box asking for German abbreviations is the
              wrong ask for our exhibitors. Each carries its English meaning
              because the abbreviations alone mean nothing to most owners.

              These never affect which class the dog can enter — the note below
              says so plainly, because an owner who has just ticked three boxes
              will reasonably wonder. */}
          <div className="space-y-2.5">
            <Label>Other Qualifications <span className="text-muted-foreground font-normal">(opt.)</span></Label>
            <div className="space-y-2.5">
              {([
                { key: 'bh', checked: bh, set: setBh, code: 'BH', meaning: 'Companion Dog Test' },
                { key: 'ad', checked: ad, set: setAd, code: 'AD', meaning: 'Endurance Test' },
                { key: 'wb', checked: wb, set: setWb, code: 'WB', meaning: 'Character Assessment' },
              ] as const).map((q) => (
                <div key={q.key} className="flex items-center gap-2.5">
                  <Checkbox
                    id={`qual-${q.key}`}
                    checked={q.checked}
                    onCheckedChange={(checked) => q.set(checked === true)}
                    disabled={readOnly}
                  />
                  <Label htmlFor={`qual-${q.key}`} className="font-normal cursor-pointer">
                    {q.code} <span className="text-muted-foreground">— {q.meaning}</span>
                  </Label>
                </div>
              ))}
            </div>
            <Input
              value={otherQualifications}
              onChange={(e) => setOtherQualifications(e.target.value)}
              placeholder="Any other qualification"
              disabled={readOnly}
            />
            <p className="text-[11px] text-muted-foreground">
              Printed in the catalogue after the working title. These don&apos;t decide which class your dog enters.
            </p>
          </div>

          {!readOnly && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
              {autosaveStatus === 'saving' ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> Saving…
                </>
              ) : autosaveStatus === 'saved' ? (
                <>
                  <Check className="size-3.5 text-green-600" />
                  <span className="text-green-700">Saved</span>
                </>
              ) : autosaveStatus === 'error' ? (
                <>
                  <TriangleAlert className="size-3.5 text-destructive" />
                  <span className="text-destructive">Couldn&apos;t save — check your connection.</span>
                </>
              ) : (
                <>
                  <Check className="size-3.5 text-green-600" /> Saves automatically as you type.
                </>
              )}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
