import { randomBytes } from 'crypto';

export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export function getBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'https://remishowmanager.co.uk'
  );
}
