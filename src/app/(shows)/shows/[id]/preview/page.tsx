import type { Metadata } from 'next';
import { ShowPreviewClient } from './show-preview';

export const metadata: Metadata = {
  title: 'Show page — design preview',
  robots: { index: false, follow: false },
};

export default function ShowPreviewPage() {
  return <ShowPreviewClient />;
}
