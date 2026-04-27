import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

const publicRoutes = ['/', '/login', '/register', '/forgot-password', '/reset-password'];
const publicPrefixes = ['/shows', '/dog', '/api/auth', '/api/trpc', '/api/upload', '/api/webhooks', '/api/catalogue', '/api/schedule', '/api/judge-contract', '/api/share-events', '/api/shares', '/about', '/help', '/privacy', '/terms', '/invite', '/pricing', '/promo', '/features'];

// Routes that match a public prefix but require authentication
const authRequiredPatterns = [
  /^\/shows\/[^/]+\/enter(\/|$)/,
  /^\/shows\/[^/]+\/entries\/[^/]+\/edit(\/|$)/,
];

function isPublicRoute(pathname: string) {
  if (publicRoutes.includes(pathname)) return true;
  return publicPrefixes.some((prefix) => pathname.startsWith(prefix));
}

const authRoutes = ['/login', '/register', '/forgot-password', '/reset-password'];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthenticated = !!req.auth;

  // Redirect authenticated users away from auth pages
  if (isAuthenticated && authRoutes.includes(pathname)) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  // Check routes that require auth even if they match a public prefix
  if (!isAuthenticated && authRequiredPatterns.some((p) => p.test(pathname))) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Allow public routes
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Protect everything else
  if (!isAuthenticated) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|serwist|icons|apple-touch-icon|sitemap.xml|robots.txt|\\.well-known).*)'],
};
