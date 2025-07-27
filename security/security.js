#!/usr/bin/env node
/**
 * Security monitoring and IP management for GhostInbox
 * Monitors mail logs and implements rate limiting with IP banning
 */

import fs from 'fs';
import path from 'path';
import { spawn, exec } from 'child_process';
import Database from 'better-sqlite3';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Configuration
const config = {
  // Rate limits for personal use server
  maxEmailsPerIP: {
    perMinute: 10,    // Max 10 emails per minute per IP
    perHour: 50,      // Max 50 emails per hour per IP  
    perDay: 200       // Max 200 emails per day per IP
  },
  
  maxConnectionsPerIP: {
    perMinute: 20,    // Max 20 connections per minute per IP
    perHour: 100      // Max 100 connections per hour per IP
  },
  
  // Ban durations (in seconds)
  banDuration: {
    light: 1800,      // 30 minutes for first offense
    medium: 7200,     // 2 hours for repeat offense
    heavy: 86400      // 24 hours for persistent abuse
  },
  
  // Whitelist (trusted IPs that are never banned)
  whitelist: [
    '127.0.0.1',
    '::1',
    // Add your trusted IPs here
  ],
  
  // Automatic permanent ban criteria
  permanentBanThresholds: {
    maxBanCount: 3,        // Permanent ban after 3 temporary bans
    maxViolationCount: 10, // Permanent ban after 10 violations total
    timeWindow: 86400,     // Consider violations within 24 hours
    rapidViolations: 5,    // 5 violations within timeWindow triggers permanent ban
    
    // Specific violation patterns that trigger immediate permanent bans
    criticalPatterns: {
      maxEmailsInShortTime: 100,  // 100+ emails in 5 minutes = immediate permanent ban
      maxConnectionsInShortTime: 200, // 200+ connections in 5 minutes = immediate permanent ban
      timeWindow: 300  // 5 minutes
    }
  },
  
  logFile: process.env.SECURITY_LOG_PATH || '/var/log/ghostinbox.log',
  dbPath: process.env.DB_PATH || '/data/aliases.db'
};

class SecurityManager {
  constructor() {
    this.db = null;
    this.initialized = false;
  }
  
  // Lazy initialization to ensure database directory exists
  ensureInitialized() {
    if (this.initialized) return;
    
    try {
      // Ensure database directory exists
      const dbDir = path.dirname(config.dbPath);
      console.log(`Creating database directory: ${dbDir}`);
      
      // Create directory recursively, but handle if parent doesn't exist
      try {
        if (!fs.existsSync(dbDir)) {
          fs.mkdirSync(dbDir, { recursive: true });
        }
      } catch (dirError) {
        // If we can't create the directory, try to create parent first
        console.warn(`Failed to create ${dbDir}, trying to create parent directories...`);
        const parentDir = path.dirname(dbDir);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
        fs.mkdirSync(dbDir, { recursive: true });
      }
      
      // Ensure the database file can be created
      if (!fs.existsSync(config.dbPath)) {
        fs.writeFileSync(config.dbPath, '');
      }
      
      this.db = new Database(config.dbPath);
      this.initDatabase();
      this.setupLogging();
      this.initialized = true;
      console.log('SecurityManager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize SecurityManager:', error);
      // Don't throw - allow graceful degradation
      this.initialized = false;
    }
  }
  
  initDatabase() {
    // Create security tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ip_tracking (
        ip TEXT PRIMARY KEY,
        email_count_minute INTEGER DEFAULT 0,
        email_count_hour INTEGER DEFAULT 0,
        email_count_day INTEGER DEFAULT 0,
        connection_count_minute INTEGER DEFAULT 0,
        connection_count_hour INTEGER DEFAULT 0,
        last_reset_minute INTEGER DEFAULT 0,
        last_reset_hour INTEGER DEFAULT 0,
        last_reset_day INTEGER DEFAULT 0,
        first_seen INTEGER DEFAULT (strftime('%s', 'now')),
        last_seen INTEGER DEFAULT (strftime('%s', 'now')),
        violation_count INTEGER DEFAULT 0,
        ban_count INTEGER DEFAULT 0
      );
      
