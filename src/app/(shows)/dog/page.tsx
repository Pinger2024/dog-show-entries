import type { Metadata } from 'next';
import { FindADogClient } from './find-a-dog-client';

const BASE_URL = 'https://remishowmanager.co.uk';
const TITLE = 'Find a Dog — Show Results & Judges’ Critiques | Remi';
const DESCRIPTION =
  'Look up a dog by name to see its results and the judges’ critiques from shows run on Remi.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${BASE_URL}/dog` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${BASE_URL}/dog`,
    type: 'website',
    siteName: 'Remi Show Manager',
  },
};

export default function FindADogPage() {
  return <FindADogClient />;
}
