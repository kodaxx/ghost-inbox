import { json } from '@sveltejs/kit';

let security = null;

// Safely initialize security manager only when needed
async function getSecurityManager() {
  if (!security) {
    try {
      const { SecurityManager } = await import('../../../../../security/security.js');
      security = new SecurityManager();
    } catch (error) {
      console.warn('SecurityManager initialization failed:', error.message);
      return null;
    }
  }
  return security;
}

function getClientIP(request) {
  // Try various headers for real IP
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }
  
  const xRealIP = request.headers.get('x-real-ip');
  if (xRealIP) {
    return xRealIP;
  }
  
  // Fallback - won't work well in Docker but better than nothing
  return request.headers.get('cf-connecting-ip') || 
         request.headers.get('x-client-ip') || 
         'unknown';
}

export async function POST({ request, cookies }) {
  const clientIP = getClientIP(request);
  const securityManager = await getSecurityManager();
  
  try {
    const { username, password } = await request.json();
    console.log(`Login attempt for username: ${username} from IP: ${clientIP}`);
    
    // Check if IP is banned (only if security manager is available)
    if (securityManager && await securityManager.isBanned(clientIP)) {
      securityManager.log('WARN', `Login attempt from banned IP: ${clientIP}`);
      return json({ message: 'Access denied' }, { status: 403 });
    }
    
    const expectedUser = process.env.ADMIN_USER || 'admin';
    const expectedPass = process.env.ADMIN_PASSWORD || 'changeme';
    
    console.log('Expected credentials:', { expectedUser, expectedPass });
    
    if (username === expectedUser && password === expectedPass) {
      // Set session cookie
      cookies.set('session', 'authenticated', {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 7 // 7 days
      });
      
      console.log(`Login successful for ${username} from ${clientIP}`);
      if (securityManager) {
        securityManager.log('INFO', `Successful login: ${username} from ${clientIP}`);
      }
      return json({ success: true });
    } else {
      // Format log message for fail2ban parsing
      console.log(`[${new Date().toISOString()}] Login failed - invalid credentials for ${username} from ${clientIP}`);
      
      if (securityManager) {
        securityManager.log('WARN', `Failed login attempt: ${username} from ${clientIP}`);
        
        // Track failed login attempt
        await securityManager.trackConnection(clientIP);
        
        // Log security event
        securityManager.db.prepare(`
          INSERT INTO security_events (ip, event_type, details, action_taken)
          VALUES (?, 'LOGIN_FAILED', ?, 'Tracked attempt')
        `).run(clientIP, `Username: ${username}`);
      }
      
      return json({ message: 'Invalid credentials' }, { status: 401 });
    }
  } catch (error) {
    console.error('Login error:', error);
    if (securityManager) {
      securityManager.log('ERROR', `Login error from ${clientIP}: ${error.message}`);
    }
    return json({ message: 'Login failed' }, { status: 500 });
  }
}
