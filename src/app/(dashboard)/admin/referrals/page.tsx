'use client';

import { useState } from 'react';
import { BarChart3, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
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
import { formatCurrency } from '@/lib/date-utils';
import { format } from 'date-fns';

const SOURCE_LABELS: Record<string, { label: string; emoji: string }> = {
  whatsapp: { label: 'WhatsApp', emoji: '💬' },
  facebook: { label: 'Facebook', emoji: '📘' },
  instagram: { label: 'Instagram', emoji: '📸' },
  copy: { label: 'Copy link', emoji: '🔗' },
  hero: { label: 'Hero share button', emoji: '⭐' },
};

export default function AdminReferralsPage() {
  const [days, setDays] = useState(90);
  const { data, isLoading } = trpc.adminDashboard.getReferralSourceBreakdown.useQuery({ days });
  const { data: shareData } = trpc.adminDashboard.getShareEventBreakdown.useQuery({ days });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
            <BarChart3 className="size-6 text-primary" />
            Referral sources
          </h1>
          <p className="mt-1 text-muted-foreground">
            Which share channels drive paid entries on Remi.
          </p>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="180">Last 6 months</SelectItem>
            <SelectItem value="365">Last 12 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardDescription>Paid orders</CardDescription>
                <CardTitle className="font-serif text-4xl">
                  {data.totals.orderCount}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Gross revenue</CardDescription>
                <CardTitle className="font-serif text-4xl">
                  {formatCurrency(data.totals.grossAmount)}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>By channel</CardTitle>
              <CardDescription>
                Since {format(new Date(data.since), 'EEE d MMM yyyy')}. &ldquo;Direct&rdquo;
                means the exhibitor landed without a tracked share link.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.rows.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No paid orders in this window yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-4 font-medium">Source</th>
                        <th className="py-2 pr-4 text-right font-medium">Orders</th>
                        <th className="py-2 pr-4 text-right font-medium">Share</th>
                        <th className="py-2 pr-4 text-right font-medium">Revenue</th>
                        <th className="py-2 pr-4 font-medium">First seen</th>
                        <th className="py-2 font-medium">Last seen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.rows.map((row) => {
                        const label = row.source
                          ? (SOURCE_LABELS[row.source]?.label ?? row.source)
                          : 'Direct';
                        const emoji = row.source ? SOURCE_LABELS[row.source]?.emoji ?? '🔗' : '↩️';
                        return (
                          <tr key={row.source ?? '__direct__'}>
                            <td className="py-3 pr-4">
                              <span className="mr-2">{emoji}</span>
                              <span className="font-medium">{label}</span>
                            </td>
                            <td className="py-3 pr-4 text-right tabular-nums">{row.orderCount}</td>
                            <td className="py-3 pr-4 text-right tabular-nums text-muted-foreground">
                              {row.sharePct}%
                            </td>
                            <td className="py-3 pr-4 text-right font-semibold tabular-nums">
                              {formatCurrency(row.grossAmount)}
                            </td>
                            <td className="py-3 pr-4 text-muted-foreground">
                              {row.firstSeen ? format(new Date(row.firstSeen), 'd MMM yyyy') : '—'}
                            </td>
                            <td className="py-3 text-muted-foreground">
                              {row.lastSeen ? format(new Date(row.lastSeen), 'd MMM yyyy') : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {shareData && (
            <Card>
              <CardHeader>
                <CardTitle>Share activity</CardTitle>
                <CardDescription>
                  Every tap of a share button over the same {data.days}-day window.
                  These are outgoing shares — the &ldquo;By channel&rdquo; table above
                  is the conversions they produce.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {shareData.rows.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No shares logged yet in this window.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="py-2 pr-4 font-medium">Channel</th>
                          <th className="py-2 pr-4 text-right font-medium">Shares</th>
                          <th className="py-2 pr-4 text-right font-medium">Share of total</th>
                          <th className="py-2 pr-4 font-medium">First seen</th>
                          <th className="py-2 font-medium">Last seen</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {shareData.rows.map((row) => {
                          const label = SOURCE_LABELS[row.channel]?.label ?? row.channel;
                          const emoji = SOURCE_LABELS[row.channel]?.emoji ?? '🔗';
                          return (
                            <tr key={row.channel}>
                              <td className="py-3 pr-4">
                                <span className="mr-2">{emoji}</span>
                                <span className="font-medium">{label}</span>
                              </td>
                              <td className="py-3 pr-4 text-right tabular-nums">{row.count}</td>
                              <td className="py-3 pr-4 text-right tabular-nums text-muted-foreground">
                                {row.sharePct}%
                              </td>
                              <td className="py-3 pr-4 text-muted-foreground">
                                {row.firstSeen ? format(new Date(row.firstSeen), 'd MMM yyyy') : '—'}
                              </td>
                              <td className="py-3 text-muted-foreground">
                                {row.lastSeen ? format(new Date(row.lastSeen), 'd MMM yyyy') : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
