'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Loader2,
  PoundSterling,
  Ticket,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { formatCurrency } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { statusConfig, daysUntil } from './_lib/show-utils';
import { ShowSectionNav } from './_components/show-section-nav';

export default function ShowManagementLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const { data: show, isLoading: showLoading } = trpc.shows.getById.useQuery({
    id,
  });
  const { data: stats } = trpc.secretary.getShowStats.useQuery({ showId: id });

  const updateMutation = trpc.shows.update.useMutation();
  const utils = trpc.useUtils();

  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  if (showLoading) {
    return (
      <div className="space-y-6 pb-16 md:pb-0">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!show) {
    return (
      <div className="space-y-6 pb-16 md:pb-0">
        <p className="text-muted-foreground">Show not found.</p>
        <Button variant="outline" asChild>
          <Link href="/secretary">
            <ArrowLeft className="size-4" />
            Back to Dashboard
          </Link>
        </Button>
      </div>
    );
  }

  const showStatus = statusConfig[show.status] ?? {
    label: show.status,
    variant: 'outline' as const,
  };

  const riskyTransitions: Record<string, string> = {
    cancelled:
      'This will mark the show as cancelled. Exhibitors will no longer be able to view or manage their entries.',
    entries_open:
      'This will open entries to the public. Make sure all classes and pricing are set up correctly before proceeding.',
    completed:
      'This will mark the show as completed. This should only be done after the event has finished.',
  };

  async function applyStatusChange(newStatus: string) {
    try {
      await updateMutation.mutateAsync({
        id,
        status: newStatus as
          | 'draft'
          | 'published'
          | 'entries_open'
          | 'entries_closed'
          | 'in_progress'
          | 'completed'
          | 'cancelled',
      });
      await utils.shows.getById.invalidate({ id });
      toast.success(
        `Show status updated to ${statusConfig[newStatus]?.label ?? newStatus}`
      );
    } catch {
      toast.error('Failed to update show status');
    }
    setPendingStatus(null);
  }

  function handleStatusChange(newStatus: string) {
    if (!show || newStatus === show.status) return;
    if (riskyTransitions[newStatus]) {
      setPendingStatus(newStatus);
    } else {
      applyStatusChange(newStatus);
    }
  }

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="-ml-2">
              <Link href="/secretary">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <h1 className="truncate text-lg font-bold tracking-tight sm:text-2xl">
              {show.name}
            </h1>
            <Badge variant={showStatus.variant} className="shrink-0">
              {showStatus.label}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {show.organisation?.name}
            {show.venue && ` — ${show.venue.name}`}
          </p>
        </div>
        <Select onValueChange={handleStatusChange} value={show.status}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Change status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="entries_open">Entries Open</SelectItem>
            <SelectItem value="entries_closed">Entries Closed</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Status change confirmation dialog */}
      <Dialog
        open={!!pendingStatus}
        onOpenChange={(open) => !open && setPendingStatus(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Change status to{' '}
              {statusConfig[pendingStatus ?? '']?.label ?? pendingStatus}?
            </DialogTitle>
            <DialogDescription>
              {riskyTransitions[pendingStatus ?? '']}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPendingStatus(null)}>
              Cancel
            </Button>
            <Button
              variant={
                pendingStatus === 'cancelled' ? 'destructive' : 'default'
              }
              onClick={() => pendingStatus && applyStatusChange(pendingStatus)}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription className="text-sm font-medium">
              Entries
            </CardDescription>
            <Ticket className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats?.totalEntries ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription className="text-sm font-medium">
              Confirmed
            </CardDescription>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {stats?.confirmedEntries ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription className="text-sm font-medium">
              Revenue
            </CardDescription>
            <PoundSterling className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(stats?.totalRevenue ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription className="text-sm font-medium">
              Days Until Show
            </CardDescription>
            <Clock className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {daysUntil(show.startDate) > 0
                ? daysUntil(show.startDate)
                : 'Past'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Section navigation */}
      <ShowSectionNav showId={id} />

      {/* Active section content */}
      {children}
    </div>
  );
}
