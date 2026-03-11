'use client';

import { useState, useEffect } from 'react';
import { Users, Dog, Clock, CheckCircle2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';

function useCountdown(targetDate: string | null) {
  const [remaining, setRemaining] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);

  useEffect(() => {
    if (!targetDate) return;
    const target = new Date(targetDate).getTime();

    function update() {
      const diff = target - Date.now();
      if (diff <= 0) {
        setRemaining(null);
        return;
      }
      setRemaining({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return remaining;
}

function CountdownUnit({
  value,
  label,
  colorClass,
}: {
  value: number;
  label: string;
  colorClass: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <span className={`font-serif text-3xl font-bold tabular-nums ${colorClass}`}>
        {String(value).padStart(2, '0')}
      </span>
      <span className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export function LiveEntryStats({ showId }: { showId: string }) {
  const { data: stats } = trpc.shows.getPublicStats.useQuery(
    { showId },
    { refetchInterval: 60_000 }
  );

  const countdown = useCountdown(
    stats?.status === 'entries_open' ? stats.entryCloseDate : null
  );

  if (!stats) return null;

  const isOpen = stats.status === 'entries_open';
  const isCompleted = stats.status === 'completed';
  const isClosed = stats.status === 'entries_closed';

  // Urgency colour escalation: green → amber → red
  const totalHours = countdown
    ? countdown.days * 24 + countdown.hours
    : Infinity;
  const urgencyColor =
    totalHours < 24
      ? 'text-red-600'
      : totalHours < 72
        ? 'text-amber-600'
        : 'text-primary';

  return (
    <div className="rounded-xl border border-primary/30 bg-gradient-to-r from-primary/[0.07] to-card p-4 shadow-md sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Entry stats */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Dog className="size-4 text-primary/60" />
            <span className="font-serif text-2xl font-bold text-foreground">
              {stats.totalDogs}
            </span>
            <span className="text-xs text-muted-foreground">
              {stats.totalDogs === 1 ? 'dog' : 'dogs'} entered
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="size-4 text-primary/60" />
            <span className="font-serif text-2xl font-bold text-foreground">
              {stats.totalExhibitors}
            </span>
            <span className="text-xs text-muted-foreground">
              {stats.totalExhibitors === 1 ? 'exhibitor' : 'exhibitors'}
            </span>
          </div>
        </div>

        {/* Countdown or status */}
        {isOpen && countdown && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-4 shrink-0 text-muted-foreground/60" />
              <span>Closes in</span>
            </div>
            <div className="flex items-center gap-1.5">
              {countdown.days > 0 && (
                <>
                  <CountdownUnit value={countdown.days} label="days" colorClass={urgencyColor} />
                  <span className="text-lg text-muted-foreground/30">:</span>
                </>
              )}
              <CountdownUnit value={countdown.hours} label="hrs" colorClass={urgencyColor} />
              <span className="text-lg text-muted-foreground/30">:</span>
              <CountdownUnit value={countdown.minutes} label="min" colorClass={urgencyColor} />
              <span className="text-lg text-muted-foreground/30">:</span>
              <CountdownUnit value={countdown.seconds} label="sec" colorClass={urgencyColor} />
            </div>
          </div>
        )}

        {isOpen && !countdown && stats.entryCloseDate && (
          <div className="flex items-center gap-2 text-sm font-medium text-red-600">
            <Clock className="size-4" />
            Entries closing soon
          </div>
        )}

        {isClosed && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-primary/60" />
            Entries closed
          </div>
        )}

        {isCompleted && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-emerald-600" />
            Show completed
          </div>
        )}
      </div>
    </div>
  );
}
