'use client';

import { useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { format } from 'date-fns';
import DOMPurify from 'dompurify';
import {
  Inbox,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { PageHeader, PageTitle, PageDescription } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';

type FeedbackStatus = 'pending' | 'in_progress' | 'completed' | 'dismissed';

const statusConfig: Record<
  FeedbackStatus,
  { label: string; color: string; icon: typeof Clock }
> = {
  pending: {
    label: 'Pending',
    color: 'bg-amber-100 text-amber-800',
    icon: AlertCircle,
  },
  in_progress: {
    label: 'In Progress',
    color: 'bg-blue-100 text-blue-800',
    icon: Clock,
  },
  completed: {
    label: 'Completed',
    color: 'bg-emerald-100 text-emerald-800',
    icon: CheckCircle2,
  },
  dismissed: {
    label: 'Dismissed',
    color: 'bg-gray-100 text-gray-600',
    icon: XCircle,
  },
};

const statCards: { key: FeedbackStatus; label: string; icon: typeof Clock }[] = [
  { key: 'pending', label: 'Pending', icon: AlertCircle },
  { key: 'in_progress', label: 'In Progress', icon: Clock },
  { key: 'completed', label: 'Completed', icon: CheckCircle2 },
  { key: 'dismissed', label: 'Dismissed', icon: XCircle },
];

function SanitizedHtml({ html }: { html: string }) {
  const clean = useMemo(() => DOMPurify.sanitize(html), [html]);
  return (
    <div
      className="prose prose-sm max-w-none rounded-lg bg-muted/30 p-3 sm:p-4"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

export default function FeedbackPage() {
  const { data: session } = useSession();
  const [activeFilter, setActiveFilter] = useState<FeedbackStatus | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isAdmin = session?.user?.role === 'admin';

  const { data: counts, isLoading: countsLoading } =
    trpc.feedback.counts.useQuery(undefined, { enabled: isAdmin });

  const { data: items, isLoading: itemsLoading } =
    trpc.feedback.list.useQuery(
      { status: activeFilter ?? undefined },
      { enabled: isAdmin }
    );

  const utils = trpc.useUtils();

  const updateStatus = trpc.feedback.updateStatus.useMutation({
    onSuccess: () => {
      utils.feedback.list.invalidate();
      utils.feedback.counts.invalidate();
    },
  });

  const updateNotes = trpc.feedback.updateNotes.useMutation({
    onSuccess: () => {
      utils.feedback.list.invalidate();
    },
  });

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-destructive/10">
          <XCircle className="size-7 text-destructive" />
        </div>
        <h2 className="text-lg font-semibold">Access Denied</h2>
        <p className="mt-2 text-muted-foreground">
          You need admin privileges to view this page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16 md:pb-0">
      <PageHeader>
        <div>
          <PageTitle>Feedback Inbox</PageTitle>
          <PageDescription>Email replies and feedback from Amanda and users.</PageDescription>
        </div>
      </PageHeader>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
        {statCards.map((stat) => {
          const isActive = activeFilter === stat.key;
          return (
            <button
              key={stat.key}
              onClick={() =>
                setActiveFilter(isActive ? null : stat.key)
              }
              className="text-left"
            >
              <Card
                className={cn(
                  'transition-all hover:border-primary/20 hover:shadow-md hover:shadow-primary/5',
                  isActive && 'border-primary ring-1 ring-primary/20'
                )}
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardDescription className="text-[0.9375rem] font-medium">
                    {stat.label}
                  </CardDescription>
                  <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                    <stat.icon className="size-4.5 text-primary" />
                  </div>
                </CardHeader>
                <CardContent>
                  {countsLoading ? (
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                  ) : (
                    <p className="text-2xl font-bold sm:text-3xl">
                      {counts?.[stat.key] ?? 0}
                    </p>
                  )}
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      {/* Feedback list */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">
            {activeFilter
              ? `${statusConfig[activeFilter].label} Feedback`
              : 'All Feedback'}
          </CardTitle>
          <CardDescription>
            {activeFilter ? (
              <button
                onClick={() => setActiveFilter(null)}
                className="text-primary hover:underline"
              >
                Clear filter
              </button>
            ) : (
              'Click a stat card above to filter by status'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {itemsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : !items || items.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No feedback yet"
              description="When Amanda or users reply to emails from Remi, their responses will appear here."
            />
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const config = statusConfig[item.status as FeedbackStatus];
                const isExpanded = expandedId === item.id;

                return (
                  <div
                    key={item.id}
                    className="rounded-lg border transition-colors"
                  >
                    {/* Summary row */}
                    <button
                      onClick={() =>
                        setExpandedId(isExpanded ? null : item.id)
                      }
                      className="flex w-full items-start justify-between gap-3 p-3 text-left sm:p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-semibold">
                            {item.subject || '(No subject)'}
                          </p>
                          {item.source === 'widget' && (
                            <Badge variant="outline" className="text-xs border-violet-300 text-violet-700 bg-violet-50">
                              Widget
                            </Badge>
                          )}
                          {item.feedbackType && item.feedbackType !== 'general' && (
                            <Badge variant="outline" className="text-xs capitalize">
                              {item.feedbackType}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.9375rem] text-muted-foreground">
                          <span>
                            {item.fromName
                              ? `${item.fromName} <${item.fromEmail}>`
                              : item.fromEmail}
                          </span>
                          <span>
                            {format(new Date(item.createdAt), 'd MMM yyyy, HH:mm')}
                          </span>
                        </div>
                        {!isExpanded && item.textBody && (
                          <p className="mt-2 line-clamp-2 text-[0.9375rem] text-muted-foreground">
                            {item.textBody.slice(0, 200)}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge className={config.color}>
                          {config.label}
                        </Badge>
                        {isExpanded ? (
                          <ChevronUp className="size-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="size-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t px-3 py-3 sm:px-4 sm:py-4">
                        {/* Workflow banner for widget submissions */}
                        {item.source === 'widget' && (
                          <div className="mb-3 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm">
                            <p className="font-medium text-violet-900">User support request</p>
                            <p className="mt-0.5 text-xs text-violet-700">
                              Submitted via the Help & Feedback widget. If you need more info, contact Michael & Amanda — not the user directly. Email the user at <strong>{item.fromEmail}</strong> once resolved.
                            </p>
                          </div>
                        )}
                        {/* Email body */}
                        {item.htmlBody ? (
                          <SanitizedHtml html={item.htmlBody} />
                        ) : item.textBody ? (
                          <pre className="whitespace-pre-wrap rounded-lg bg-muted/30 p-4 font-sans text-[0.9375rem]">
                            {item.textBody}
                          </pre>
                        ) : (
                          <p className="italic text-muted-foreground">
                            No email body available
                          </p>
                        )}

                        {/* Attachment */}
                        {item.attachmentUrl && (
                          <div className="mt-3">
                            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Attachment</p>
                            <a
                              href={item.attachmentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group block overflow-hidden rounded-lg border transition-colors hover:border-primary/30"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={item.attachmentUrl}
                                alt={item.attachmentFileName ?? 'Attachment'}
                                className="max-h-64 w-full object-contain bg-muted/20"
                              />
                              <div className="flex items-center gap-1.5 border-t bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground group-hover:text-foreground">
                                <span className="truncate">{item.attachmentFileName ?? 'View full size'}</span>
                              </div>
                            </a>
                          </div>
                        )}

                        {/* Status buttons */}
                        <div className="mt-4 flex flex-wrap gap-2">
                          {(
                            ['pending', 'in_progress', 'completed', 'dismissed'] as const
                          ).map((s) => {
                            const sc = statusConfig[s];
                            return (
                              <Button
                                key={s}
                                variant={
                                  item.status === s ? 'default' : 'outline'
                                }
                                size="sm"
                                disabled={
                                  item.status === s ||
                                  updateStatus.isPending
                                }
                                onClick={() =>
                                  updateStatus.mutate({
                                    id: item.id,
                                    status: s,
                                  })
                                }
                              >
                                <sc.icon className="mr-1.5 size-3.5" />
                                {sc.label}
                              </Button>
                            );
                          })}
                        </div>

                        {/* Notes */}
                        <div className="mt-4">
                          <label className="mb-1.5 block text-sm font-medium">
                            Developer Notes
                          </label>
                          <Textarea
                            placeholder="Add notes about this feedback..."
                            defaultValue={item.notes ?? ''}
                            rows={3}
                            onBlur={(e) => {
                              const value = e.target.value || null;
                              if (value !== (item.notes ?? null)) {
                                updateNotes.mutate({
                                  id: item.id,
                                  notes: value,
                                });
                              }
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
