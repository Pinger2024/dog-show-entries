'use client';

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Loader2, Upload, X, BookOpen, MessageCircle, UserCircle, Save } from 'lucide-react';
import Image from 'next/image';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useShowId } from '../_lib/show-context';
import type { ScheduleData } from '@/server/db/schema/shows';

export default function CatalogueSettingsPage() {
  const showId = useShowId();
  const utils = trpc.useUtils();

  const { data: show, isLoading: showLoading } = trpc.shows.getById.useQuery({ id: showId });
  const { data: scheduleData } = trpc.secretary.getScheduleData.useQuery({ showId });
  const { data: assignments, isLoading: judgesLoading } = trpc.secretary.getShowJudges.useQuery({ showId });

  const updateScheduleData = trpc.secretary.updateScheduleData.useMutation();
  const updateJudge = trpc.secretary.updateJudge.useMutation();

  // ── Welcome note state ──
  const [welcomeNote, setWelcomeNote] = useState('');
  const [welcomeNoteLoaded, setWelcomeNoteLoaded] = useState(false);
  const [savingWelcome, setSavingWelcome] = useState(false);
  const [welcomeSavedAt, setWelcomeSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (welcomeNoteLoaded) return;
    if (scheduleData === undefined) return;
    const sd = scheduleData as ScheduleData | null;
    setWelcomeNote(sd?.welcomeNote ?? '');
    setWelcomeNoteLoaded(true);
  }, [scheduleData, welcomeNoteLoaded]);

  async function saveWelcomeNote() {
    if (!show) return;
    setSavingWelcome(true);
    try {
      const existing = (scheduleData as ScheduleData | null) ?? {};
      await updateScheduleData.mutateAsync({
        showId,
        showOpenTime: show.showOpenTime ?? undefined,
        judgingStartTime: show.startTime ?? undefined,
        onCallVet: show.onCallVet ?? undefined,
        scheduleData: {
          ...existing,
          welcomeNote: welcomeNote.trim() || undefined,
        },
      });
      await utils.secretary.getScheduleData.invalidate({ showId });
      setWelcomeSavedAt(new Date());
      toast.success('Welcome note saved');
    } catch {
      toast.error('Failed to save welcome note');
    } finally {
      setSavingWelcome(false);
    }
  }

  // ── Build unique judge list (dedupe by judge id) ──
  const uniqueJudges = Array.from(
    new Map(
      (assignments ?? [])
        .filter((a) => a.judge)
        .map((a) => [a.judge!.id, a.judge!])
    ).values()
  );

  if (showLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BookOpen className="size-6 text-primary" />
          Catalogue Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customise how your catalogue looks — welcome note and judge profiles.
        </p>
      </div>

      {/* Welcome note */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="size-5" />
            Welcome Note
          </CardTitle>
          <CardDescription>
            A personal message to exhibitors shown in the catalogue front matter (optional).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={welcomeNote}
            onChange={(e) => setWelcomeNote(e.target.value)}
            placeholder="Welcome to our show! We hope you enjoy the day..."
            rows={5}
            className="min-h-[8rem]"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {welcomeSavedAt && `Saved at ${welcomeSavedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
            </p>
            <Button
              onClick={saveWelcomeNote}
              disabled={savingWelcome || !welcomeNoteLoaded}
              className="min-h-[2.75rem]"
            >
              {savingWelcome ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save Welcome Note
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Judge profiles */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCircle className="size-5" />
            Judge Profiles
          </CardTitle>
          <CardDescription>
            Add a photo and short biography for each judge to include in the catalogue (all optional).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {judgesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : uniqueJudges.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">
              No judges assigned yet. Go to the People section to add judges to this show.
            </p>
          ) : (
            <div className="space-y-6">
              {uniqueJudges.map((judge) => (
                <JudgeProfileEditor
                  key={judge.id}
                  judge={judge}
                  onSaved={async () => {
                    await utils.secretary.getShowJudges.invalidate({ showId });
                  }}
                  updateJudgeMutation={updateJudge}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Judge Profile Editor ──

interface Judge {
  id: string;
  name: string;
  bio: string | null;
  photoUrl: string | null;
  kennelClubAffix: string | null;
}

interface JudgeProfileEditorProps {
  judge: Judge;
  onSaved: () => void | Promise<void>;
  updateJudgeMutation: ReturnType<typeof trpc.secretary.updateJudge.useMutation>;
}

function JudgeProfileEditor({ judge, onSaved, updateJudgeMutation }: JudgeProfileEditorProps) {
  const [bio, setBio] = useState(judge.bio ?? '');
  const [photoUrl, setPhotoUrl] = useState(judge.photoUrl ?? '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync with upstream when judge data changes (e.g., after another judge's save triggers a refetch)
  useEffect(() => {
    setBio(judge.bio ?? '');
    setPhotoUrl(judge.photoUrl ?? '');
  }, [judge.id, judge.bio, judge.photoUrl]);

  async function handlePhotoUpload(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload/judge-photo', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error ?? 'Upload failed');
      }
      const { url } = await res.json();
      setPhotoUrl(url);
      toast.success('Photo uploaded — click Save to apply');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateJudgeMutation.mutateAsync({
        judgeId: judge.id,
        bio: bio.trim() || undefined,
        photoUrl: photoUrl || undefined,
      });
      await onSaved();
      setSavedAt(new Date());
      toast.success(`${judge.name} saved`);
    } catch {
      toast.error('Failed to save judge profile');
    } finally {
      setSaving(false);
    }
  }

  const displayName = judge.kennelClubAffix ? `${judge.name} (${judge.kennelClubAffix})` : judge.name;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-start gap-4">
        {/* Photo preview */}
        <div className="shrink-0">
          <div className="relative size-20 overflow-hidden rounded-full border bg-muted">
            {photoUrl ? (
              <Image src={photoUrl} alt={judge.name} fill sizes="80px" className="object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-muted-foreground">
                <UserCircle className="size-10" />
              </div>
            )}
          </div>
        </div>

        {/* Name + controls */}
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-semibold">{displayName}</p>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handlePhotoUpload(file);
                e.target.value = '';
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="min-h-[2.25rem]"
            >
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              {photoUrl ? 'Change Photo' : 'Upload Photo'}
            </Button>
            {photoUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPhotoUrl('')}
                className="min-h-[2.25rem] text-muted-foreground"
              >
                <X className="size-3.5" />
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`bio-${judge.id}`}>Biography</Label>
        <Textarea
          id={`bio-${judge.id}`}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="e.g. Started showing GSDs in 1985, judged at Crufts 2019..."
          rows={3}
          maxLength={2000}
        />
        <p className="text-xs text-muted-foreground">{bio.length}/2000</p>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {savedAt && `Saved at ${savedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
        </p>
        <Button onClick={handleSave} disabled={saving} size="sm" className="min-h-[2.25rem]">
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          Save
        </Button>
      </div>
    </div>
  );
}
