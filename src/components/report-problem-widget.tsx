'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { MessageCircleQuestion, Send, Loader2, Bug, Lightbulb, HelpCircle, MessageSquare } from 'lucide-react';
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

export function ReportProblemWidget() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('bug');
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
      feedbackType,
      pageUrl: window.location.href,
      userAgent: navigator.userAgent,
    });
  }

  function handleClose() {
    setOpen(false);
    setTimeout(() => {
      setSubmitted(false);
      setFeedbackType('bug');
      setSubject('');
      setBody('');
    }, 200);
  }

  const ph = placeholders[feedbackType];

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-3 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 md:bottom-6 md:right-6"
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
                <p className="text-xs text-muted-foreground">
                  We&apos;ll automatically include the page you&apos;re on and your browser details.
                  We&apos;ll email you at{' '}
                  <span className="font-medium">{session.user.email}</span> with an update.
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
