'use client';

import ShowsList from '@/components/shows/shows-list';
import { PageHeader, PageTitle, PageDescription } from '@/components/ui/page-header';

export default function BrowseShowsPage() {
  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <PageHeader>
        <div>
          <PageTitle>Find a Show</PageTitle>
          <PageDescription>Browse upcoming shows and enter your dog online.</PageDescription>
        </div>
      </PageHeader>
      <ShowsList />
    </div>
  );
}
