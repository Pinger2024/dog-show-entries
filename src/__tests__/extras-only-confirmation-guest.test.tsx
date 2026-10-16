import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExtrasOnlyConfirmation } from '@/app/(shows)/shows/[id]/enter/extras-only-confirmation';
import { seeOrderLaterCopy } from '@/lib/sign-in';

const base = {
  userEmail: 'jane@example.com',
  firstName: 'Jane',
  showName: 'Winter Spectacular',
  showSlugOrId: 'winter',
  startDate: '2026-12-05',
  orderId: 'abcdef12-0000-0000-0000-000000000000',
  paymentAmount: 700,
  items: [{ sundryItemId: 's1', name: 'Printed Catalogue', quantity: 1, unitPrice: 500 }],
  catalogueNote: null as never,
  hasParking: false,
};

describe('extras-only confirmation tells a signed-out buyer how to see the order', () => {
  it('shows the sign-in line with their email when signed out', () => {
    const html = renderToStaticMarkup(<ExtrasOnlyConfirmation {...base} signedIn={false} />);
    expect(html.replace(/&#x27;|&#39;/g, "'")).toContain(seeOrderLaterCopy('jane@example.com'));
    expect(html).toContain('Receipt sent to');
    expect(html).toContain('>View my order<');
  });
  it('does not show it when signed in', () => {
    const html = renderToStaticMarkup(<ExtrasOnlyConfirmation {...base} signedIn />);
    expect(html).not.toContain('To see your order on Remi later');
    expect(html).toContain('>View my entries and orders<');
  });
});
