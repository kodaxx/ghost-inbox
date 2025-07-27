#!/bin/bash
set -e

# Set default values if environment variables are not set
MY_DOMAIN="${MY_DOMAIN:-example.com}"
REAL_EMAIL="${REAL_EMAIL:-yourusername@gmail.com}"
GMAIL_APP_PASSWORD="${GMAIL_APP_PASSWORD:-yourapppassword}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-changeme}"
DB_PATH="${DB_PATH:-/data/aliases.db}"
SESSION_SECRET="${SESSION_SECRET:-your-secret-key-change-this-in-production}"

echo "Starting GhostInbox with security protections..."

# Ensure the database file exists
if [ ! -f "$DB_PATH" ]; then
  mkdir -p "$(dirname "$DB_PATH")"
  touch "$DB_PATH"
fi

# Configure security and monitoring
echo "Setting up security infrastructure..."

# Ensure DNS is working for Gmail SMTP
echo "Configuring DNS for reliable Gmail SMTP access..."
cat > /etc/resolv.conf << EOF
nameserver 8.8.8.8
nameserver 8.8.4.4
nameserver 1.1.1.1
search localdomain
EOF

echo "Testing DNS resolution..."
if nslookup smtp.gmail.com > /dev/null 2>&1; then
    echo "✅ DNS resolution working correctly"
    nslookup smtp.gmail.com | head -10
    
    # Add Gmail SMTP to hosts file as backup for container DNS issues
    GMAIL_IP=$(nslookup smtp.gmail.com 8.8.8.8 | grep "Address:" | grep -v "#" | tail -1 | awk '{print $2}')
    if [ ! -z "$GMAIL_IP" ]; then
        echo "$GMAIL_IP smtp.gmail.com" >> /etc/hosts
        echo "Added smtp.gmail.com ($GMAIL_IP) to hosts file as backup"
        
        # Start with hostname, but we'll have IP fallback ready in SASL
        echo "Configuring Postfix to use Gmail SMTP hostname (with IP fallback in SASL)..."
        postconf -e "relayhost = [smtp.gmail.com]:587"
    fi
else
    echo "❌ Warning: Cannot resolve smtp.gmail.com, will use IP directly"
    # Fallback to known Gmail IP
    GMAIL_IP="74.125.130.108"
    echo "$GMAIL_IP smtp.gmail.com" >> /etc/hosts
    echo "Added fallback smtp.gmail.com ($GMAIL_IP) to hosts file"
    postconf -e "relayhost = [$GMAIL_IP]:587"
fi

# Start rsyslog in Docker-friendly way
echo "Starting rsyslog..."
# Remove stale pid file if it exists
rm -f /var/run/rsyslogd.pid
rsyslogd

# Ensure log files exist with correct permissions
echo "Ensuring log files exist..."
mkdir -p /var/log
touch /var/log/mail.log
touch /var/log/ghostinbox.log
chmod 644 /var/log/mail.log /var/log/ghostinbox.log

# Setup fail2ban configuration
echo "Configuring fail2ban..."
mkdir -p /etc/fail2ban/jail.d
mkdir -p /etc/fail2ban/filter.d

# Copy fail2ban configuration files and disable default jails
if [ -f "./security/fail2ban-jail.local" ]; then
  sed \
    -e "s/{{MY_DOMAIN}}/${MY_DOMAIN}/g" \
    -e "s/{{REAL_EMAIL}}/${REAL_EMAIL}/g" \
    ./security/fail2ban-jail.local > /etc/fail2ban/jail.d/ghostinbox.conf
fi

# Explicitly disable problematic default jails
cat > /etc/fail2ban/jail.d/disable-defaults.conf << EOF
[sshd]
enabled = false

[postfix]
enabled = false

[postfix-rbl]
enabled = false

[postfix-sasl]
enabled = false
EOF

# Copy custom filters
if [ -f "./security/filter.d/ghostinbox-smtp-abuse.conf" ]; then
  cp ./security/filter.d/ghostinbox-smtp-abuse.conf /etc/fail2ban/filter.d/
