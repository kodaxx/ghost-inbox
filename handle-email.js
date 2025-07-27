#!/usr/bin/env node
/*
 * handle-email.js
 *
 * This script is invoked by Postfix to process incoming mail for GhostInbox.  It reads
 * the raw email from STDIN, determines whether the message originates from an external
 * sender or from the configured destination mailbox, updates the alias database
 * accordingly and forwards the message via the local sendmail binary.  The goal is to
 * preserve the alias in the From/Reply‑To headers so that replies appear to come from
 * the alias rather than your real address.
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import Database from 'better-sqlite3';

// Configuration from environment
const domain = process.env.MY_DOMAIN || 'example.com';
const destinationEmail = process.env.REAL_EMAIL || 'you@example.com';
const dbPath = process.env.DB_PATH || '/data/aliases.db';

// Initialize security manager safely
let security = null;
async function getSecurityManager() {
  if (!security) {
    try {
      const { SecurityManager } = await import('./security/security.js');
      security = new SecurityManager();
    } catch (error) {
      console.warn('SecurityManager initialization failed:', error.message);
      return null;
    }
  }
  return security;
}

// Open database (create if necessary)
const db = new Database(dbPath);
// Ensure tables exist
db.exec(`
  CREATE TABLE IF NOT EXISTS aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alias TEXT UNIQUE NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    last_sender TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TEXT
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);
// Guarantee wildcard flag exists
const w = db.prepare('SELECT value FROM settings WHERE key = ?').get('wildcard_enabled');
if (!w) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('wildcard_enabled', 'true');
}

// Helper to determine if wildcard is enabled
function getWildcardEnabled() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('wildcard_enabled');
  return row ? row.value === 'true' : true;
}

// Database helper functions
function getAliasRecord(name) {
  return db.prepare('SELECT * FROM aliases WHERE alias = ?').get(name);
}
function createAlias(name, last_sender = null) {
  const stmt = db.prepare('INSERT OR IGNORE INTO aliases (alias, enabled, last_sender, created_at) VALUES (?, 1, ?, CURRENT_TIMESTAMP)');
  return stmt.run(name, last_sender).changes > 0;
}
function updateLastSender(name, sender) {
  return db.prepare('UPDATE aliases SET last_sender = ?, last_used_at = CURRENT_TIMESTAMP WHERE alias = ?').run(sender, name).changes > 0;
}

// Read entire stdin
async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

// Very naive email header parser.  Splits the raw message into a headers object and body.
function parseEmail(raw) {
  const lines = raw.split(/\r?\n/);
  const headers = {};
  let i = 0;
  let currentHeader = '';
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line === '') {
      i++;
      break;
    }
    if (/^\s/.test(line) && currentHeader) {
      // continuation line
      headers[currentHeader] += ' ' + line.trim();
    } else {
      const idx = line.indexOf(':');
      if (idx !== -1) {
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        currentHeader = key;
        headers[key] = value;
      }
    }
  }
  const body = lines.slice(i).join('\n');
  return { headers, body };
}

// Extract an email address from a header string (e.g. "Foo Bar <foo@bar.com>")
// Extract email address from header value (e.g., "Name <email@domain.com>" → "email@domain.com")
function extractEmailAddress(headerValue) {
  if (!headerValue) return '';
  const match = headerValue.match(/<([^>]+)>/) || headerValue.match(/([^\s<>]+@[^\s<>]+)/);
  return match ? match[1] : headerValue.trim();
}

// Extract sender IP from Received headers for security tracking
function extractSenderIP(headers) {
  const receivedHeaders = [];
  
  // Collect all Received headers (they can be multiple with different casing)
  Object.keys(headers).forEach(key => {
    if (key.toLowerCase() === 'received') {
      const value = headers[key];
      if (Array.isArray(value)) {
        receivedHeaders.push(...value);
      } else {
        receivedHeaders.push(value);
      }
    }
  });
  
  // Parse the first (most recent) Received header for sender IP
  for (const received of receivedHeaders) {
    // Look for patterns like "from [1.2.3.4]" or "from hostname (1.2.3.4)"
    const ipMatch = received.match(/from.*?\[(\d+\.\d+\.\d+\.\d+)\]/) ||
                   received.match(/from.*?\((\d+\.\d+\.\d+\.\d+)\)/) ||
                   received.match(/from.*?(\d+\.\d+\.\d+\.\d+)/);
    
    if (ipMatch && ipMatch[1]) {
      const ip = ipMatch[1];
      // Skip local/private IPs
      if (!isPrivateIP(ip)) {
        return ip;
      }
    }
  }
  
  return null;
}

// Check if IP is private/local
function isPrivateIP(ip) {
  const parts = ip.split('.').map(Number);
  
  // 127.0.0.0/8 (localhost)
  if (parts[0] === 127) return true;
  
  // 10.0.0.0/8 (private)
  if (parts[0] === 10) return true;
  
  // 172.16.0.0/12 (private)
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  
  // 192.168.0.0/16 (private)
  if (parts[0] === 192 && parts[1] === 168) return true;
  
  return false;
}

// Send an email via the local sendmail binary
function sendMail({ to, from, replyTo, subject, body }) {
  return new Promise((resolve, reject) => {
    const sendmail = spawn('/usr/sbin/sendmail', ['-t', '-oi', '-f', from]);
    sendmail.stdin.write(`From: ${from}\n`);
    sendmail.stdin.write(`To: ${to}\n`);
    if (replyTo) {
      sendmail.stdin.write(`Reply-To: ${replyTo}\n`);
    }
    sendmail.stdin.write(`Subject: ${subject}\n`);
    sendmail.stdin.write(`\n`);
    sendmail.stdin.write(body);
    sendmail.stdin.end();
    sendmail.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`sendmail exited with code ${code}`));
    });
    sendmail.on('error', reject);
  });
}

/**
 * Handle email processing - main function that can be called for testing
 * @param {string} rawEmail - Raw email content
 * @param {string} recipient - Recipient email address (optional, will try to parse from headers)
 * @returns {Promise<{success: boolean, forwarded: boolean, forwardedTo?: string, reason?: string}>}
 */
