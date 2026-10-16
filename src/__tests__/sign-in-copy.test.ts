import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { MAGIC_LINK_BUTTON_LABEL, signInHref, seeOrderInEmailCopy, seeOrderLaterCopy } from '@/lib/sign-in';

describe('sign-in wording has one owner', () => {
  it('the login form still has the button the copy tells people to choose', () => {
    const src = fs.readFileSync(path.join(__dirname, '../app/(auth)/login/login-form.tsx'), 'utf8');
    expect(src).toContain(`'${MAGIC_LINK_BUTTON_LABEL}'`);
  });
  it('builds an encoded callback link', () => {
    expect(signInHref('/shows/a-b/enter')).toBe('/login?callbackUrl=%2Fshows%2Fa-b%2Fenter');
  });
  it('names the email and the button', () => {
    expect(seeOrderLaterCopy('a@b.co')).toContain('sign in with a@b.co');
    expect(seeOrderInEmailCopy('a@b.co')).toContain(`“${MAGIC_LINK_BUTTON_LABEL}”`);
  });
});
