import { json } from '@sveltejs/kit';

let security = null;

// Safely initialize security manager only when needed
async function getSecurityManager() {
  if (!security) {
    try {
      const { SecurityManager } = await import('../../../security/security.js');
      security = new SecurityManager();
    } catch (error) {
      console.warn('SecurityManager initialization failed:', error.message);
      return null;
    }
  }
  return security;
}

export async function GET({ url }) {
  try {
    const securityManager = await getSecurityManager();
    if (!securityManager) {
      return json({ error: 'Security system unavailable' }, { status: 503 });
    }
    
    const action = url.searchParams.get('action') || 'stats';
    
    switch (action) {
      case 'stats':
        const stats = securityManager.getSecurityStats();
        
        // Only access database if security manager is properly initialized
        if (!securityManager.initialized || !securityManager.db) {
          return json({
            ...stats,
            recentEvents: [],
            bannedIPs: [],
            topIPs: [],
            error: 'Security database unavailable'
          });
        }
        
        // Add recent security events
        const recentEvents = securityManager.db.prepare(`
          SELECT timestamp, ip, event_type, details, action_taken
          FROM security_events
          ORDER BY timestamp DESC
          LIMIT 50
        `).all();
        
        // Add current banned IPs
        const bannedIPs = securityManager.db.prepare(`
          SELECT ip, banned_at, ban_expires, ban_reason, ban_duration
          FROM banned_ips
          WHERE ban_expires > strftime('%s', 'now') OR is_permanent = 1
          ORDER BY banned_at DESC
        `).all();
        
        // Add IP tracking info
        const topIPs = securityManager.db.prepare(`
          SELECT ip, email_count_day, connection_count_hour, violation_count, 
                 ban_count, last_seen, first_seen
          FROM ip_tracking
          WHERE last_seen > strftime('%s', 'now') - 86400
          ORDER BY email_count_day DESC
          LIMIT 20
        `).all();
        
        return json({
          ...stats,
          recentEvents: recentEvents.map(event => ({
            ...event,
            timestamp: new Date(event.timestamp * 1000).toISOString()
          })),
          bannedIPs: bannedIPs.map(ban => ({
            ...ban,
            banned_at: new Date(ban.banned_at * 1000).toISOString(),
            ban_expires: new Date(ban.ban_expires * 1000).toISOString()
          })),
          topIPs: topIPs.map(ip => ({
            ...ip,
            last_seen: new Date(ip.last_seen * 1000).toISOString(),
            first_seen: new Date(ip.first_seen * 1000).toISOString()
          }))
        });
        
      case 'cleanup':
        await securityManager.cleanupExpiredBans();
        return json({ success: true, message: 'Expired bans cleaned up' });
        
      default:
        return json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Security API error:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST({ request }) {
  try {
    const securityManager = await getSecurityManager();
    if (!securityManager) {
      return json({ error: 'Security system unavailable' }, { status: 503 });
    }
    
    const { action, ip, reason } = await request.json();
    
    switch (action) {
      case 'ban':
        if (!ip) {
          return json({ error: 'IP address required' }, { status: 400 });
        }
        
        const banned = await securityManager.banIP(ip, reason || 'Manual ban', 'medium');
        if (banned) {
          return json({ success: true, message: `IP ${ip} has been banned` });
        } else {
          return json({ error: 'Failed to ban IP (may be whitelisted)' }, { status: 400 });
        }
        
      case 'unban':
        if (!ip) {
          return json({ error: 'IP address required' }, { status: 400 });
        }
        
        await securityManager.unbanIP(ip);
        return json({ success: true, message: `IP ${ip} has been unbanned` });
        
      default:
        return json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Security API error:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
