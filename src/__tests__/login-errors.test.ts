import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loginErrorMessage } from '@/lib/login-errors';
import { MAGIC_LINK_BUTTON_LABEL } from '@/lib/sign-in';

describe('loginErrorMessage', () => {
  it('Google on an address that already has an account points to the emailed link, naming the real button', () => {
    const msg = loginErrorMessage('OAuthAccountNotLinked');
    expect(msg).toContain('This email is already on Remi.');
    expect(msg).toContain('emailed link');
    expect(msg).toContain(`“${MAGIC_LINK_BUTTON_LABEL}”`);
  });

  it('the form shows that exact label on its magic-link button', () => {
    const form = readFileSync(path.join(__dirname, '..', 'app', '(auth)', 'login', 'login-form.tsx'), 'utf8');
    expect(form).toContain(': MAGIC_LINK_BUTTON_LABEL');
    expect(form).not.toContain("'Send sign-in link'");
    expect(MAGIC_LINK_BUTTON_LABEL).toBe('Send sign-in link');
  });

  it('any other code keeps the generic message; no code, no message', () => {
    expect(loginErrorMessage('Configuration')).toMatch(/^Sign-in failed\./);
    expect(loginErrorMessage(null)).toBe('');
  });
});
