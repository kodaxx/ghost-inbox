import { redirect } from '@sveltejs/kit';

/**
 * SvelteKit hook that applies session-based authentication to protected routes.
 * The admin credentials are supplied via the ADMIN_USER and ADMIN_PASSWORD environment variables.
 */
export async function handle({ event, resolve }) {
  const { pathname } = event.url;
  
  // Check if user is authenticated by looking for session cookie
  const sessionCookie = event.cookies.get('session');
  const isAuthenticated = sessionCookie === 'authenticated';
  
  // Define protected and public paths
  const protectedPaths = ['/api', '/dashboard'];
  const publicPaths = ['/login', '/api/auth/login', '/api/auth/logout', '/api/health'];
  
  const isProtectedPath = protectedPaths.some((p) => pathname === p || pathname.startsWith(p));
  const isPublicPath = publicPaths.some((p) => pathname === p || pathname.startsWith(p));
  
  console.log('Auth check:', { pathname, isAuthenticated, isProtectedPath, isPublicPath, sessionCookie });
  
  // Redirect logic
  if (!isAuthenticated && isProtectedPath && !isPublicPath) {
    console.log('Redirecting to login - not authenticated and accessing protected path');
    // Redirect to login if trying to access protected path without authentication
    throw redirect(302, '/login');
  }
  
  if (isAuthenticated && pathname === '/login') {
    // Redirect to dashboard if already authenticated and trying to access login
    throw redirect(302, '/dashboard');
  }
  
  if (pathname === '/' && isAuthenticated) {
    // Redirect authenticated users from root to dashboard
    throw redirect(302, '/dashboard');
  }
  
  return resolve(event);
}