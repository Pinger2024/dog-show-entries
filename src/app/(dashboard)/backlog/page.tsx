'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ListTodo,
  ChevronDown,
  ChevronUp,
  Flame,
  Target,
  FileText,
  MessageSquare,
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

type BacklogStatus = 'awaiting_feedback' | 'planned' | 'in_progress' | 'completed' | 'dismissed';

const statusConfig: Record<
  BacklogStatus,
  { label: string; color: string; icon: typeof Clock }
> = {
  awaiting_feedback: {
    label: 'Awaiting Feedback',
    color: 'bg-amber-100 text-amber-800',
    icon: MessageSquare,
  },
  planned: {
    label: 'Planned',
    color: 'bg-violet-100 text-violet-800',
    icon: ListTodo,
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

const statCards: { key: BacklogStatus; label: string; icon: typeof Clock }[] = [
  { key: 'awaiting_feedback', label: 'Awaiting', icon: MessageSquare },
  { key: 'planned', label: 'Planned', icon: ListTodo },
  { key: 'in_progress', label: 'In Progress', icon: Clock },
  { key: 'completed', label: 'Completed', icon: CheckCircle2 },
];

const priorityConfig = {
  high: { label: 'High', icon: Flame, color: 'text-orange-600' },
  medium: { label: 'Medium', icon: Target, color: 'text-blue-600' },
  low: { label: 'Low', icon: FileText, color: 'text-gray-500' },
};

export default function BacklogPage() {
  const { data: session } = useSession();
  const [activeFilter, setActiveFilter] = useState<BacklogStatus | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isAdmin = (session?.user as { role?: string } | undefined)?.role === 'admin';

  const { data: counts, isLoading: countsLoading } =
    trpc.backlog.counts.useQuery(undefined, { enabled: isAdmin });

  const { data: items, isLoading: itemsLoading } =
    trpc.backlog.list.useQuery(
      { status: activeFilter ?? undefined },
      { enabled: isAdmin }
    );

  const utils = trpc.useUtils();

  const updateStatus = trpc.backlog.updateStatus.useMutation({
    onSuccess: () => {
      utils.backlog.list.invalidate();
      utils.backlog.counts.invalidate();
    },
  });

  const updateNotes = trpc.backlog.updateNotes.useMutation({
    onSuccess: () => {
      utils.backlog.list.invalidate();
    },
  });

  const updateResponse = trpc.backlog.updateResponse.useMutation({
    onSuccess: () => {
      utils.backlog.list.invalidate();
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
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
          Feature Backlog
        </h1>
        <p className="mt-1.5 text-muted-foreground">
          Track feature requests from the UX review. Reference by # number in emails.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
        {statCards.map((stat) => {
          const isActive = activeFilter === stat.key;
          return (
            <button
              key={stat.key}
              onClick={() => setActiveFilter(isActive ? null : stat.key)}
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

      {/* Backlog list */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">
            {activeFilter
              ? `${statusConfig[activeFilter].label} Items`
              : 'All Features'}
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
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-14 text-center">
              <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-primary/10">
                <ListTodo className="size-7 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">No backlog items</h3>
              <p className="mx-auto mt-2 max-w-sm text-muted-foreground">
                Feature requests from the UX review will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const config = statusConfig[item.status as BacklogStatus];
                const pConfig = priorityConfig[item.priority as keyof typeof priorityConfig];
                const isExpanded = expandedId === item.id;
                const PIcon = pConfig.icon;

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
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-bold text-muted-foreground">
                            #{item.featureNumber}
                          </span>
                          <span className="font-semibold">{item.title}</span>
                          <PIcon className={cn('size-4', pConfig.color)} />
                        </div>
                        {!isExpanded && (
                          <p className="mt-1.5 line-clamp-2 text-[0.9375rem] text-muted-foreground">
                            {item.description}
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
                      <div className="border-t px-3 py-3 sm:px-4 sm:py-4 space-y-4">
                        {/* Description */}
                        <div>
                          <label className="mb-1 block text-sm font-medium text-muted-foreground">
                            Description
                          </label>
                          <p className="rounded-lg bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                            {item.description}
                          </p>
                        </div>

                        {/* Questions asked */}
                        {item.questions && (
                          <div>
                            <label className="mb-1 block text-sm font-medium text-muted-foreground">
                              Questions Asked
                            </label>
                            <pre className="whitespace-pre-wrap rounded-lg bg-blue-50 p-3 text-sm dark:bg-blue-950/30">
                              {item.questions}
                            </pre>
                          </div>
                        )}

                        {/* Latest response */}
                        <div>
                          <label className="mb-1.5 block text-sm font-medium">
                            Latest Response from Team
                          </label>
                          <Textarea
                            placeholder="Paste responses from Michael or Amanda here..."
                            defaultValue={item.latestResponse ?? ''}
                            rows={3}
                            onBlur={(e) => {
                              const value = e.target.value || null;
                              if (value !== (item.latestResponse ?? null)) {
                                updateResponse.mutate({
                                  id: item.id,
                                  latestResponse: value,
                                });
                              }
                            }}
                          />
                        </div>

                        {/* Status buttons */}
                        <div className="flex flex-wrap gap-2">
                          {(
                            ['awaiting_feedback', 'planned', 'in_progress', 'completed', 'dismissed'] as const
                          ).map((s) => {
                            const sc = statusConfig[s];
                            return (
                              <Button
                                key={s}
                                variant={item.status === s ? 'default' : 'outline'}
                                size="sm"
                                disabled={item.status === s || updateStatus.isPending}
                                onClick={() =>
                                  updateStatus.mutate({ id: item.id, status: s })
                                }
                              >
                                <sc.icon className="mr-1.5 size-3.5" />
                                {sc.label}
                              </Button>
                            );
                          })}
                        </div>

                        {/* Developer notes */}
                        <div>
                          <label className="mb-1.5 block text-sm font-medium">
                            Developer Notes
                          </label>
                          <Textarea
                            placeholder="Internal notes about implementation..."
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
