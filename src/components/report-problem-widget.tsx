'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { MessageCircleQuestion, Send, Loader2, X } from 'lucide-react';
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

export function ReportProblemWidget() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submit = trpc.feedback.submit.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      setSubject('');
      setBody('');
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) return;

    submit.mutate({
      subject: subject.trim(),
      body: body.trim(),
      pageUrl: window.location.href,
      userAgent: navigator.userAgent,
    });
  }

  function handleClose() {
    setOpen(false);
    // Reset after animation
    setTimeout(() => {
      setSubmitted(false);
      setSubject('');
      setBody('');
    }, 200);
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-3 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 md:bottom-6 md:right-6"
        aria-label="Report a problem"
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
                <h3 className="font-serif text-lg font-semibold">Thanks for letting us know!</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  We&apos;ve received your report and will get back to you at{' '}
                  <span className="font-medium">{session.user.email}</span> once it&apos;s resolved.
                </p>
              </div>
              <Button onClick={handleClose} variant="outline" className="mt-2">
                Close
              </Button>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="font-serif text-lg">Report a Problem</DialogTitle>
                <DialogDescription>
                  Spotted a bug or have a suggestion? Let us know and we&apos;ll get right on it.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="report-subject">What&apos;s the issue?</Label>
                  <Input
                    id="report-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Can't submit my entry, button doesn't work"
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
                    placeholder="What were you trying to do? What happened instead?"
                    required
                    minLength={5}
                    maxLength={5000}
                    rows={4}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  We&apos;ll automatically include the page you&apos;re on and your browser details
                  to help us diagnose the issue. We&apos;ll email you at{' '}
                  <span className="font-medium">{session.user.email}</span> when it&apos;s fixed.
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submit.isPending || !subject.trim() || !body.trim()}>
                    {submit.isPending ? (
                      <>
                        <Loader2 className="mr-1.5 size-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="mr-1.5 size-4" />
                        Send Report
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