export async function handleEmail(rawEmail, recipient = null) {
  try {
    // Parse email to get recipient if not provided
    const { headers, body } = parseEmail(rawEmail);
    
    // Determine recipient
    let fullRecipient;
    if (recipient) {
      fullRecipient = recipient.toLowerCase();
    } else {
      // Try to extract from To header
      const toHeader = headers['To'] || headers['to'] || '';
      const toEmail = extractEmailAddress(toHeader);
      if (!toEmail || !toEmail.endsWith(`@${domain}`)) {
        return {
          success: false,
          forwarded: false,
          reason: 'Invalid recipient domain'
        };
      }
      fullRecipient = toEmail.toLowerCase();
    }
    
    const aliasName = fullRecipient.split('@')[0];
    const fullAlias = `${aliasName}@${domain}`;
    
    const fromHeader = headers['From'] || headers['from'];
    const sender = extractEmailAddress(fromHeader) || '';
    const subject = headers['Subject'] || headers['subject'] || '';

    // Extract sender IP from Received headers for security checking
    const senderIP = extractSenderIP(headers);
    const securityManager = await getSecurityManager();
    
    // Security check: rate limiting and IP banning
    if (senderIP && securityManager) {
      const emailCheck = await securityManager.trackEmail(senderIP);
      if (!emailCheck.allowed) {
        console.log(`Blocking email from ${senderIP}: ${emailCheck.reason}`);
        securityManager.log('WARN', `Blocked email from ${sender} (IP: ${senderIP}) to ${fullAlias}: ${emailCheck.reason}`);
        
        // Log the blocked attempt
        securityManager.db.prepare(`
          INSERT INTO security_events (ip, event_type, details, action_taken)
          VALUES (?, 'EMAIL_BLOCKED', ?, 'Email dropped')
        `).run(senderIP, `From: ${sender}, To: ${fullAlias}, Subject: ${subject}`);
        
        return {
          success: true,
          forwarded: false,
          reason: `Blocked by security: ${emailCheck.reason}`
        };
      }
      
      // Log successful email for monitoring
      securityManager.log('INFO', `Email processed from ${sender} (IP: ${senderIP}) to ${fullAlias}`);
    }

    // Determine whether this message originates from our destination mailbox
    const isFromDestination = sender.toLowerCase() === destinationEmail.toLowerCase();

    // Lookup alias
    let record = getAliasRecord(aliasName);
    if (!record) {
      // Create alias automatically if wildcard enabled
      if (getWildcardEnabled()) {
        createAlias(aliasName, isFromDestination ? null : sender);
        record = getAliasRecord(aliasName);
      } else {
        // Wildcards disabled; discard silently
        console.log(`Dropping email to ${aliasName} because wildcard disabled and alias not found`);
        return {
          success: true,
          forwarded: false,
          reason: 'Alias not found and wildcards disabled'
        };
      }
    }

    // If alias is blocked, drop the message
    if (record.enabled === 0) {
      console.log(`Dropping email to ${aliasName} because alias is blocked`);
      return {
        success: true,
        forwarded: false,
        reason: 'Alias is blocked'
      };
    }

    if (!isFromDestination) {
      // External inbound message: update last sender
      updateLastSender(aliasName, sender);
      // Compose forwarded message to our destination mailbox
      const fwdSubject = subject;
      // Include original headers in the body for context
      const fwdBody = `Forwarded message\nFrom: ${fromHeader}\nTo: ${headers['To'] || headers['to'] || ''}\nDate: ${headers['Date'] || headers['date'] || ''}\nSubject: ${subject}\n\n${body}`;
      try {
        await sendMail({
          to: destinationEmail,
          from: fullAlias,
          replyTo: fullAlias,
          subject: fwdSubject,
          body: fwdBody
        });
        console.log(`Forwarded email for alias ${aliasName} to ${destinationEmail}`);
        return {
          success: true,
          forwarded: true,
          forwardedTo: destinationEmail
        };
      } catch (err) {
        console.error('Error forwarding email', err);
        return {
          success: false,
          forwarded: false,
          reason: `SMTP error: ${err.message}`
        };
      }
    } else {
      // Message from our destination mailbox: treat as a reply to the last sender
      const dest = record.last_sender;
      if (!dest) {
        console.log(`No last_sender recorded for alias ${aliasName}; dropping reply`);
        return {
          success: true,
          forwarded: false,
          reason: 'No last sender recorded for reply'
        };
      }
      const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
      // For replies we include body as is
      try {
        await sendMail({
          to: dest,
          from: fullAlias,
          replyTo: fullAlias,
          subject: replySubject,
          body
        });
        console.log(`Relayed reply from ${destinationEmail} to ${dest} via alias ${aliasName}`);
        return {
          success: true,
          forwarded: true,
          forwardedTo: dest
        };
      } catch (err) {
        console.error('Error relaying reply', err);
        return {
          success: false,
          forwarded: false,
          reason: `SMTP error: ${err.message}`
        };
      }
    }
  } catch (error) {
    console.error('Error in handleEmail:', error);
    return {
      success: false,
      forwarded: false,
      reason: `Processing error: ${error.message}`
    };
  }
}

async function main() {
  // Determine the original alias from argument or environment
  const recipientArg = process.argv[2] || process.env.ORIGINAL_RECIPIENT;
  if (!recipientArg) {
    console.error('No recipient provided to handle-email.js');
    process.exit(1);
  }

  // Read raw email from stdin
  const rawEmail = await readStdin();
  
  // Process the email
  const result = await handleEmail(rawEmail, recipientArg);
  
  if (!result.success) {
    console.error('Email processing failed:', result.reason);
    process.exit(1);
  }
}

// Only run main if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Unhandled error in handle-email.js', err);
    process.exit(1);
  });
}