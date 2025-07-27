#!/bin/sh
set -e

# Set default values if environment variables are not set
MY_DOMAIN="${MY_DOMAIN:-example.com}"
REAL_EMAIL="${REAL_EMAIL:-yourusername@gmail.com}"
GMAIL_APP_PASSWORD="${GMAIL_APP_PASSWORD:-yourapppassword}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-changeme}"
DB_PATH="${DB_PATH:-./data/aliases.db}"
SESSION_SECRET="${SESSION_SECRET:-your-secret-key-change-this-in-production}"

echo "Starting GhostInbox with security protections..."

# Ensure the database file exists
if [ ! -f "$DB_PATH" ]; then
  mkdir -p "$(dirname "$DB_PATH")"
  touch "$DB_PATH"
fi

# Configure security and monitoring
echo "Setting up security infrastructure..."

# Ensure rsyslog isn't already running, or start it if it's not
if pgrep rsyslogd > /dev/null; then
  echo "rsyslog is already running."
else
  # Remove stale pid file if it exists
  if [ -f "/var/run/rsyslogd.pid" ]; then
    echo "Removing stale rsyslog pid file..."
    sudo rm /var/run/rsyslogd.pid
  fi
  echo "Starting rsyslog..."
  sudo rsyslogd
fi

# Ensure log files exist with correct permissions
echo "Ensuring log files exist..."
sudo mkdir -p /var/log
sudo touch /var/log/mail.log
sudo touch /var/log/ghostinbox.log
sudo chmod 644 /var/log/mail.log /var/log/ghostinbox.log

# Setup fail2ban configuration
echo "Configuring fail2ban..."
sudo mkdir -p /etc/fail2ban/jail.d
sudo mkdir -p /etc/fail2ban/filter.d

# Copy fail2ban configuration files
if [ -f "./security/fail2ban-jail.local" ]; then
  sudo sed \
    -e "s/{{MY_DOMAIN}}/${MY_DOMAIN}/g" \
    -e "s/{{REAL_EMAIL}}/${REAL_EMAIL}/g" \
    ./security/fail2ban-jail.local | sudo tee /etc/fail2ban/jail.d/ghostinbox.conf
fi

# Copy custom filters
if [ -f "./security/filter.d/ghostinbox-smtp-abuse.conf" ]; then
  sudo cp ./security/filter.d/ghostinbox-smtp-abuse.conf /etc/fail2ban/filter.d/
fi

if [ -f "./security/filter.d/ghostinbox-dashboard.conf" ]; then
  sudo cp ./security/filter.d/ghostinbox-dashboard.conf /etc/fail2ban/filter.d/
fi

# Start fail2ban with elevated privileges
# Check if fail2ban is already running
if ! pgrep -x "fail2ban-server" > /dev/null; then
    echo "Starting fail2ban..."
    fail2ban-server -b
else
    echo "fail2ban is already running"
fi

# Configure Postfix with security settings
echo "Configuring Postfix security..."
if [ -f /etc/postfix/main.cf.template ]; then
  sudo sed \
    -e "s/{{MY_DOMAIN}}/${MY_DOMAIN}/g" \
    -e "s/{{REAL_EMAIL}}/${REAL_EMAIL}/g" \
    -e "s/{{GMAIL_APP_PASSWORD}}/${GMAIL_APP_PASSWORD}/g" \
    /etc/postfix/main.cf.template | sudo tee /etc/postfix/main.cf
fi

# Setup recipient access control
if [ -f ./postfix/recipient_access.template ]; then
  sudo sed \
    -e "s/{{MY_DOMAIN}}/${MY_DOMAIN}/g" \
    ./postfix/recipient_access.template | sudo tee /etc/postfix/recipient_access

  # Generate hash database for Postfix
  sudo postmap /etc/postfix/recipient_access
fi

# Fix Postfix configuration and ensure it’s up-to-date
echo "Upgrading Postfix configuration..."
sudo postfix upgrade-configuration

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
sudo postfix start

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
  sudo fail2ban-client stop 2>/dev/null || true
  echo "Stopping Postfix..."
  sudo postfix stop 2>/dev/null || true
  exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Start the SvelteKit server
echo "Starting GhostInbox application..."

# Ensure log directory exists and create the log file
sudo mkdir -p /var/log
sudo touch /var/log/ghostinbox.log

# Start the application with logging to file
node build/index.js >> /var/log/ghostinbox.log 2>&1
