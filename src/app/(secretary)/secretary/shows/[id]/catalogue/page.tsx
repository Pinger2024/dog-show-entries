'use client';

import { useMemo } from 'react';
import {
  BookOpen,
  ClipboardList,
  Download,
  Hash,
  Loader2,
  FileText,
  List,
  SortAsc,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { formatDogName } from '@/lib/utils';
import { formatCurrency } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/ui/stat-card';
import { formatDate, type CatalogueEntryItem } from '../_lib/show-utils';
import { useShowId } from '../_lib/show-context';

export default function CataloguePage() {
  const showId = useShowId();

  const utils = trpc.useUtils();
  const { data: catalogueData, isLoading } =
    trpc.secretary.getCatalogueData.useQuery({ showId });
  const { data: absentees } =
    trpc.secretary.getAbsenteeList.useQuery({ showId });

  const assignMutation = trpc.secretary.assignCatalogueNumbers.useMutation({
    onSuccess: (data) => {
      toast.success(`Assigned catalogue numbers to ${data.assigned} entries`);
      utils.secretary.getCatalogueData.invalidate({ showId });
    },
    onError: () => toast.error('Failed to assign catalogue numbers'),
  });

  const entries = catalogueData?.entries ?? [];

  const grouped = useMemo(() => {
    const groups: Record<string, Record<string, { dogs: typeof entries; bitches: typeof entries }>> = {};
    for (const entry of entries) {
      const groupName = entry.dog?.breed?.group?.name ?? 'Unclassified';
      const breedName = entry.dog?.breed?.name ?? 'Unknown Breed';
      groups[groupName] ??= {};
      groups[groupName][breedName] ??= { dogs: [], bitches: [] };
      if (entry.dog?.sex === 'bitch') {
        groups[groupName][breedName].bitches.push(entry);
      } else {
        groups[groupName][breedName].dogs.push(entry);
      }
    }
    return groups;
  }, [entries]);

  const hasNumbers = entries.some((e) => e.catalogueNumber);

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Button
          onClick={() => assignMutation.mutate({ showId })}
          disabled={assignMutation.isPending || entries.length === 0}
        >
          {assignMutation.isPending && (
            <Loader2 className="size-4 animate-spin" />
          )}
          <Hash className="size-4" />
          Assign Catalogue Numbers
        </Button>
        {hasNumbers && (
          <>
            <Button variant="outline" asChild>
              <a
                href={`/api/catalogue/${showId}/standard`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileText className="size-4" />
                Standard
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a
                href={`/api/catalogue/${showId}/by-class`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <List className="size-4" />
                By Class
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a
                href={`/api/catalogue/${showId}/alphabetical`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <SortAsc className="size-4" />
                A–Z
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a
                href={`/api/catalogue/${showId}/absentees`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download className="size-4" />
                Absentees
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a
                href={`/api/judges-book/${showId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ClipboardList className="size-4" />
                Judge&apos;s Book
              </a>
            </Button>
          </>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Catalogue Entries" value={entries.length} icon={BookOpen} />
        <StatCard label="Absentees" value={absentees?.length ?? 0} icon={ClipboardList} />
        <StatCard label="Numbers Assigned" value={hasNumbers ? 'Yes' : 'Not yet'} icon={Hash} />
      </div>

      {/* Catalogue Preview */}
      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Loading catalogue data...
          </CardContent>
        </Card>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No confirmed entries yet"
          description="Entries will appear here once exhibitors have paid."
          variant="card"
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Catalogue Preview</CardTitle>
            <CardDescription>
              Entries ordered by breed group, breed, then sex
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {Object.entries(grouped)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([groupName, breeds]) => (
                <div key={groupName}>
                  <h3 className="mb-3 rounded bg-primary px-3 py-1.5 text-sm font-bold uppercase tracking-wider text-primary-foreground">
                    {groupName}
                  </h3>
                  {Object.entries(breeds)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([breedName, { dogs, bitches }]) => (
                      <div key={breedName} className="mb-4 pl-2">
                        <h4 className="mb-2 border-b font-semibold">
                          {breedName}
                        </h4>
                        {dogs.length > 0 && (
                          <>
                            <p className="mb-1 text-xs font-medium italic text-muted-foreground">
                              Dogs
                            </p>
                            {dogs.map((entry) => (
                              <CatalogueEntryRow
                                key={entry.id}
                                entry={entry}
                              />
                            ))}
                          </>
                        )}
                        {bitches.length > 0 && (
                          <>
                            <p className="mb-1 mt-2 text-xs font-medium italic text-muted-foreground">
                              Bitches
                            </p>
                            {bitches.map((entry) => (
                              <CatalogueEntryRow
                                key={entry.id}
                                entry={entry}
                              />
                            ))}
                          </>
                        )}
                      </div>
                    ))}
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {/* Absentee List */}
      {(absentees?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Absentee List</CardTitle>
            <CardDescription>
              Withdrawn entries with catalogue numbers
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Mobile card view */}
            <div className="space-y-2 sm:hidden">
              {absentees?.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <span className="font-mono text-sm font-bold text-muted-foreground shrink-0">
                    #{entry.catalogueNumber ?? '—'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{entry.dog?.registeredName ?? '—'}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {entry.dog?.breed?.name ?? '—'} &middot; {entry.exhibitor?.name ?? '—'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cat. No.</TableHead>
                    <TableHead>Dog</TableHead>
                    <TableHead>Breed</TableHead>
                    <TableHead>Exhibitor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {absentees?.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono font-bold">
                        {entry.catalogueNumber ?? '—'}
                      </TableCell>
                      <TableCell>
                        {entry.dog?.registeredName ?? '—'}
                      </TableCell>
                      <TableCell>{entry.dog?.breed?.name ?? '—'}</TableCell>
                      <TableCell>{entry.exhibitor?.name ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CatalogueEntryRow({ entry }: { entry: CatalogueEntryItem }) {
  return (
    <div className="mb-2 rounded border bg-card px-3 py-2 text-sm">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-xs font-bold text-muted-foreground">
          {entry.catalogueNumber ?? '—'}
        </span>
        <span className="font-semibold">
          {entry.dog ? formatDogName(entry.dog) : 'Junior Handler'}
        </span>
      </div>
      {entry.dog && (
        <div className="mt-1 grid grid-cols-2 gap-x-4 text-xs text-muted-foreground">
          {entry.dog.dateOfBirth && (
            <span>DOB: {formatDate(entry.dog.dateOfBirth)}</span>
          )}
          {entry.dog.sireName && <span>Sire: {entry.dog.sireName}</span>}
          {entry.dog.damName && <span>Dam: {entry.dog.damName}</span>}
          {entry.dog.breederName && (
            <span>Breeder: {entry.dog.breederName}</span>
          )}
        </div>
      )}
      {entry.dog?.owners && entry.dog.owners.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          Owner{entry.dog.owners.length > 1 ? 's' : ''}:{' '}
          {entry.dog.owners
            .map((o) => ('ownerName' in o ? o.ownerName : ''))
            .filter(Boolean)
            .join(' & ')}
        </p>
      )}
      {entry.entryClasses.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {entry.entryClasses.map((ec, i) => (
            <Badge key={i} variant="secondary" className="text-xs">
              {ec.showClass?.classDefinition?.name ?? '?'}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
