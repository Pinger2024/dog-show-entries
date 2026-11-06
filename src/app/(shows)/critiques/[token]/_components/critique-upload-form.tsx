'use client';

import { useRef, useState } from 'react';
import { FileText, Loader2, Type, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/**
 * Upload = the ONE primary action for a judge who's often 60+ and not
 * confident with computers — a big button, no jargon. "Paste the text
 * instead" is a quiet fallback link, not a second equal choice, for judges
 * who typed their critiques somewhere that isn't a Word document.
 */
export function CritiqueUploadForm({ token, onUploaded }: { token: string; onUploaded: () => void }) {
  const [busy, setBusy] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function upload(body: FormData) {
    setBusy(true);
    try {
      const res = await fetch(`/api/critique-upload/${token}`, { method: 'POST', body });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(json?.error ?? 'Something went wrong — please try again.');
      }
      toast.success('Critiques received — please check them over');
      onUploaded();
    } catch (err) {
      toast.error('Could not send your critiques', { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    void upload(body);
  }

  function handlePasteSubmit() {
    if (!pastedText.trim()) {
      toast.error('Please paste your critiques first');
      return;
    }
    const body = new FormData();
    body.append('text', pastedText);
    void upload(body);
  }

  if (busy) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Reading your critiques…</p>
      </div>
    );
  }

  if (showPaste) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Paste your critiques below, then send them to us.</p>
        <Textarea
          rows={10}
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          placeholder="Paste your critiques here…"
        />
        <Button className="min-h-[2.75rem] w-full" onClick={handlePasteSubmit}>
          <Type className="size-4" />
          Send Critiques
        </Button>
        <button
          type="button"
          className="mx-auto block min-h-[2.75rem] text-sm text-muted-foreground underline hover:text-foreground"
          onClick={() => setShowPaste(false)}
        >
          Upload a file instead
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10">
        <FileText className="size-7 text-primary" />
      </div>
      <div>
        <p className="font-medium">Send us your critiques</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload your Word document and we&apos;ll do the rest.
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,.txt,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button className="min-h-[2.75rem] w-full" onClick={() => fileInputRef.current?.click()}>
        <UploadCloud className="size-4" />
        Choose File
      </Button>
      <button
        type="button"
        className="mx-auto block min-h-[2.75rem] text-sm text-muted-foreground underline hover:text-foreground"
        onClick={() => setShowPaste(true)}
      >
        Paste the text instead
      </button>
    </div>
  );
}
