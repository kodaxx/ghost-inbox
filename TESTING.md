# Testing Guide for GhostInbox

This document provides comprehensive testing procedures for the GhostInbox email alias management system.

## Table of Contents
1. [Overview](#overview)
2. [Development Testing](#development-testing)
3. [Email System Testing](#email-system-testing)
4. [Security Testing](#security-testing)
5. [Database Testing](#database-testing)
6. [Health Check Testing](#health-check-testing)
7. [Container Testing](#container-testing)
8. [Production Testing](#production-testing)

## Overview

GhostInbox includes several testing tools and procedures to ensure system reliability:

- **test-email.js** - Real Postfix email injection testing
- **test-fail2ban.sh** - Security filter validation
- **Health API** - System status monitoring
- **Manual testing procedures** - Complete system validation

## Development Testing

### Prerequisites
```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration
```

### Running Development Server
```bash
# Start development server
npm run dev

# Access dashboard at http://localhost:5173
```

### Build Testing
```bash
# Test production build
npm run build
node build/index.js

# Verify build outputs to correct directory
ls -la build/
```

## Email System Testing

### Real Postfix Integration Testing

Use `test-email.js` for comprehensive email system testing with real Postfix integration:

```bash
# Run all email tests
node test-email.js

# Run specific test scenarios:
# 1. Basic forwarding test
# 2. Alias blocking test  
# 3. Non-existent alias test
# 4. Wildcard alias test
# 5. Database connection test
```

#### Test Scenarios

**1. Basic Email Forwarding**
- Creates test alias in database
- Injects email via Postfix
- Verifies forwarding to real email
- Cleans up test data

**2. Alias Blocking**
- Creates blocked alias (enabled=0)
- Attempts email delivery
- Verifies rejection occurs
- Tests unblocking functionality

**3. Non-existent Alias**
- Tests email to non-existent alias
- Verifies proper rejection
- Checks error handling

**4. Wildcard Testing**
- Tests wildcard alias functionality
- Verifies pattern matching
- Checks forwarding behavior

**5. Database Integration**
- Tests database connectivity
- Verifies CRUD operations
- Tests transaction handling

### Manual Email Testing

```bash
# Send test email via command line
echo "Test message" | mail -s "Test Subject" test@yourdomain.com

# Check mail queue
mailq

# View mail logs
tail -f /var/log/mail.log
```

### Gmail SMTP Configuration Testing

```bash
# Test Gmail SMTP connection
node -e "
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
});
transporter.verify((error, success) => {
  console.log(error ? 'Gmail SMTP Error:' + error : 'Gmail SMTP Ready');
});
"
```

## Security Testing

### fail2ban Configuration Testing

Use `test-fail2ban.sh` to validate security filters:

```bash
# Run fail2ban filter tests
chmod +x test-fail2ban.sh
./test-fail2ban.sh
```

#### Manual Security Testing

**Dashboard Login Protection:**
```bash
# Test login failure detection
echo "[$(date)] Login failed - invalid credentials for testuser from 192.168.1.100" >> /var/log/ghostinbox.log

# Check if fail2ban detects the failure
fail2ban-client status ghostinbox-dashboard
```

**SMTP Abuse Protection:**
```bash
# Test SMTP abuse detection
echo "$(date) mail postfix/smtpd[12345]: connect from unknown[192.168.1.200]" >> /var/log/mail.log

# Check fail2ban status
fail2ban-client status ghostinbox-smtp-abuse
```

### Security System Testing

```bash
# Test security manager functionality
node -e "
import('./security/security.js').then(({ SecurityManager }) => {
  const security = new SecurityManager();
  console.log('Security Stats:', security.getSecurityStats());
  security.logSecurityEvent('test', '192.168.1.1', 'Test event');
  console.log('Event logged successfully');
});
"

# CLI security management commands
node security/security.js stats                    # Show security statistics
node security/security.js ban 192.168.1.100 "Test ban" light    # Temporary ban
node security/security.js ban-permanent 192.168.1.101 "Persistent abuse"  # Permanent ban
node security/security.js list-bans                # List all current bans
node security/security.js check 192.168.1.100      # Check if IP is banned or should be
node security/security.js review-candidates        # Review IPs qualifying for permanent bans
node security/security.js unban 192.168.1.100      # Remove ban from IP
node security/security.js cleanup                  # Clean up expired bans

# Automated permanent ban system
# The system automatically escalates to permanent bans based on:
# - 3+ temporary bans for the same IP
# - 10+ total violations 
# - 5+ violations within 24 hours
# - 100+ emails in 5 minutes (critical spam pattern)
# - 200+ connections in 5 minutes (critical flood pattern)

# Development testing (with local paths)
DB_PATH=./data/aliases.db SECURITY_LOG_PATH=./logs/ghostinbox.log node security/security.js stats
```

### IP Blocking Testing

```bash
# Manually ban an IP for testing
fail2ban-client set ghostinbox-dashboard banip 192.168.1.100

# Check active bans
fail2ban-client status ghostinbox-dashboard

# Unban the IP
fail2ban-client set ghostinbox-dashboard unbanip 192.168.1.100
```

## Database Testing

### SQLite Database Testing

```bash
# Check database structure
sqlite3 data/aliases.db ".schema"

# View current aliases
sqlite3 data/aliases.db "SELECT * FROM aliases;"

# Test database operations
sqlite3 data/aliases.db "
INSERT INTO aliases (alias, real_email, enabled) VALUES ('test@example.com', 'real@gmail.com', 1);
SELECT * FROM aliases WHERE alias = 'test@example.com';
DELETE FROM aliases WHERE alias = 'test@example.com';
"
```

### API Database Testing

```bash
# Test aliases API endpoint
curl -H "Cookie: session=authenticated" http://localhost:3000/api/aliases

# Test alias creation
curl -X POST -H "Content-Type: application/json" \
  -H "Cookie: session=authenticated" \
  -d '{"alias":"test@example.com","realEmail":"real@gmail.com"}' \
  http://localhost:3000/api/aliases

# Test alias blocking
curl -X POST -H "Cookie: session=authenticated" \
  http://localhost:3000/api/aliases/test@example.com/block

# Test alias deletion
curl -X DELETE -H "Cookie: session=authenticated" \
  http://localhost:3000/api/aliases/test@example.com
```

## Health Check Testing

### API Health Endpoint

```bash
# Check overall system health
curl http://localhost:3000/api/health

# Check specific components
curl http://localhost:3000/api/health | jq '.database'
curl http://localhost:3000/api/health | jq '.smtp'
curl http://localhost:3000/api/health | jq '.security'
curl http://localhost:3000/api/health | jq '.ddns'
```

### Manual Health Checks

**Database Health:**
```bash
# Test database connectivity
node -e "
import('./src/lib/db.js').then(({ getDB }) => {
  const db = getDB();
  const result = db.prepare('SELECT COUNT(*) as count FROM aliases').get();
  console.log('Database accessible, alias count:', result.count);
});
"
```

**SMTP Health:**
```bash
# Check if Postfix is running
systemctl status postfix
# or
ps aux | grep postfix

# Check SMTP port
netstat -tuln | grep :25
# or
lsof -i :25
```

**Security Health:**
```bash
# Check fail2ban status
fail2ban-client status

# Check security logs
tail -f /var/log/ghostinbox.log /var/log/mail.log
```

## Container Testing

### Docker Build Testing

```bash
# Build container
docker build -t ghostinbox:test .

# Test container startup
docker run --privileged -p 3000:3000 -p 25:25 \
  -e MY_DOMAIN=test.example.com \
  -e REAL_EMAIL=test@gmail.com \
  -e ADMIN_USER=admin \
  -e ADMIN_PASSWORD=testpass \
  -v $(pwd)/data:/data \
  ghostinbox:test
```

### Container Health Testing

```bash
# Check container logs
docker logs ghostinbox-container

# Execute commands in container
docker exec -it ghostinbox-container /bin/bash

# Test services inside container
docker exec ghostinbox-container fail2ban-client status
docker exec ghostinbox-container postfix status
docker exec ghostinbox-container curl http://localhost:3000/api/health
```

### Docker Compose Testing

```bash
# Start with docker-compose
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f

# Test email functionality
docker-compose exec app node test-email.js

# Stop services
docker-compose down
```

## Production Testing

### Pre-deployment Checklist

- [ ] All environment variables configured
- [ ] Domain DNS records configured (A, MX)
- [ ] SSL certificates installed (if applicable)
- [ ] Firewall ports opened (25, 3000)
- [ ] Email authentication configured (SPF, DKIM)
- [ ] Backup procedures tested

### Production Email Testing

```bash
# Test from external email provider
# Send email to: testalias@yourdomain.com
# Verify forwarding works correctly

# Test from multiple providers
# Gmail, Outlook, Yahoo, etc.

# Test various email formats
# Plain text, HTML, attachments
```

### Production Security Testing

```bash
# Monitor security logs
tail -f /var/log/ghostinbox.log /var/log/mail.log

# Test login attempt blocking
# Make multiple failed login attempts
# Verify IP gets blocked

# Test SMTP abuse protection
# Monitor for suspicious connection attempts
# Verify automatic blocking occurs

# Review permanent ban candidates regularly
node security/security.js review-candidates

# Check specific IPs for permanent ban eligibility  
node security/security.js check <suspicious-ip>

# Monitor for automatic permanent bans in logs
grep "Automatically permanently banned" /var/log/ghostinbox.log
```

### Performance Testing

```bash
# Test multiple simultaneous connections
ab -n 100 -c 10 http://yourdomain.com:3000/

# Monitor resource usage
htop
iostat -x 1
free -h

# Test email throughput
# Send multiple emails simultaneously
# Monitor processing time
```

## Troubleshooting

### Common Issues

**Email Not Forwarding:**
1. Check Postfix logs: `tail -f /var/log/mail.log`
2. Verify DNS MX records: `dig MX yourdomain.com`
3. Test SMTP connectivity: `telnet yourdomain.com 25`
4. Check Gmail SMTP credentials

**Dashboard Not Accessible:**
1. Check application logs: `tail -f /var/log/ghostinbox.log`
2. Verify port 3000 is open: `netstat -tuln | grep :3000`
3. Test local connectivity: `curl http://localhost:3000`

**Security Not Working:**
1. Check fail2ban status: `fail2ban-client status`
2. Verify log files exist: `ls -la /var/log/ghostinbox.log /var/log/mail.log`
3. Test filter patterns: `./test-fail2ban.sh`

**Database Issues:**
1. Check file permissions: `ls -la data/aliases.db`
2. Test database connectivity: `sqlite3 data/aliases.db ".tables"`
3. Verify schema: `sqlite3 data/aliases.db ".schema"`

### Log Locations

- **Application Logs**: `/var/log/ghostinbox.log`
- **Mail Logs**: `/var/log/mail.log`
- **fail2ban Logs**: `/var/log/fail2ban.log`
- **System Logs**: `/var/log/syslog`

### Debug Commands

```bash
# Enable verbose logging
export DEBUG=*
node build/index.js

# Test individual components
node test-email.js
./test-fail2ban.sh
curl http://localhost:3000/api/health

# Monitor all logs simultaneously
tail -f /var/log/ghostinbox.log /var/log/mail.log /var/log/fail2ban.log
```

## Automated Testing

### CI/CD Integration

For automated testing in CI/CD pipelines:

```yaml
# .github/workflows/test.yml example
name: Test GhostInbox
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '20'
      - run: npm install
      - run: npm run build
      - run: docker build -t ghostinbox:test .
```

### Monitoring and Alerts

Set up monitoring for production:

1. **Health Endpoint Monitoring**: Poll `/api/health` every 5 minutes
2. **Log Monitoring**: Watch for error patterns in logs
3. **Resource Monitoring**: Monitor CPU, memory, disk usage
4. **Email Delivery Monitoring**: Track successful/failed deliveries

## Testing Schedule

### Daily
- Health endpoint checks
- Log review for errors
- fail2ban status verification

### Weekly  
- Full email testing with `test-email.js`
- Security filter testing with `test-fail2ban.sh`
- Database integrity check
- Performance monitoring review

### Monthly
- Complete production testing
- Security audit
- Backup verification
- Documentation updates

This comprehensive testing approach ensures GhostInbox operates reliably and securely in all environments.