      CREATE TABLE IF NOT EXISTS banned_ips (
        ip TEXT PRIMARY KEY,
        banned_at INTEGER DEFAULT (strftime('%s', 'now')),
        ban_expires INTEGER,
        ban_reason TEXT,
        ban_duration INTEGER,
        is_permanent INTEGER DEFAULT 0
      );
      
      CREATE TABLE IF NOT EXISTS security_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        ip TEXT,
        event_type TEXT,
        details TEXT,
        action_taken TEXT
      );
    `);
  }
  
  setupLogging() {
    // Ensure log file exists
    if (!fs.existsSync(config.logFile)) {
      fs.writeFileSync(config.logFile, '');
    }
  }
  
  log(level, message) {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} [${level}] ${message}\n`;
    
    console.log(logMessage.trim());
    
    // Only write to file if security system is initialized
    if (this.initialized && fs.existsSync(config.logFile)) {
      try {
        fs.appendFileSync(config.logFile, logMessage);
      } catch (error) {
        console.warn('Failed to write to security log file:', error.message);
      }
    }
  }
  
  isWhitelisted(ip) {
    return config.whitelist.includes(ip);
  }
  
  // Check if IP should be permanently banned based on behavior patterns
  shouldPermanentlyBan(ip) {
    this.ensureInitialized();
    if (!this.initialized || !this.db || this.isWhitelisted(ip)) {
      return { shouldBan: false, reason: 'system unavailable or whitelisted' };
    }
    
    const now = Math.floor(Date.now() / 1000);
    const timeWindow = config.permanentBanThresholds.timeWindow;
    const criticalTimeWindow = config.permanentBanThresholds.criticalPatterns.timeWindow;
    
    // Get IP tracking data
    const ipRecord = this.db.prepare('SELECT * FROM ip_tracking WHERE ip = ?').get(ip);
    if (!ipRecord) {
      return { shouldBan: false, reason: 'no tracking data' };
    }
    
    // Check for critical patterns (immediate permanent ban)
    const recentCriticalTime = now - criticalTimeWindow;
    
    // Check for massive email spam in short time
    if (ipRecord.last_seen > recentCriticalTime) {
      const currentMinute = Math.floor(now / 60);
      const ipMinute = Math.floor(ipRecord.last_seen / 60);
      
      // If they've been active in the last 5 minutes and hit critical thresholds
      if (currentMinute - ipMinute <= 5) {
        if (ipRecord.email_count_minute > config.permanentBanThresholds.criticalPatterns.maxEmailsInShortTime) {
          return { 
            shouldBan: true, 
            reason: `Critical pattern: ${ipRecord.email_count_minute} emails in 5 minutes (threshold: ${config.permanentBanThresholds.criticalPatterns.maxEmailsInShortTime})`,
            severity: 'critical-email-spam'
          };
        }
        
        if (ipRecord.connection_count_minute > config.permanentBanThresholds.criticalPatterns.maxConnectionsInShortTime) {
          return { 
            shouldBan: true, 
            reason: `Critical pattern: ${ipRecord.connection_count_minute} connections in 5 minutes (threshold: ${config.permanentBanThresholds.criticalPatterns.maxConnectionsInShortTime})`,
            severity: 'critical-connection-flood'
          };
        }
      }
    }
    
    // Check ban count threshold
    if (ipRecord.ban_count >= config.permanentBanThresholds.maxBanCount) {
      return { 
        shouldBan: true, 
        reason: `Exceeded ban count threshold: ${ipRecord.ban_count} bans (max: ${config.permanentBanThresholds.maxBanCount})`,
        severity: 'repeat-offender'
      };
    }
    
    // Check total violation count
    if (ipRecord.violation_count >= config.permanentBanThresholds.maxViolationCount) {
      return { 
        shouldBan: true, 
        reason: `Exceeded violation count threshold: ${ipRecord.violation_count} violations (max: ${config.permanentBanThresholds.maxViolationCount})`,
        severity: 'persistent-violator'
      };
    }
    
    // Check for rapid violations within time window
    const recentViolations = this.db.prepare(`
      SELECT COUNT(*) as count FROM security_events 
      WHERE ip = ? AND timestamp > ? AND event_type IN ('BAN', 'RATE_LIMIT')
    `).get(ip, now - timeWindow);
    
    if (recentViolations.count >= config.permanentBanThresholds.rapidViolations) {
      return { 
        shouldBan: true, 
        reason: `Rapid violations: ${recentViolations.count} violations in ${timeWindow/3600} hours (max: ${config.permanentBanThresholds.rapidViolations})`,
        severity: 'rapid-violations'
      };
    }
    
    return { shouldBan: false, reason: 'within acceptable limits' };
  }
  
  async isBanned(ip) {
    this.ensureInitialized();
    if (!this.initialized || !this.db) return false;
    
    const now = Math.floor(Date.now() / 1000);
    const banned = this.db.prepare(`
      SELECT * FROM banned_ips 
      WHERE ip = ? AND (is_permanent = 1 OR ban_expires > ?)
    `).get(ip, now);
    
    return banned !== undefined;
  }
  
  async trackConnection(ip) {
    this.ensureInitialized();
    if (!this.initialized || !this.db) {
      return { allowed: true, reason: 'security system unavailable' };
    }
    
    if (this.isWhitelisted(ip) || await this.isBanned(ip)) {
      return { allowed: !await this.isBanned(ip), reason: 'whitelisted or banned' };
    }
    
    const now = Math.floor(Date.now() / 1000);
    const currentMinute = Math.floor(now / 60);
    const currentHour = Math.floor(now / 3600);
    
    // Get or create IP tracking record
    let ipRecord = this.db.prepare('SELECT * FROM ip_tracking WHERE ip = ?').get(ip);
    
    if (!ipRecord) {
      this.db.prepare(`
        INSERT INTO ip_tracking (ip, last_reset_minute, last_reset_hour)
        VALUES (?, ?, ?)
      `).run(ip, currentMinute, currentHour);
      ipRecord = this.db.prepare('SELECT * FROM ip_tracking WHERE ip = ?').get(ip);
    }
    
    // Reset counters if time periods have passed
    const updates = {};
    
    if (ipRecord.last_reset_minute < currentMinute) {
      updates.connection_count_minute = 0;
      updates.last_reset_minute = currentMinute;
    }
    
    if (ipRecord.last_reset_hour < currentHour) {
      updates.connection_count_hour = 0;
      updates.last_reset_hour = currentHour;
    }
    
    // Apply resets
    if (Object.keys(updates).length > 0) {
      const updateFields = Object.keys(updates).map(field => `${field} = ?`).join(', ');
      const updateValues = Object.values(updates);
      this.db.prepare(`UPDATE ip_tracking SET ${updateFields} WHERE ip = ?`)
        .run(...updateValues, ip);
      
      // Refresh record
      ipRecord = this.db.prepare('SELECT * FROM ip_tracking WHERE ip = ?').get(ip);
    }
    
    // Check limits
    const newMinuteCount = ipRecord.connection_count_minute + 1;
    const newHourCount = ipRecord.connection_count_hour + 1;
    
    if (newMinuteCount > config.maxConnectionsPerIP.perMinute) {
      // Check if this should trigger a permanent ban
      const permanentBanCheck = this.shouldPermanentlyBan(ip);
      if (permanentBanCheck.shouldBan) {
        await this.banIP(ip, `Auto-permanent ban: ${permanentBanCheck.reason}`, 'heavy', true);
        this.log('CRITICAL', `Automatically permanently banned IP ${ip}: ${permanentBanCheck.reason}`);
        return { allowed: false, reason: 'Permanently banned for persistent abuse' };
      }
      
      await this.banIP(ip, 'Too many connections per minute', 'light');
      
      // Log rate limit event for pattern tracking
      this.db.prepare(`
        INSERT INTO security_events (ip, event_type, details, action_taken)
        VALUES (?, 'RATE_LIMIT', 'Connection limit exceeded per minute', 'Temporary ban applied')
      `).run(ip);
      
      return { allowed: false, reason: 'Rate limit exceeded: connections per minute' };
    }
    
    if (newHourCount > config.maxConnectionsPerIP.perHour) {
      // Check if this should trigger a permanent ban
      const permanentBanCheck = this.shouldPermanentlyBan(ip);
      if (permanentBanCheck.shouldBan) {
        await this.banIP(ip, `Auto-permanent ban: ${permanentBanCheck.reason}`, 'heavy', true);
        this.log('CRITICAL', `Automatically permanently banned IP ${ip}: ${permanentBanCheck.reason}`);
        return { allowed: false, reason: 'Permanently banned for persistent abuse' };
      }
      
      await this.banIP(ip, 'Too many connections per hour', 'medium');
      
      // Log rate limit event for pattern tracking
      this.db.prepare(`
        INSERT INTO security_events (ip, event_type, details, action_taken)
        VALUES (?, 'RATE_LIMIT', 'Connection limit exceeded per hour', 'Temporary ban applied')
      `).run(ip);
      
      return { allowed: false, reason: 'Rate limit exceeded: connections per hour' };
    }
    
    // Update counters
    this.db.prepare(`
      UPDATE ip_tracking 
      SET connection_count_minute = ?, connection_count_hour = ?, last_seen = ?
      WHERE ip = ?
    `).run(newMinuteCount, newHourCount, now, ip);
    
    return { allowed: true, reason: 'within limits' };
  }
  
  async trackEmail(ip) {
    this.ensureInitialized();
    if (!this.initialized || !this.db) {
      return { allowed: true, reason: 'security system unavailable' };
    }
    
    if (this.isWhitelisted(ip) || await this.isBanned(ip)) {
      return { allowed: !await this.isBanned(ip), reason: 'whitelisted or banned' };
    }
    
    const now = Math.floor(Date.now() / 1000);
    const currentMinute = Math.floor(now / 60);
    const currentHour = Math.floor(now / 3600);
    const currentDay = Math.floor(now / 86400);
    
    // Get IP tracking record
    let ipRecord = this.db.prepare('SELECT * FROM ip_tracking WHERE ip = ?').get(ip);
    
    if (!ipRecord) {
      this.db.prepare(`
        INSERT INTO ip_tracking (ip, last_reset_minute, last_reset_hour, last_reset_day)
        VALUES (?, ?, ?, ?)
      `).run(ip, currentMinute, currentHour, currentDay);
      ipRecord = this.db.prepare('SELECT * FROM ip_tracking WHERE ip = ?').get(ip);
    }
    
    // Reset counters if time periods have passed
    const updates = {};
    
    if (ipRecord.last_reset_minute < currentMinute) {
      updates.email_count_minute = 0;
      updates.last_reset_minute = currentMinute;
    }
    
    if (ipRecord.last_reset_hour < currentHour) {
      updates.email_count_hour = 0;
      updates.last_reset_hour = currentHour;
    }
    
    if (ipRecord.last_reset_day < currentDay) {
      updates.email_count_day = 0;
      updates.last_reset_day = currentDay;
    }
    
    // Apply resets
    if (Object.keys(updates).length > 0) {
      const updateFields = Object.keys(updates).map(field => `${field} = ?`).join(', ');
      const updateValues = Object.values(updates);
      this.db.prepare(`UPDATE ip_tracking SET ${updateFields} WHERE ip = ?`)
        .run(...updateValues, ip);
      
      // Refresh record
      ipRecord = this.db.prepare('SELECT * FROM ip_tracking WHERE ip = ?').get(ip);
    }
    
    // Check limits
    const newMinuteCount = ipRecord.email_count_minute + 1;
    const newHourCount = ipRecord.email_count_hour + 1;
    const newDayCount = ipRecord.email_count_day + 1;
    
    if (newMinuteCount > config.maxEmailsPerIP.perMinute) {
      // Check if this should trigger a permanent ban
      const permanentBanCheck = this.shouldPermanentlyBan(ip);
      if (permanentBanCheck.shouldBan) {
        await this.banIP(ip, `Auto-permanent ban: ${permanentBanCheck.reason}`, 'heavy', true);
        this.log('CRITICAL', `Automatically permanently banned IP ${ip}: ${permanentBanCheck.reason}`);
        return { allowed: false, reason: 'Permanently banned for persistent abuse' };
      }
      
      await this.banIP(ip, 'Too many emails per minute', 'light');
      
      // Log rate limit event for pattern tracking
      this.db.prepare(`
        INSERT INTO security_events (ip, event_type, details, action_taken)
        VALUES (?, 'RATE_LIMIT', 'Email limit exceeded per minute', 'Temporary ban applied')
      `).run(ip);
      
      return { allowed: false, reason: 'Rate limit exceeded: emails per minute' };
    }
    
    if (newHourCount > config.maxEmailsPerIP.perHour) {
      // Check if this should trigger a permanent ban
      const permanentBanCheck = this.shouldPermanentlyBan(ip);
      if (permanentBanCheck.shouldBan) {
        await this.banIP(ip, `Auto-permanent ban: ${permanentBanCheck.reason}`, 'heavy', true);
        this.log('CRITICAL', `Automatically permanently banned IP ${ip}: ${permanentBanCheck.reason}`);
        return { allowed: false, reason: 'Permanently banned for persistent abuse' };
      }
      
      await this.banIP(ip, 'Too many emails per hour', 'medium');
      
      // Log rate limit event for pattern tracking
      this.db.prepare(`
        INSERT INTO security_events (ip, event_type, details, action_taken)
        VALUES (?, 'RATE_LIMIT', 'Email limit exceeded per hour', 'Temporary ban applied')
      `).run(ip);
      
      return { allowed: false, reason: 'Rate limit exceeded: emails per hour' };
    }
    
    if (newDayCount > config.maxEmailsPerIP.perDay) {
      // Check if this should trigger a permanent ban
      const permanentBanCheck = this.shouldPermanentlyBan(ip);
      if (permanentBanCheck.shouldBan) {
        await this.banIP(ip, `Auto-permanent ban: ${permanentBanCheck.reason}`, 'heavy', true);
        this.log('CRITICAL', `Automatically permanently banned IP ${ip}: ${permanentBanCheck.reason}`);
        return { allowed: false, reason: 'Permanently banned for persistent abuse' };
      }
      
      await this.banIP(ip, 'Too many emails per day', 'heavy');
      
      // Log rate limit event for pattern tracking
      this.db.prepare(`
        INSERT INTO security_events (ip, event_type, details, action_taken)
        VALUES (?, 'RATE_LIMIT', 'Email limit exceeded per day', 'Temporary ban applied')
      `).run(ip);
      
      return { allowed: false, reason: 'Rate limit exceeded: emails per day' };
    }
    
    // Update counters
    this.db.prepare(`
      UPDATE ip_tracking 
      SET email_count_minute = ?, email_count_hour = ?, email_count_day = ?, last_seen = ?
      WHERE ip = ?
    `).run(newMinuteCount, newHourCount, newDayCount, now, ip);
    
    return { allowed: true, reason: 'within limits' };
  }
  
  async banIP(ip, reason, severity = 'medium', permanent = false) {
    this.ensureInitialized();
    if (!this.initialized || !this.db) {
      console.warn(`Cannot ban IP ${ip}: security system unavailable`);
      return false;
    }
    
    if (this.isWhitelisted(ip)) {
      this.log('INFO', `Attempted to ban whitelisted IP ${ip} for: ${reason}`);
      return false;
    }
    
    const now = Math.floor(Date.now() / 1000);
    const duration = permanent ? 0 : config.banDuration[severity];
    const expiresAt = permanent ? 0 : now + duration;
    
    // Check if already banned
    const existing = this.db.prepare('SELECT * FROM banned_ips WHERE ip = ?').get(ip);
    
    if (existing) {
      // Update existing ban - make permanent if requested, or extend duration
      if (permanent) {
        this.db.prepare(`
          UPDATE banned_ips 
          SET ban_expires = 0, ban_reason = ?, ban_duration = 0, is_permanent = 1
          WHERE ip = ?
        `).run(reason, ip);
        
        this.log('WARN', `Made permanent ban for IP ${ip}: ${reason}`);
      } else {
        // Extend ban or make it more severe
        const newDuration = Math.max(duration, existing.ban_duration * 1.5);
        const newExpiresAt = now + newDuration;
        
        this.db.prepare(`
          UPDATE banned_ips 
          SET ban_expires = ?, ban_reason = ?, ban_duration = ?
          WHERE ip = ?
        `).run(newExpiresAt, reason, newDuration, ip);
        
        this.log('WARN', `Extended ban for IP ${ip}: ${reason} (duration: ${newDuration}s)`);
      }
    } else {
      // New ban
      this.db.prepare(`
        INSERT INTO banned_ips (ip, ban_expires, ban_reason, ban_duration, is_permanent)
        VALUES (?, ?, ?, ?, ?)
      `).run(ip, expiresAt, reason, duration, permanent ? 1 : 0);
      
      if (permanent) {
        this.log('WARN', `Permanently banned IP ${ip}: ${reason}`);
      } else {
        this.log('WARN', `Banned IP ${ip}: ${reason} (duration: ${duration}s)`);
      }
    }
    
    // Update violation count
    this.db.prepare(`
      UPDATE ip_tracking 
      SET violation_count = violation_count + 1, ban_count = ban_count + 1
      WHERE ip = ?
    `).run(ip);
    
    // Log security event
    const actionTaken = permanent ? 'Permanently banned' : `Banned for ${duration} seconds`;
    this.db.prepare(`
      INSERT INTO security_events (ip, event_type, details, action_taken)
      VALUES (?, 'BAN', ?, ?)
    `).run(ip, reason, actionTaken);
    
    // Apply iptables rule
    await this.applyIPTablesRule(ip, 'DROP');
    
    return true;
  }
  
  async unbanIP(ip) {
    this.ensureInitialized();
    if (!this.initialized || !this.db) {
      console.warn(`Cannot unban IP ${ip}: security system unavailable`);
      return;
    }
    
    this.db.prepare('DELETE FROM banned_ips WHERE ip = ?').run(ip);
    await this.applyIPTablesRule(ip, 'ACCEPT');
    this.log('INFO', `Unbanned IP ${ip}`);
  }
  
  async applyIPTablesRule(ip, action) {
    try {
      if (action === 'DROP') {
        await execAsync(`iptables -I INPUT -s ${ip} -j DROP`);
      } else {
        await execAsync(`iptables -D INPUT -s ${ip} -j DROP`);
      }
    } catch (error) {
      this.log('ERROR', `Failed to apply iptables rule for ${ip}: ${error.message}`);
    }
  }
  
  async cleanupExpiredBans() {
    this.ensureInitialized();
    if (!this.initialized || !this.db) {
      console.warn('Cannot cleanup expired bans: security system unavailable');
      return;
    }
    
    const now = Math.floor(Date.now() / 1000);
    const expired = this.db.prepare(`
      SELECT ip FROM banned_ips 
      WHERE is_permanent = 0 AND ban_expires <= ?
    `).all(now);
    
    for (const ban of expired) {
      await this.unbanIP(ban.ip);
    }
    
    if (expired.length > 0) {
      this.log('INFO', `Cleaned up ${expired.length} expired bans`);
    }
  }
  
  getSecurityStats() {
    this.ensureInitialized();
    if (!this.initialized || !this.db) {
      return {
        totalBannedIPs: 0,
        activeBans: 0,
        recentEvents: 0,
        topViolators: [],
        error: 'Security system unavailable'
      };
    }
    
    const stats = {
      totalBannedIPs: this.db.prepare('SELECT COUNT(*) as count FROM banned_ips').get().count,
      activeBans: this.db.prepare("SELECT COUNT(*) as count FROM banned_ips WHERE ban_expires > strftime('%s', 'now') OR is_permanent = 1").get().count,
      recentEvents: this.db.prepare("SELECT COUNT(*) as count FROM security_events WHERE timestamp > strftime('%s', 'now') - 3600").get().count,
      topViolators: this.db.prepare(`
        SELECT ip, violation_count, ban_count, last_seen 
        FROM ip_tracking 
        WHERE violation_count > 0 
        ORDER BY violation_count DESC 
        LIMIT 10
      `).all()
    };
    
    return stats;
  }
}

