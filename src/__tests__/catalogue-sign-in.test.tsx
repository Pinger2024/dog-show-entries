import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CatalogueSignIn } from '@/app/(shows)/shows/[id]/catalogue/catalogue-sign-in';

describe('catalogue page, signed out', () => {
  const html = renderToStaticMarkup(<CatalogueSignIn idOrSlug="winter-spectacular" />);
  it('offers Sign in, coming back to the catalogue, and keeps Browse Shows', () => {
    expect(html).toContain('href="/login?callbackUrl=%2Fshows%2Fwinter-spectacular%2Fcatalogue"');
    expect(html).toContain('>Sign in<');
    expect(html).toContain('href="/browse"');
  });
  it('says which email to use', () => {
    expect(html).toContain('Sign in with the email address you used to buy your catalogue.');
  });
});
