import type { Metadata } from 'next';
import { ResultsHubClient } from './results-hub-client';

const BASE_URL = 'https://remishowmanager.co.uk';
const TITLE = 'Show Results — Live and Recent | Remi';
const DESCRIPTION = 'Live results from shows running today, and the results of shows already held on Remi.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${BASE_URL}/results` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${BASE_URL}/results`,
    type: 'website',
    siteName: 'Remi Show Manager',
  },
};

export default function ResultsPage() {
  return <ResultsHubClient />;
}