fi

if [ -f "./security/filter.d/ghostinbox-dashboard.conf" ]; then
  cp ./security/filter.d/ghostinbox-dashboard.conf /etc/fail2ban/filter.d/
fi

# Ensure log files exist before starting fail2ban
touch /var/log/mail.log /var/log/ghostinbox.log

# Start fail2ban with elevated privileges
# Check if fail2ban is already running
echo "Starting fail2ban..."
if ! ps aux | grep -q "[f]ail2ban-server"; then
    echo "Testing fail2ban configuration..."
    fail2ban-client -t || echo "Warning: fail2ban configuration test failed"
    
    echo "Starting fail2ban server..."
    fail2ban-server -b -v
    
    # Give fail2ban a moment to start
    sleep 3
    
    # Check status
    if ps aux | grep -q "[f]ail2ban-server"; then
        echo "fail2ban started successfully"
        fail2ban-client status || echo "Could not get fail2ban status"
    else
        echo "Warning: fail2ban may not have started properly"
    fi
else
    echo "fail2ban is already running"
fi

# Configure Postfix with security settings
echo "Configuring Postfix security..."
if [ -f /etc/postfix/main.cf.template ]; then
  sed \
    -e "s/{{MY_DOMAIN}}/${MY_DOMAIN}/g" \
    -e "s/{{REAL_EMAIL}}/${REAL_EMAIL}/g" \
    -e "s/{{GMAIL_APP_PASSWORD}}/${GMAIL_APP_PASSWORD}/g" \
    /etc/postfix/main.cf.template > /etc/postfix/main.cf
fi

# Setup recipient access control
if [ -f ./postfix/recipient_access.template ]; then
  sed \
    -e "s/{{MY_DOMAIN}}/${MY_DOMAIN}/g" \
    ./postfix/recipient_access.template > /etc/postfix/recipient_access

  # Generate hash database for Postfix
  postmap /etc/postfix/recipient_access
fi

# Fix Postfix configuration and ensure it's up-to-date
echo "Checking Postfix configuration..."
# Test configuration first
postfix check || echo "Warning: Postfix configuration check failed"

# Only run upgrade-configuration if needed and it's safe
if [ -f "/usr/lib/postfix/sbin/post-install" ]; then
    echo "Running Postfix upgrade configuration..."
    postfix upgrade-configuration 2>/dev/null || echo "Warning: Postfix upgrade failed, continuing with existing config"
else
    echo "Skipping Postfix upgrade (post-install not available)"
fi

# Create SASL password file for Gmail authentication AFTER postfix upgrade
echo "Creating SASL password file (after Postfix upgrade)..."
if [ -z "$REAL_EMAIL" ] || [ -z "$GMAIL_APP_PASSWORD" ]; then
    echo "❌ ERROR: REAL_EMAIL or GMAIL_APP_PASSWORD not set"
    exit 1
fi

# Get Gmail SMTP IP for fallback
echo "Resolving Gmail SMTP IP address..."
GMAIL_IP=$(nslookup smtp.gmail.com 8.8.8.8 | grep -A 10 "Non-authoritative answer:" | grep "Address:" | head -1 | awk '{print $2}')
if [ -z "$GMAIL_IP" ]; then
    # Fallback to common Gmail IP
    GMAIL_IP="74.125.130.108"
    echo "⚠️  Using fallback Gmail IP: $GMAIL_IP"
else
    echo "✅ Resolved Gmail SMTP IP: $GMAIL_IP"
fi

# Create SASL password file with both hostname and IP entries
cat > /etc/postfix/sasl_passwd << EOF
[smtp.gmail.com]:587 ${REAL_EMAIL}:${GMAIL_APP_PASSWORD}
[${GMAIL_IP}]:587 ${REAL_EMAIL}:${GMAIL_APP_PASSWORD}
EOF

