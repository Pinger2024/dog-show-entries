'use client';

import { useState } from 'react';
import { format, parse, isValid } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/**
 * Friendly close-date picker. Replaces the raw `datetime-local` input (which
 * is fiddly on a phone) with a tap-to-open calendar plus a plain-English time
 * dropdown — the same calendar used when creating a show. Mandy 2026-06-12:
 * "I'd prefer to select the closing date rather than have to populate it."
 *
 * Value in/out is the `datetime-local` string format (YYYY-MM-DDTHH:mm) so the
 * surrounding form's submit logic is untouched.
 */

// Sensible close times in plain words. Default is end of day — most clubs
// close entries at midnight on the deadline day.
const TIME_OPTIONS: { value: string; label: string }[] = [
  { value: '23:59', label: 'End of day (11:59 pm)' },
  { value: '12:00', label: 'Midday (12:00 pm)' },
  { value: '09:00', label: 'Morning (9:00 am)' },
  { value: '17:00', label: 'Tea time (5:00 pm)' },
  { value: '20:00', label: 'Evening (8:00 pm)' },
];

function parseValue(value: string): { date: Date | undefined; time: string } {
  if (!value) return { date: undefined, time: '23:59' };
  const parsed = parse(value, "yyyy-MM-dd'T'HH:mm", new Date());
  if (!isValid(parsed)) return { date: undefined, time: '23:59' };
  return { date: parsed, time: format(parsed, 'HH:mm') };
}

function buildValue(date: Date | undefined, time: string): string {
  if (!date) return '';
  return `${format(date, 'yyyy-MM-dd')}T${time}`;
}

export function CloseDateField({
  id,
  value,
  onChange,
  disableBefore,
  disableAfter,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Dates strictly before this are not selectable (e.g. today). */
  disableBefore?: Date;
  /** Dates on/after this are not selectable (e.g. the show start date). */
  disableAfter?: Date;
}) {
  const [open, setOpen] = useState(false);
  const { date, time } = parseValue(value);

  const timeLabel =
    TIME_OPTIONS.find((t) => t.value === time)?.label ??
    format(parse(time, 'HH:mm', new Date()), 'h:mm a');

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn(
              'min-h-[2.75rem] flex-1 justify-start gap-2 text-left font-normal',
              !date && 'text-muted-foreground',
            )}
          >
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
            {date ? format(date, 'EEE d MMM yyyy') : 'Choose a date'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => {
              onChange(buildValue(d, time));
              if (d) setOpen(false);
            }}
            disabled={[
              ...(disableBefore ? [{ before: disableBefore }] : []),
              ...(disableAfter ? [{ after: disableAfter }] : []),
            ]}
            autoFocus
          />
        </PopoverContent>
      </Popover>

      <Select
        value={time}
        onValueChange={(t) => onChange(buildValue(date, t))}
      >
        <SelectTrigger
          className="min-h-[2.75rem] sm:w-[12rem]"
          aria-label="Closing time"
        >
          <SelectValue>{timeLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {TIME_OPTIONS.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