// Export for use in other modules
export { SecurityManager, config };

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const security = new SecurityManager();
  const command = process.argv[2];
  
  switch (command) {
    case 'stats':
      console.log(JSON.stringify(security.getSecurityStats(), null, 2));
      break;
      
    case 'cleanup':
      await security.cleanupExpiredBans();
      break;
      
    case 'ban':
      if (process.argv[3]) {
        const ip = process.argv[3];
        const reason = process.argv[4] || 'Manual ban';
        const severity = process.argv[5] || 'medium';
        await security.banIP(ip, reason, severity, false);
      } else {
        console.log('Usage: node security.js ban <ip> [reason] [severity]');
        console.log('  severity: light, medium, heavy');
      }
      break;
      
    case 'ban-permanent':
      if (process.argv[3]) {
        const ip = process.argv[3];
        const reason = process.argv[4] || 'Manual permanent ban';
        await security.banIP(ip, reason, 'heavy', true);
      } else {
        console.log('Usage: node security.js ban-permanent <ip> [reason]');
      }
      break;
      
    case 'unban':  
      if (process.argv[3]) {
        await security.unbanIP(process.argv[3]);
      } else {
        console.log('Usage: node security.js unban <ip>');
      }
      break;
      
    case 'list-bans':
      security.ensureInitialized();
      if (security.initialized && security.db) {
        const bans = security.db.prepare(`
          SELECT ip, banned_at, ban_expires, ban_reason, is_permanent,
                 CASE 
                   WHEN is_permanent = 1 THEN 'PERMANENT'
                   WHEN ban_expires > strftime('%s', 'now') THEN 'ACTIVE'
                   ELSE 'EXPIRED'
                 END as status
          FROM banned_ips 
          ORDER BY banned_at DESC
        `).all();
        
        console.log('Current IP bans:');
        console.table(bans.map(ban => ({
          IP: ban.ip,
          Status: ban.status,
          Reason: ban.ban_reason,
          'Banned At': new Date(ban.banned_at * 1000).toISOString(),
          'Expires At': ban.is_permanent ? 'NEVER' : new Date(ban.ban_expires * 1000).toISOString()
        })));
      } else {
        console.log('Security system unavailable');
      }
      break;
      
    case 'check':
      if (process.argv[3]) {
        const ip = process.argv[3];
        const isBanned = await security.isBanned(ip);
        console.log(`IP ${ip} is ${isBanned ? 'BANNED' : 'NOT BANNED'}`);
        
        if (isBanned) {
          security.ensureInitialized();
          const banInfo = security.db.prepare('SELECT * FROM banned_ips WHERE ip = ?').get(ip);
          if (banInfo) {
            console.log('Ban details:', {
              reason: banInfo.ban_reason,
              bannedAt: new Date(banInfo.banned_at * 1000).toISOString(),
              expiresAt: banInfo.is_permanent ? 'NEVER' : new Date(banInfo.ban_expires * 1000).toISOString(),
              permanent: banInfo.is_permanent === 1
            });
          }
        } else {
          // Check if they should be permanently banned
          const permanentBanCheck = security.shouldPermanentlyBan(ip);
          if (permanentBanCheck.shouldBan) {
            console.log(`⚠️  WARNING: IP ${ip} meets criteria for permanent ban:`);
            console.log(`   Reason: ${permanentBanCheck.reason}`);
            console.log(`   Severity: ${permanentBanCheck.severity}`);
            console.log(`   Use: node security.js ban-permanent ${ip} "Auto-escalation: ${permanentBanCheck.reason}"`);
          } else {
            console.log(`IP ${ip} is within acceptable behavior limits.`);
          }
        }
      } else {
        console.log('Usage: node security.js check <ip>');
      }
      break;
      
    case 'review-candidates':
      security.ensureInitialized();
      if (security.initialized && security.db) {
        console.log('Reviewing IPs that may qualify for permanent bans...\n');
        
        // Get IPs with high violation or ban counts
        const candidates = security.db.prepare(`
          SELECT ip, violation_count, ban_count, last_seen, first_seen
          FROM ip_tracking 
          WHERE (violation_count > 3 OR ban_count > 1)
          AND ip NOT IN (SELECT ip FROM banned_ips WHERE is_permanent = 1)
          ORDER BY violation_count DESC, ban_count DESC
          LIMIT 20
        `).all();
        
        if (candidates.length === 0) {
          console.log('No IPs currently meet permanent ban criteria.');
          break;
        }
        
        console.log('Permanent ban candidates:');
        for (const candidate of candidates) {
          const permanentBanCheck = security.shouldPermanentlyBan(candidate.ip);
          if (permanentBanCheck.shouldBan) {
            console.log(`\n🚨 ${candidate.ip}:`);
            console.log(`   Violations: ${candidate.violation_count}, Bans: ${candidate.ban_count}`);
            console.log(`   First seen: ${new Date(candidate.first_seen * 1000).toISOString()}`);
            console.log(`   Last seen: ${new Date(candidate.last_seen * 1000).toISOString()}`);
            console.log(`   Reason: ${permanentBanCheck.reason}`);
            console.log(`   Severity: ${permanentBanCheck.severity}`);
            console.log(`   Command: node security.js ban-permanent ${candidate.ip} "Auto-escalation: ${permanentBanCheck.reason}"`);
          } else {
            console.log(`\n⚠️  ${candidate.ip}: ${candidate.violation_count} violations, ${candidate.ban_count} bans (monitoring)`);
          }
        }
      } else {
        console.log('Security system unavailable');
      }
      break;
      
    default:
      console.log('Usage: node security.js <command> [args]');
      console.log('Commands:');
      console.log('  stats                       - Show security statistics');
      console.log('  cleanup                     - Clean up expired bans');
      console.log('  ban <ip> [reason] [severity]   - Ban an IP (light/medium/heavy)');
      console.log('  ban-permanent <ip> [reason]    - Permanently ban an IP');
      console.log('  unban <ip>                  - Unban an IP');
      console.log('  list-bans                   - List all current bans');
      console.log('  check <ip>                  - Check if an IP is banned or should be');
      console.log('  review-candidates           - Review IPs that qualify for permanent bans');
      console.log('');
      console.log('Automatic permanent ban criteria:');
      console.log(`  - ${config.permanentBanThresholds.maxBanCount}+ temporary bans`);
      console.log(`  - ${config.permanentBanThresholds.maxViolationCount}+ total violations`);
      console.log(`  - ${config.permanentBanThresholds.rapidViolations}+ violations in ${config.permanentBanThresholds.timeWindow/3600} hours`);
      console.log(`  - ${config.permanentBanThresholds.criticalPatterns.maxEmailsInShortTime}+ emails in 5 minutes`);
      console.log(`  - ${config.permanentBanThresholds.criticalPatterns.maxConnectionsInShortTime}+ connections in 5 minutes`);
  }
}
