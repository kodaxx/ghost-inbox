# GhostInbox Security System

GhostInbox includes comprehensive security protections to prevent spam relay abuse, rate limit excessive connections, and automatically ban malicious IPs.

## Security Features

### 🛡️ **Multi-Layer Protection**
- **Postfix Restrictions**: Prevents open relay abuse with strict sender/recipient validation
- **Rate Limiting**: Limits connections and emails per IP address for personal use thresholds
- **IP Banning**: Automatic temporary and permanent bans for abusive behavior
- **Fail2ban Integration**: Industry-standard intrusion prevention system
- **Real-time Monitoring**: Tracks all security events and provides detailed statistics

### 📊 **Rate Limits (Personal Server Optimized)**
- **Email Limits per IP**:
  - 10 emails per minute
  - 50 emails per hour  
  - 200 emails per day
- **Connection Limits per IP**:
  - 20 connections per minute
  - 100 connections per hour

### 🚫 **Automatic Banning**
- **Light Ban**: 30 minutes for first-time rate limit violations
- **Medium Ban**: 2 hours for repeat offenses
- **Heavy Ban**: 24 hours for persistent abuse
- **Escalation**: Repeat violations result in longer ban durations

## Security Monitoring

### Dashboard Integration
The main dashboard includes real-time security status:
- Active banned IP count
- Recent security events
- Fail2ban service status
- Security system health

### Security API Endpoints

#### Get Security Statistics
```bash
GET /api/security?action=stats
```
Returns comprehensive security statistics including:
- Banned IP addresses with ban reasons and expiration times
- Recent security events (email blocks, login failures, etc.)
- Top IP addresses by email volume
- System health metrics

#### Manual IP Management
```bash
# Ban an IP address
POST /api/security
{
  "action": "ban",
  "ip": "1.2.3.4", 
  "reason": "Manual ban - suspicious activity"
}

# Unban an IP address  
POST /api/security
{
  "action": "unban",
  "ip": "1.2.3.4"
}
```

#### Cleanup Expired Bans
```bash
GET /api/security?action=cleanup
```

### Command Line Tools

#### Security Manager CLI
```bash
# View security statistics
node security/security.js stats

# Clean up expired bans
node security/security.js cleanup

# Manually ban an IP
node security/security.js ban 1.2.3.4 "Spam relay attempt"

# Unban an IP
node security/security.js unban 1.2.3.4
```

## Postfix Security Configuration

### Anti-Spam Restrictions
- **RBL Checking**: Automatic blocking using Spamhaus and SpamCop blacklists
- **Sender Validation**: Rejects non-FQDN senders and unknown domains
- **Recipient Protection**: Blocks common spam target addresses (abuse@, admin@, etc.)
- **HELO Validation**: Requires and validates HELO/EHLO commands
- **Connection Limits**: Restricts concurrent connections per IP

### Rate Limiting
- **20 emails per minute** per client IP
- **10 concurrent connections** per client IP  
- **5 total connections** per client session
- **10MB message size limit**

## Fail2ban Configuration

### Protected Services
- **postfix-auth**: Protects against SMTP authentication failures
- **postfix-rbl**: Blocks IPs caught by RBL services
- **postfix-spam**: Detects and blocks spam attempts
- **ghostinbox-smtp-abuse**: Custom filter for SMTP abuse patterns
- **ghostinbox-dashboard**: Protects web dashboard login

### Ban Policies
- **3-5 violations** trigger temporary bans
- **10 violations** for SMTP abuse trigger 2-hour bans
- **Escalating durations** for repeat offenders
- **Email notifications** for significant security events (optional)

## Security Event Tracking

All security events are logged in the database with:
- **Timestamp**: When the event occurred
- **IP Address**: Source of the security event
- **Event Type**: Type of violation (BAN, EMAIL_BLOCKED, LOGIN_FAILED, etc.)
- **Details**: Specific information about the event
- **Action Taken**: What security measure was applied

## IP Whitelist

Trusted IP addresses that are never banned:
- `127.0.0.1` (localhost)
- `::1` (IPv6 localhost)
- Add your trusted IPs to the whitelist in `security/security.js`

## Docker Security Requirements

The security system requires additional Docker privileges:

```yaml
services:
  ghostinbox:
    build: .
    # Required for iptables and security features
    privileged: true
    cap_add:
      - NET_ADMIN
      - SYS_ADMIN
    volumes:
      - aliases-data:/data
      - /lib/modules:/lib/modules:ro
```

## Security Best Practices

### 🔒 **Recommended Setup**
1. **Strong Passwords**: Use complex passwords for `ADMIN_PASSWORD`
2. **Firewall**: Only expose necessary ports (25, 3000)
3. **Reverse Proxy**: Use nginx/Caddy with SSL for HTTPS
4. **Regular Monitoring**: Check security stats regularly
5. **Log Monitoring**: Monitor `/var/log/mail.log` for abuse patterns

### 🚨 **Warning Signs**
- **High ban count**: More than 10-20 banned IPs may indicate ongoing attack
- **Repeated violations**: Same IPs repeatedly triggering bans
- **High email volumes**: Unusual spikes in email volume from unknown IPs
- **Login failures**: Multiple failed dashboard login attempts

### 📈 **Maintenance Tasks**
- **Weekly**: Review security statistics and top IP addresses
- **Monthly**: Clean up expired bans and review logs
- **As needed**: Update IP whitelist for trusted sources
- **Regular**: Update Docker container and dependencies

## Troubleshooting

### Common Issues

#### Fail2ban Not Starting
```bash
# Check fail2ban logs
docker exec ghostinbox journalctl -u fail2ban

# Restart fail2ban
docker exec ghostinbox fail2ban-client restart
```

#### Legitimate IPs Getting Banned
```bash
# Check why an IP was banned
node security/security.js stats | grep "1.2.3.4"

# Unban legitimate IP
node security/security.js unban 1.2.3.4

# Add to whitelist in security/security.js
```

#### High Resource Usage
```bash
# Check security system performance
docker exec ghostinbox top
docker exec ghostinbox iptables -L -n | wc -l

# Clean up expired rules
node security/security.js cleanup
```

### Performance Impact
- **Minimal CPU overhead**: ~1-2% for normal operation
- **Memory usage**: ~10-20MB for security monitoring
- **Storage**: Security events stored in SQLite database
- **Network**: Negligible impact on mail throughput

## Advanced Configuration

### Custom Rate Limits
Edit `security/security.js` to adjust rate limits:
```javascript
const config = {
  maxEmailsPerIP: {
    perMinute: 10,    // Adjust for your needs
    perHour: 50,      
    perDay: 200       
  },
  // ... other settings
};
```

### Email Notifications
Configure email alerts for security events:
```bash
# Edit fail2ban jail configuration
destemail = your-alert-email@domain.com
```

### Custom Filters
Add custom fail2ban filters in `security/filter.d/` for specific abuse patterns.

The security system provides robust protection while maintaining good performance for personal email server use.
