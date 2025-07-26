#!/bin/sh
set -e

echo "Starting GhostInbox with security protections..."

# Ensure the database file exists
if [ ! -f "$DB_PATH" ]; then
  mkdir -p "$(dirname "$DB_PATH")"
  touch "$DB_PATH"
fi

# Configure security and monitoring
echo "Setting up security infrastructure..."

# Start rsyslog for proper logging
rsyslogd

# Setup fail2ban configuration
echo "Configuring fail2ban..."
mkdir -p /etc/fail2ban/jail.d
mkdir -p /etc/fail2ban/filter.d

# Copy fail2ban configuration files
if [ -f "./security/fail2ban-jail.local" ]; then
  sed \
    -e "s/{{MY_DOMAIN}}/${MY_DOMAIN}/g" \
    -e "s/{{REAL_EMAIL}}/${REAL_EMAIL}/g" \
    ./security/fail2ban-jail.local > /etc/fail2ban/jail.d/ghostinbox.conf
fi

# Copy custom filters
if [ -f "./security/filter.d/ghostinbox-smtp-abuse.conf" ]; then
  cp ./security/filter.d/ghostinbox-smtp-abuse.conf /etc/fail2ban/filter.d/
fi

if [ -f "./security/filter.d/ghostinbox-dashboard.conf" ]; then
  cp ./security/filter.d/ghostinbox-dashboard.conf /etc/fail2ban/filter.d/
fi

# Start fail2ban
echo "Starting fail2ban..."
fail2ban-server -b

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

# Start Postfix in the background
echo "Starting Postfix..."
postfix start

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
node build/index.js