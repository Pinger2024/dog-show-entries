import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { MAGIC_LINK_BUTTON_LABEL, signInHref, seeOrderInEmailCopy, seeOrderLaterCopy } from '@/lib/sign-in';
import { findFiles } from './helpers/static-scan';

describe('sign-in wording has one owner', () => {
  it('the login form labels its button from the one owner, and nobody else spells the label out', () => {
    const form = fs.readFileSync(path.join(__dirname, '../app/(auth)/login/login-form.tsx'), 'utf8');
    expect(form).toMatch(/import \{ MAGIC_LINK_BUTTON_LABEL \} from '@\/lib\/sign-in'/);
    expect(form).toMatch(/: MAGIC_LINK_BUTTON_LABEL\)/);
    const copies = findFiles('src', ['.ts', '.tsx'])
      .filter((f) => !f.includes(`${path.sep}__tests__${path.sep}`) && !f.endsWith(path.join('lib', 'sign-in.ts')))
      .filter((f) => fs.readFileSync(f, 'utf8').includes(MAGIC_LINK_BUTTON_LABEL));
    expect(copies).toEqual([]);
  });
  it('builds an encoded callback link', () => {
    expect(signInHref('/shows/a-b/enter')).toBe('/login?callbackUrl=%2Fshows%2Fa-b%2Fenter');
  });
  it('names the email and the button', () => {
    expect(seeOrderLaterCopy('a@b.co')).toContain('sign in with a@b.co');
    expect(seeOrderInEmailCopy('a@b.co')).toContain(`“${MAGIC_LINK_BUTTON_LABEL}”`);
  });
});
