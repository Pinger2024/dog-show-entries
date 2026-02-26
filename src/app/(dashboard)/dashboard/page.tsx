import Link from 'next/link';
import { Dog, Ticket, CalendarDays, Plus, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { requireAuth } from '@/lib/auth-utils';

const stats = [
  { label: 'Total Dogs', value: '0', icon: Dog, href: '/dogs' },
  { label: 'Upcoming Shows', value: '0', icon: CalendarDays, href: '/shows' },
  { label: 'Total Entries', value: '0', icon: Ticket, href: '/entries' },
];

export default async function DashboardPage() {
  const user = await requireAuth();
  const firstName = user.name?.split(' ')[0] ?? 'there';

  return (
    <div className="space-y-8 pb-16 md:pb-0">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Welcome back, {firstName}
        </h1>
        <p className="mt-1 text-muted-foreground">
          Here&apos;s what&apos;s happening with your shows and dogs.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="transition-all hover:border-primary/20 hover:shadow-md hover:shadow-primary/5">
              <CardHeader className="flex-row items-center justify-between pb-2">
                <CardDescription className="text-sm font-medium">
                  {stat.label}
                </CardDescription>
                <stat.icon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stat.value}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/shows">
            <Plus className="size-4" />
            Enter a Show
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dogs/new">
            <Plus className="size-4" />
            Add a Dog
          </Link>
        </Button>
      </div>

      {/* Upcoming entries (empty state) */}
      <Card>
        <CardHeader>
          <CardTitle>Upcoming Entries</CardTitle>
          <CardDescription>
            Your confirmed entries for upcoming shows
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Ticket className="size-6 text-primary" />
            </div>
            <h3 className="font-semibold">No upcoming entries</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              You haven&apos;t entered any upcoming shows yet. Browse available
              shows to get started.
            </p>
            <Button className="mt-4" size="sm" asChild>
              <Link href="/shows">
                Browse Shows
                <ArrowRight className="ml-1 size-3.5" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
