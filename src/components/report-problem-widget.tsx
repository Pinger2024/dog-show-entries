'use client';

import { useState, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import {
  MessageCircleQuestion,
  Send,
  Loader2,
  Bug,
  Lightbulb,
  HelpCircle,
  MessageSquare,
  Paperclip,
  Camera,
  X,
  Image as ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

type FeedbackType = 'bug' | 'feature' | 'question' | 'general';

const feedbackTypes: { value: FeedbackType; label: string; icon: typeof Bug; description: string }[] = [
  { value: 'bug', label: 'Bug', icon: Bug, description: 'Something isn\'t working' },
  { value: 'feature', label: 'Idea', icon: Lightbulb, description: 'A feature or improvement' },
  { value: 'question', label: 'Question', icon: HelpCircle, description: 'Need help with something' },
  { value: 'general', label: 'Other', icon: MessageSquare, description: 'General feedback' },
];

const placeholders: Record<FeedbackType, { subject: string; body: string }> = {
  bug: {
    subject: "e.g. Can't submit my entry, button doesn't respond",
    body: 'What were you trying to do? What happened instead?',
  },
  feature: {
    subject: 'e.g. It would be great if I could filter results by breed',
    body: 'Describe your idea — what would it do and how would it help you?',
  },
  question: {
    subject: 'e.g. How do I add a second dog to my entry?',
    body: 'What do you need help with?',
  },
  general: {
    subject: 'Brief summary',
    body: 'Tell us what\'s on your mind',
  },
};

interface AttachmentState {
  file: File;
  preview: string;
  uploading: boolean;
  uploaded?: { url: string; key: string; fileName: string };
  error?: string;
}

export function ReportProblemWidget() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('bug');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [attachment, setAttachment] = useState<AttachmentState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submit = trpc.feedback.submit.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      setSubject('');
      setBody('');
      setAttachment(null);
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to submit. Please try again.');
    },
  });

  // Only show for logged-in users
  if (!session?.user) return null;

  // Don't show on auth pages
  if (pathname.startsWith('/login') || pathname.startsWith('/register') || pathname.startsWith('/onboarding')) {
    return null;
  }

  async function uploadFile(file: File): Promise<{ url: string; key: string; fileName: string } | null> {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/upload/feedback-attachment', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Upload failed');
    }

    return res.json();
  }

  function handleFileSelect(file: File) {
    // Validate client-side
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Only images are supported (JPEG, PNG, WebP)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }

    const preview = URL.createObjectURL(file);
    const state: AttachmentState = { file, preview, uploading: true };
    setAttachment(state);

    // Upload immediately
    uploadFile(file)
      .then((result) => {
        if (result) {
          setAttachment((prev) =>
            prev ? { ...prev, uploading: false, uploaded: result } : null
          );
        }
      })
      .catch((err) => {
        setAttachment((prev) =>
          prev
            ? { ...prev, uploading: false, error: err.message }
            : null
        );
        toast.error(err.message || 'Failed to upload image');
      });
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    // Reset so the same file can be re-selected
    e.target.value = '';
  }

  function removeAttachment() {
    if (attachment?.preview) {
      URL.revokeObjectURL(attachment.preview);
    }
    setAttachment(null);
  }

  const handleScreenshot = useCallback(async () => {
    try {
      // Close dialog temporarily so it's not in the screenshot
      setOpen(false);

      // Small delay to let the dialog close
      await new Promise((r) => setTimeout(r, 300));

      const canvas = await import('html2canvas').then((mod) =>
        mod.default(document.body, {
          useCORS: true,
          scale: Math.min(window.devicePixelRatio, 2),
          logging: false,
        })
      );

      // Re-open dialog
      setOpen(true);

      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `screenshot-${Date.now()}.png`, {
            type: 'image/png',
          });
          handleFileSelect(file);
        }
      }, 'image/png');
    } catch {
      setOpen(true);
      toast.error('Screenshot failed. Try attaching an image instead.');
    }
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) return;
    if (attachment?.uploading) {
      toast.error('Please wait for the image to finish uploading');
      return;
    }

    submit.mutate({
      subject: subject.trim(),
      body: body.trim(),
      feedbackType,
      pageUrl: window.location.href,
      userAgent: navigator.userAgent,
      attachmentUrl: attachment?.uploaded?.url,
      attachmentFileName: attachment?.uploaded?.fileName,
      attachmentStorageKey: attachment?.uploaded?.key,
    });
  }

  function handleClose() {
    setOpen(false);
    setTimeout(() => {
      setSubmitted(false);
      setFeedbackType('bug');
      setSubject('');
      setBody('');
      if (attachment?.preview) URL.revokeObjectURL(attachment.preview);
      setAttachment(null);
    }, 200);
  }

  const ph = placeholders[feedbackType];
  const isUploading = attachment?.uploading ?? false;

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-3 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 md:bottom-6 md:right-6"
        aria-label="Help & Feedback"
      >
        <MessageCircleQuestion className="size-5" />
      </button>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
        <DialogContent className="sm:max-w-md">
          {submitted ? (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-emerald-100">
                <Send className="size-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-semibold">Thanks for your feedback!</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  We&apos;ve received your {feedbackType === 'bug' ? 'report' : feedbackType === 'feature' ? 'idea' : 'message'} and will get back to you at{' '}
                  <span className="font-medium">{session.user.email}</span> once we&apos;ve looked into it.
                </p>
              </div>
              <Button onClick={handleClose} variant="outline" className="mt-2">
                Close
              </Button>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="font-serif text-lg">Help & Feedback</DialogTitle>
                <DialogDescription>
                  Found a bug, have an idea, or need help? We&apos;d love to hear from you.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Type selector */}
                <div className="grid grid-cols-4 gap-2">
                  {feedbackTypes.map((t) => {
                    const Icon = t.icon;
                    const isActive = feedbackType === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setFeedbackType(t.value)}
                        className={cn(
                          'flex flex-col items-center gap-1 rounded-lg border p-2 text-center transition-colors',
                          isActive
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground'
                        )}
                      >
                        <Icon className="size-4" />
                        <span className="text-xs font-medium">{t.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="report-subject">
                    {feedbackType === 'bug' ? "What's the issue?" : feedbackType === 'feature' ? "What's your idea?" : feedbackType === 'question' ? 'What do you need help with?' : 'Subject'}
                  </Label>
                  <Input
                    id="report-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={ph.subject}
                    required
                    minLength={3}
                    maxLength={500}
                    className="h-11"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="report-body">Tell us more</Label>
                  <Textarea
                    id="report-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder={ph.body}
                    required
                    minLength={5}
                    maxLength={5000}
                    rows={4}
                  />
                </div>

                {/* Attachment section */}
                <div className="space-y-2">
                  <Label className="text-sm">Attach an image</Label>
                  {attachment ? (
                    <div className="relative overflow-hidden rounded-lg border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={attachment.preview}
                        alt="Attachment preview"
                        className="max-h-40 w-full object-contain bg-muted/30"
                      />
                      {attachment.uploading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                          <Loader2 className="size-5 animate-spin text-primary" />
                        </div>
                      )}
                      {attachment.error && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                          <p className="text-xs text-destructive">{attachment.error}</p>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={removeAttachment}
                        className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-background/80 text-muted-foreground shadow-sm transition-colors hover:bg-background hover:text-foreground"
                        aria-label="Remove attachment"
                      >
                        <X className="size-3.5" />
                      </button>
                      {attachment.uploaded && (
                        <div className="flex items-center gap-1.5 border-t bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700">
                          <ImageIcon className="size-3" />
                          <span className="truncate">{attachment.uploaded.fileName}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1.5"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Paperclip className="size-3.5" />
                        Choose image
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1.5"
                        onClick={handleScreenshot}
                      >
                        <Camera className="size-3.5" />
                        Screenshot
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={handleFileInput}
                      />
                    </div>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  We&apos;ll automatically include the page you&apos;re on and your browser details.
                  We&apos;ll email you at{' '}
                  <span className="font-medium">{session.user.email}</span> with an update.
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={submit.isPending || !subject.trim() || !body.trim() || isUploading}
                  >
                    {submit.isPending ? (
                      <>
                        <Loader2 className="mr-1.5 size-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="mr-1.5 size-4" />
                        Send
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