chmod 600 /etc/postfix/sasl_passwd
postmap /etc/postfix/sasl_passwd

# Verify SASL files were created successfully
if [ ! -f "/etc/postfix/sasl_passwd" ] || [ ! -f "/etc/postfix/sasl_passwd.db" ]; then
    echo "❌ ERROR: Failed to create SASL password files after upgrade"
    exit 1
else
    echo "✅ SASL password files created successfully after Postfix upgrade"
    echo "SASL entries created for both hostname and IP:"
    cat /etc/postfix/sasl_passwd
    ls -la /etc/postfix/sasl_passwd*
fi

# Ensure critical services are properly configured
echo "Verifying Postfix master.cf..."
if ! grep -q "postlog" /etc/postfix/master.cf; then
    echo "Adding missing postlog service to master.cf..."
    echo "postlog   unix-dgram n  -       n       -       1       postlogd" >> /etc/postfix/master.cf
fi

# Wait for DNS to be fully ready before starting Postfix
echo "Waiting for DNS resolution to be stable..."
for i in {1..10}; do
    if nslookup smtp.gmail.com > /dev/null 2>&1; then
        echo "DNS resolution confirmed for smtp.gmail.com"
        break
    else
        echo "Waiting for DNS... attempt $i/10"
        sleep 2
    fi
done

# Final DNS test
if ! nslookup smtp.gmail.com > /dev/null 2>&1; then
    echo "Warning: DNS resolution still failing for smtp.gmail.com"
    echo "Current DNS servers:"
    cat /etc/resolv.conf
else
    echo "DNS ready - smtp.gmail.com resolves correctly"
fi

# Start security cleanup daemon
echo "Starting security monitoring..."
(
  while true; do
    sleep 300  # Run every 5 minutes
    node ./security/security.js cleanup 2>/dev/null || true
  done
) &
SECURITY_PID=$!

# Start Dynamic DNS updater if enabled
if [ "$DDNS_ENABLED" = "true" ]; then
  echo "Starting Dynamic DNS updater..."
  if [ -f "./ddns/update.js" ]; then
    node ./ddns/update.js --daemon &
    DDNS_PID=$!
    echo "Dynamic DNS updater started with PID $DDNS_PID"
  else
    echo "Warning: DDNS enabled but ddns/update.js not found"
  fi
fi

# Start Postfix in the background with elevated privileges
echo "Starting Postfix..."
# Check configuration before starting
if postfix check; then
    postfix start
    if [ $? -eq 0 ]; then
        echo "Postfix started successfully"
        
        # Give Postfix a moment to initialize
        sleep 3
        
        # Flush any cached DNS failures and retry queued messages
        echo "Flushing Postfix DNS cache and mail queue..."
        postfix flush
        
        # Force retry of deferred messages
        postqueue -f
        
        echo "Postfix fully initialized and queue flushed"
    else
        echo "Warning: Postfix start may have failed"
        # Try to get status
        postfix status || true
    fi
else
    echo "Error: Postfix configuration check failed"
    echo "Attempting to start anyway..."
    postfix start || echo "Postfix failed to start"
fi

# Graceful shutdown handler
cleanup() {
  echo "Shutting down services..."
  if [ ! -z "$DDNS_PID" ]; then
    echo "Stopping Dynamic DNS updater..."
    kill $DDNS_PID 2>/dev/null || true
  fi
  if [ ! -z "$SECURITY_PID" ]; then
    echo "Stopping security monitor..."
    kill $SECURITY_PID 2>/dev/null || true
  fi
  echo "Stopping fail2ban..."
  fail2ban-client stop 2>/dev/null || true
  echo "Stopping Postfix..."
  postfix stop 2>/dev/null || true
  exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Start the SvelteKit server
echo "Starting GhostInbox application..."

# Ensure log directory exists and create the log file
mkdir -p /var/log
touch /var/log/ghostinbox.log

# Start the application with logging to file
node build/index.js >> /var/log/ghostinbox.log 2>&1
