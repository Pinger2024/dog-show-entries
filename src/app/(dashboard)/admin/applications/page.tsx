'use client';

import { useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { format } from 'date-fns';
import {
  ClipboardCheck,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Mail,
  Phone,
  Globe,
  Building2,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PageHeader, PageTitle, PageDescription } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

const CLUB_TYPE_LABELS: Record<string, string> = {
  single_breed: 'Single Breed',
  multi_breed: 'Multi Breed',
};

const STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    color: 'bg-amber-100 text-amber-800',
    icon: Clock,
  },
  approved: {
    label: 'Approved',
    color: 'bg-emerald-100 text-emerald-800',
    icon: CheckCircle2,
  },
  rejected: {
    label: 'Rejected',
    color: 'bg-red-100 text-red-800',
    icon: XCircle,
  },
} as const;

export default function ApplicationsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  const utils = trpc.useUtils();

  // Always fetch all applications — filter client-side to avoid loading flash on tab switch
  const { data, isLoading } = trpc.applications.list.useQuery();

  const reviewMutation = trpc.applications.review.useMutation({
    onSuccess: (result) => {
      const action =
        result.action === 'approved' ? 'approved' : 'rejected';
      toast.success(`Application ${action}`, {
        description:
          result.action === 'approved'
            ? 'An invitation has been sent to the applicant.'
            : 'The applicant has been notified.',
      });
      setExpandedId(null);
      setReviewNote('');
      utils.applications.list.invalidate();
    },
    onError: (err) => {
      toast.error('Review failed', { description: err.message });
    },
  });

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <XCircle className="size-7 text-destructive" />
        <h2 className="mt-3 text-lg font-semibold">Access Denied</h2>
        <p className="mt-1.5 text-muted-foreground">
          You don&apos;t have permission to view this page.
        </p>
      </div>
    );
  }

  const counts = data?.counts ?? { pending: 0, approved: 0, rejected: 0 };
  const allApplications = data?.applications ?? [];

  const filteredApplications = useMemo(
    () =>
      statusFilter === 'all'
        ? allApplications
        : allApplications.filter((a) => a.status === statusFilter),
    [allApplications, statusFilter]
  );

  const handleExpand = (id: string | null) => {
    setExpandedId(id);
    setReviewNote('');
  };

  const statCards: {
    label: string;
    value: number;
    filter: StatusFilter;
    icon: typeof Clock;
    activeClass: string;
  }[] = [
    {
      label: 'Pending',
      value: counts.pending,
      filter: 'pending',
      icon: Clock,
      activeClass: 'border-amber-300 bg-amber-50',
    },
    {
      label: 'Approved',
      value: counts.approved,
      filter: 'approved',
      icon: CheckCircle2,
      activeClass: 'border-emerald-300 bg-emerald-50',
    },
    {
      label: 'Rejected',
      value: counts.rejected,
      filter: 'rejected',
      icon: XCircle,
      activeClass: 'border-red-300 bg-red-50',
    },
  ];

  return (
    <div className="space-y-6 sm:space-y-8 pb-16 md:pb-0">
      <PageHeader>
        <div>
          <PageTitle>Secretary Applications</PageTitle>
          <PageDescription>
            Review and manage secretary access requests.
          </PageDescription>
        </div>
      </PageHeader>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4">
        {statCards.map((stat) => (
          <button
            key={stat.filter}
            onClick={() =>
              setStatusFilter(
                statusFilter === stat.filter ? 'all' : stat.filter
              )
            }
            className="text-left"
          >
            <Card
              className={cn(
                'transition-all hover:shadow-md',
                statusFilter === stat.filter && stat.activeClass
              )}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-4 lg:p-6">
                <CardDescription className="text-xs sm:text-[0.9375rem] font-medium">
                  {stat.label}
                </CardDescription>
                <div className="flex size-8 sm:size-9 items-center justify-center rounded-lg bg-primary/10">
                  <stat.icon className="size-4 sm:size-4.5 text-primary" />
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4 lg:px-6 lg:pb-6 pt-0">
                {isLoading ? (
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                ) : (
                  <p className="text-2xl sm:text-3xl font-bold">
                    {stat.value}
                  </p>
                )}
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {/* Applications list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <ClipboardCheck className="size-5" />
            {statusFilter === 'all'
              ? 'All Applications'
              : `${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)} Applications`}
          </CardTitle>
          <CardDescription>
            {statusFilter !== 'all' && (
              <button
                onClick={() => setStatusFilter('all')}
                className="text-primary hover:underline"
              >
                Clear filter
              </button>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredApplications.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title={`No ${statusFilter !== 'all' ? statusFilter + ' ' : ''}applications`}
              description="No applications to display yet."
            />
          ) : (
            <div className="space-y-2 sm:space-y-3">
              {filteredApplications.map((app) => {
                const config = STATUS_CONFIG[app.status];
                const isExpanded = expandedId === app.id;

                return (
                  <div
                    key={app.id}
                    className="rounded-lg border transition-colors"
                  >
                    {/* Summary row */}
                    <button
                      onClick={() =>
                        handleExpand(isExpanded ? null : app.id)
                      }
                      className="flex w-full items-center justify-between gap-2 p-3 text-left sm:gap-3 sm:p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm sm:text-[0.9375rem] font-medium">
                            {app.user.name ?? app.user.email}
                          </span>
                          <Badge
                            className={cn(
                              'text-xs shrink-0',
                              config.color
                            )}
                          >
                            {config.label}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="text-xs shrink-0"
                          >
                            {CLUB_TYPE_LABELS[app.clubType] ?? app.clubType}
                          </Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Building2 className="size-3" />
                            {app.organisationName}
                          </span>
                          <span>
                            {format(
                              new Date(app.createdAt),
                              'd MMM yyyy'
                            )}
                          </span>
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="border-t px-3 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                              <User className="size-4 text-muted-foreground" />
                              <span>
                                {app.user.name} ({app.user.email})
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Mail className="size-4 text-muted-foreground" />
                              <span>{app.contactEmail}</span>
                            </div>
                            {app.contactPhone && (
                              <div className="flex items-center gap-2">
                                <Phone className="size-4 text-muted-foreground" />
                                <span>{app.contactPhone}</span>
                              </div>
                            )}
                            {app.website && (
                              <div className="flex items-center gap-2">
                                <Globe className="size-4 text-muted-foreground" />
                                <a
                                  href={app.website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline"
                                >
                                  {app.website}
                                </a>
                              </div>
                            )}
                          </div>
                          <div className="space-y-2 text-sm">
                            <div>
                              <span className="font-medium">
                                Organisation:
                              </span>{' '}
                              {app.organisationName}
                            </div>
                            {app.breedOrGroup && (
                              <div>
                                <span className="font-medium">
                                  Breed/Group:
                                </span>{' '}
                                {app.breedOrGroup}
                              </div>
                            )}
                            {app.kcRegNumber && (
                              <div>
                                <span className="font-medium">
                                  RKC Reg:
                                </span>{' '}
                                {app.kcRegNumber}
                              </div>
                            )}
                          </div>
                        </div>

                        {app.details && (
                          <div className="mt-3 rounded-lg bg-muted/50 p-3 text-sm">
                            <p className="font-medium mb-1">
                              About their club:
                            </p>
                            <p className="whitespace-pre-wrap text-muted-foreground">
                              {app.details}
                            </p>
                          </div>
                        )}

                        {app.reviewNotes && app.status !== 'pending' && (
                          <div className="mt-3 rounded-lg border-l-3 border-primary bg-primary/5 p-3 text-sm">
                            <p className="font-medium mb-1">
                              Review notes
                              {app.reviewedBy?.name &&
                                ` (${app.reviewedBy.name})`}
                              :
                            </p>
                            <p className="text-muted-foreground">
                              {app.reviewNotes}
                            </p>
                          </div>
                        )}

                        {/* Actions for pending applications */}
                        {app.status === 'pending' && (
                          <div className="mt-4 space-y-3 border-t pt-4">
                            <div className="space-y-2">
                              <label className="text-sm font-medium">
                                Notes{' '}
                                <span className="font-normal text-muted-foreground">
                                  (optional — included in email)
                                </span>
                              </label>
                              <Textarea
                                value={reviewNote}
                                onChange={(e) =>
                                  setReviewNote(e.target.value)
                                }
                                placeholder="Add any notes for the applicant..."
                                rows={2}
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button
                                onClick={() =>
                                  reviewMutation.mutate({
                                    id: app.id,
                                    action: 'approve',
                                    notes: reviewNote || undefined,
                                  })
                                }
                                disabled={reviewMutation.isPending}
                              >
                                {reviewMutation.isPending ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="size-4" />
                                )}
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                className="text-destructive hover:text-destructive"
                                onClick={() =>
                                  reviewMutation.mutate({
                                    id: app.id,
                                    action: 'reject',
                                    notes: reviewNote || undefined,
                                  })
                                }
                                disabled={reviewMutation.isPending}
                              >
                                {reviewMutation.isPending ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <XCircle className="size-4" />
                                )}
                                Reject
                              </Button>
                            </div>
                          </div>
                        )}
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
