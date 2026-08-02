import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

const PUBLIC_PATHS = new Set(['', '/login', '/register']);

function isPublicPath(pathname: string): boolean {
  const withoutLocale = pathname.replace(/^\/(fr|en)/, '') || '';
  return PUBLIC_PATHS.has(withoutLocale);
}

export default function middleware(request: NextRequest) {
  const response = intlMiddleware(request);
  if (!isPublicPath(request.nextUrl.pathname)) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return response;
}

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
